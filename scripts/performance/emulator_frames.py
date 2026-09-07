#!/usr/bin/env python3
"""Capture repeatable emulator-only animation windows; no production API writes.

Start on Discover with a seeded first card visible. Coordinates are explicit
arguments so a different emulator layout is never silently assumed. Gfxinfo
is secondary evidence; use the accompanying Perfetto trace for presentation
jank. Recording is intentionally separate from performance capture.
"""
import argparse
import csv
import io
import json
import pathlib
import subprocess
import time


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--device', default='emulator-5554')
    p.add_argument('--output', type=pathlib.Path, required=True)
    p.add_argument('--tap', nargs=2, type=int, required=True)
    p.add_argument('--ages', default='15,25,35,40,45,60,120')
    p.add_argument('--repeat', type=int, default=0)
    args = p.parse_args()
    if not args.device.startswith('emulator-'):
        p.error('Only local Android emulators may be targeted')
    args.output.mkdir(parents=True, exist_ok=True)
    adb = ['adb', '-s', args.device]
    def shell(*parts):
        return subprocess.check_output(adb + ['shell', *parts], text=True, timeout=30)
    if shell('getprop', 'ro.kernel.qemu').strip() != '1':
        p.error('Target is not an emulator')
    package = 'com.whoelseisfree.app'
    metadata = {
        'device': args.device,
        'display': shell('dumpsys', 'display'),
        'hardware': shell('getprop'),
        'package': shell('dumpsys', 'package', package),
        'animator_scale': shell('settings', 'get', 'global', 'animator_duration_scale').strip(),
    }
    (args.output / 'environment.json').write_text(json.dumps(metadata, indent=2))
    ages = [float(x) for x in args.ages.split(',')]
    if args.repeat:
        ages = [15 + i * 4 for i in range(args.repeat)]
    shell('am', 'force-stop', package)
    shell('am', 'start', '-n', package + '/.MainActivity')
    start = time.monotonic()
    results = []
    for index, age in enumerate(ages):
        while time.monotonic() - start < age:
            time.sleep(max(0, min(.25, age - (time.monotonic() - start))))
        actual_age = time.monotonic() - start
        shell('dumpsys', 'gfxinfo', package, 'reset')
        device_uptime = float(shell('cat', '/proc/uptime').split()[0])
        shell('input', 'tap', *map(str, args.tap))
        time.sleep(1.45)
        raw = shell('dumpsys', 'gfxinfo', package, 'framestats')
        (args.output / f'{index:03d}-open.txt').write_text(raw)
        durations = []
        for block in raw.split('---PROFILEDATA---')[1::2]:
            for row in csv.DictReader(io.StringIO(block.strip())):
                try:
                    if int(row['Flags']) != 0:
                        continue
                    ns = int(row['FrameCompleted']) - int(row['IntendedVsync'])
                    if 0 < ns < 10_000_000_000:
                        durations.append(ns / 1e6)
                except (KeyError, ValueError, TypeError):
                    continue
        durations.sort()
        def pct(q):
            return durations[min(len(durations)-1, int((len(durations)-1)*q))] if durations else None
        result = {'index': index, 'requested_age_s': age, 'actual_age_s': actual_age, 'device_uptime_s': device_uptime,
                  'frames': len(durations), 'gfxinfo_p50_ms': pct(.5),
                  'gfxinfo_p95_ms': pct(.95), 'gfxinfo_p99_ms': pct(.99)}
        results.append(result)
        print(json.dumps(result), flush=True)
        with (args.output / f'{index:03d}-destination.png').open('wb') as image:
            subprocess.run(adb + ['exec-out', 'screencap', '-p'], stdout=image, check=True, timeout=30)
        if not durations:
            raise SystemExit('No app frames: inspect the destination screenshot before continuing')
        shell('input', 'keyevent', '4')
        time.sleep(.6)
        (args.output / 'results.json').write_text(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
