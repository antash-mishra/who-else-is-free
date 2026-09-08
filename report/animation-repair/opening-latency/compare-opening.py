#!/usr/bin/env python3
"""Bounded, emulator-only ABBA comparison. This file does nothing until invoked."""
import argparse
import hashlib
import json
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path('/Users/antash/workspace/who-else-is-free')
UI = Path('/tmp/weif-animation-benchmark/ui.py')
ADB = ['adb', '-s', 'emulator-5554']
PACKAGE = 'com.whoelseisfree.app'

def command(args, timeout=90):
    return subprocess.check_output(args, text=True, stderr=subprocess.STDOUT, timeout=timeout)

def emulator_only():
    if command(ADB + ['shell', 'getprop', 'ro.kernel.qemu']).strip() != '1':
        raise RuntimeError('Refusing non-emulator target')

def clocks():
    result = {'host_wall_seconds': time.time(), 'host_monotonic_seconds': time.monotonic()}
    try:
        result['device_uptime'] = command(ADB + ['shell', 'cat', '/proc/uptime'], timeout=15).strip()
        result['device_wall_seconds'] = command(ADB + ['shell', 'date', '+%s'], timeout=15).strip()
    except Exception as error:
        result['device_clock_error'] = str(error)
    return result

def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')

def verify_feed(out, attempts=1):
    """Use existing ui.py; require Discover and the fixture card at injection coordinates."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    for i in range(attempts):
        tag = 'opening-guard-' + uuid.uuid4().hex
        status = {'attempt': i, 'host_monotonic_seconds': time.monotonic()}
        try:
            # Raw labels stay in local capture files; console output contains status only.
            command([sys.executable, str(UI), tag], timeout=70)
            src = UI.parent / (tag + '.xml')
            xml = src.read_text()
            nodes = list(ET.fromstring(xml).iter('node'))
            discover = any(n.get('text') == 'Discover' for n in nodes)
            card = False
            for node in nodes:
                label = node.get('content-desc', '')
                if 'Animation test 1,' not in label or node.get('clickable') != 'true' or node.get('enabled') != 'true':
                    continue
                bounds = [int(x) for x in re.findall(r'\d+', node.get('bounds', ''))]
                if len(bounds) == 4 and bounds[0] <= 100 < bounds[2] and bounds[1] <= 410 < bounds[3]:
                    card = True
            status.update(discover=discover, fixture_card_at_tap=card, ready=discover and card)
            shutil.move(str(src), str(out / f'{i:02d}.xml'))
            shutil.move(str(UI.parent / (tag + '.png')), str(out / f'{i:02d}.png'))
            save(out / f'{i:02d}.json', status)
            if status['ready']:
                return
        except Exception as error:
            status.update(ready=False, error=str(error))
            save(out / f'{i:02d}.json', status)
        if i + 1 < attempts:
            time.sleep(1)
    raise RuntimeError('Discover/fixture card readiness verification failed; no tap injected')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk_a', type=Path)
    parser.add_argument('apk_b', type=Path)
    parser.add_argument('output_prefix', type=Path, help='New output directory (must not exist)')
    parser.add_argument('--apk-c', type=Path, help='Optional third variant: use ABCCBA balanced blocks')
    args = parser.parse_args()
    emulator_only()
    apks = {key: path.resolve(strict=True) for key, path in [('A', args.apk_a), ('B', args.apk_b)]}
    if args.apk_c:
        apks['C'] = args.apk_c.resolve(strict=True)
    paired_sequence = ['A', 'B', 'C', 'C', 'B', 'A'] if args.apk_c else ['A', 'B', 'B', 'A']
    sequence = paired_sequence + list(apks)
    out = args.output_prefix.resolve()
    out.mkdir(parents=True, exist_ok=False)
    metadata = {'sequence': sequence, 'paired_sequence': paired_sequence, 'emulator': 'emulator-5554',
                'fixed_ready_wait_seconds': 5,
                'state': 'Existing fixture account/app data and disk caches retained; process restart is not cache-cold or first-ever install.',
                'warmup': 'Each block first Details open is measured separately; it serves as warm-up for the following three repeated opens.',
                'guard': 'Discover and enabled fixture card containing (100,410) verified using ui.py before every opening tap.',
                'apks': {k: {'path': str(p), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'bytes': p.stat().st_size} for k, p in apks.items()},
                'started': clocks(), 'blocks': [], 'status': 'running'}
    save(out / 'comparison.json', metadata)
    source = (REPO / 'scripts/performance/input-latency/run.py').read_text()
    needle = "range(1 if mode=='pilot' else 7)"
    if source.count(needle) != 1:
        raise RuntimeError('Unexpected runner source; refusing automatic patch')
    source = source.replace(needle, "range(1 if mode=='pilot' else 3)")
    # A temporary helper preserves exact marker schema/trial indices, adding guards only outside measured windows.
    imports = "\nimport importlib.util\n_spec=importlib.util.spec_from_file_location('opening_guard', " + repr(str(Path(__file__).resolve())) + ")\n_guard=importlib.util.module_from_spec(_spec);_spec.loader.exec_module(_guard)\n_guard_counter=0\n"
    source = source.replace('def open_card():\n', imports + 'def open_card():\n global _guard_counter\n _guard.verify_feed(out/("pre-open-"+str(_guard_counter)));_guard_counter+=1\n')
    needle = "print(json.dumps(trials[-1]),flush=True);time.sleep(.5)"
    if source.count(needle) != 1:
        raise RuntimeError('Unexpected normal trial footer')
    source = source.replace(needle, "print(json.dumps(trials[-1]),flush=True)\n   if not unmounted:raise RuntimeError('Page did not unmount; stopping comparison')\n   time.sleep(.5)")
    helper = out / 'run-three.py'
    helper.write_text(source)
    shutil.copy2(REPO / 'scripts/performance/input-latency/analyze.py', out / 'analyze.py')
    def capture(block, label, mode):
        target = out / block['directory'] / label
        log_path = target.parent / (label + '-progress.log')
        try:
            with log_path.open('w') as output:
                proc = subprocess.Popen([sys.executable, str(helper), str(target), mode], stdout=output, stderr=subprocess.STDOUT, text=True)
                deadline = time.monotonic() + 240
                with log_path.open() as reader:
                    while proc.poll() is None:
                        text = reader.read()
                        if text:
                            print(text, end='', flush=True)
                        if time.monotonic() > deadline:
                            proc.send_signal(signal.SIGINT)
                            try:
                                proc.wait(timeout=10)
                            except subprocess.TimeoutExpired:
                                proc.kill(); proc.wait()
                            raise RuntimeError('Capture timed out; stopping comparison')
                        time.sleep(.25)
                    text = reader.read()
                    if text:
                        print(text, end='', flush=True)
            if target.exists():
                shutil.copy2(log_path, target / 'runner.stdout')
            if proc.returncode:
                raise RuntimeError(f'Capture exited {proc.returncode}; see {log_path}')
        finally:
            if (target / 'trials.json').exists():
                result = command([sys.executable, str(out / 'analyze.py'), str(target)], timeout=30)
                (target / 'analyzer.stdout').write_text(result)
                trials = json.loads((target / 'trials.json').read_text())
                block.setdefault('outcomes', {})[label] = {
                    'trials': len(trials),
                    'shared_open_completed': sum(t.get('shared_open', False) for t in trials),
                    'shared_open_not_observed': sum(not t.get('shared_open', False) for t in trials),
                    'shared_close_completed': sum(t.get('shared_close', False) for t in trials),
                    'shared_close_not_observed': sum(not t.get('shared_close', False) for t in trials),
                    'classification_note': 'Absent shared endpoint is fallback/incomplete, not proof of missed input; inspect card-press, page markers and screenshots.'
                }
                save(out / 'comparison.json', metadata)
    try:
        for index, variant in enumerate(sequence):
            block = {'index': index, 'variant': variant, 'directory': f'{index:02d}-{variant}',
                     'kind': ('ABCCBA' if args.apk_c else 'ABBA') if index < len(paired_sequence) else 'additional-process-first-only', 'started': clocks(), 'status': 'running'}
            metadata['blocks'].append(block)
            folder = out / block['directory']; folder.mkdir()
            save(out / 'comparison.json', metadata)
            print(json.dumps({'block': index, 'variant': variant, 'status': 'installing'}), flush=True)
            (folder / 'install.txt').write_text(command(ADB + ['install', '-r', str(apks[variant])], timeout=180))
            command(ADB + ['shell', 'am', 'force-stop', PACKAGE])
            (folder / 'launch.txt').write_text(command(ADB + ['shell', 'am', 'start', '-W', '-n', PACKAGE + '/.MainActivity']))
            verify_feed(folder / 'launch-ready', attempts=5)
            block['feed_ready'] = clocks()
            time.sleep(5)
            capture(block, 'process-first', 'pilot')
            if index < len(paired_sequence):
                capture(block, 'repeated', 'normal')
            block.update(status='complete', finished=clocks())
            save(out / 'comparison.json', metadata)
        metadata['status'] = 'complete'
    except Exception as error:
        metadata.update(status='failed', error=str(error))
        if metadata['blocks']:
            metadata['blocks'][-1].update(status='failed', error=str(error))
        raise
    finally:
        metadata['finished'] = clocks()
        save(out / 'comparison.json', metadata)

if __name__ == '__main__':
    main()
