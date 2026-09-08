#!/usr/bin/env python3
"""Read-only matrix analysis; writes summary JSON alongside or outside capture directory."""
import argparse
import json
import statistics
from pathlib import Path

METRICS = ['down_to_motion', 'up_to_motion', 'press_to_motion', 'mount_measure',
           'dest_to_ready', 'ready_to_motion', 'back_to_motion', 'endpoint_to_unmount']
STATES = ['process-first', 'repeated']

def stats(values):
    return {'n': len(values), 'median': statistics.median(values),
            'min': min(values), 'max': max(values), 'values': values} if values else None

def summarize(rows):
    out = {'trials': len(rows), 'metrics_ms': {},
           'shared_open_completed': sum(r.get('shared_open') is True for r in rows),
           'shared_close_completed': sum(r.get('shared_close') is True for r in rows),
           'shared_open_not_observed': sum(r.get('shared_open') is False for r in rows),
           'shared_close_not_observed': sum(r.get('shared_close') is False for r in rows)}
    for metric in METRICS:
        sample = stats([r[metric] for r in rows if isinstance(r.get(metric), (int, float)) and not isinstance(r[metric], bool)])
        if sample:
            out['metrics_ms'][metric] = sample
    return out

def read_rows(folder):
    analysis = json.loads((folder / 'analysis.json').read_text())
    rows = analysis['trials']
    if not (folder / 'events.jsonl').exists() or not (folder / 'trials.json').exists():
        return rows
    events = sorted([json.loads(line) for line in (folder / 'events.jsonl').read_text().splitlines()], key=lambda e: e['host_monotonic'])
    windows = json.loads((folder / 'trials.json').read_text())
    by_cycle = {r['cycle']: r for r in rows}
    for trial in windows:
        row = by_cycle.get(trial['cycle'])
        if row is None:
            continue
        window = events[trial['start_index']:trial['end_index']]
        ready = next((e for e in window if e['name'] == 'preload-snapshot'), None)
        if ready:
            row['preload_ready'] = ready.get('ready')
    return rows

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('matrix', type=Path, help='Matrix directory or comparison.json')
    parser.add_argument('--output', type=Path, help='Defaults to <matrix-directory>-summary.json')
    parser.add_argument('--reference', help='Comparison reference variant; defaults to first APK in metadata')
    parser.add_argument('--allow-incomplete', action='store_true', help='Explicitly permit a provisional summary')
    args = parser.parse_args()
    meta_path = args.matrix if args.matrix.name == 'comparison.json' else args.matrix / 'comparison.json'
    base = meta_path.parent
    metadata = json.loads(meta_path.read_text())
    if metadata.get('status') != 'complete' and not args.allow_incomplete:
        parser.error('Matrix is not complete; use --allow-incomplete only for a provisional summary')
    variants = list(metadata.get('apks', {}))
    for block in metadata.get('blocks', []):
        if block['variant'] not in variants:
            variants.append(block['variant'])
    if not variants:
        parser.error('No variants found')
    reference = args.reference or variants[0]
    if reference not in variants:
        parser.error('Reference is not a matrix variant')
    collected = {v: {state: [] for state in STATES} for v in variants}
    result = {'matrix': str(base.resolve()), 'status': metadata.get('status'),
              'provisional': metadata.get('status') != 'complete',
              'measurement': 'Injected native input to first stable-probe UI progress sample, not display presentation.',
              'process_first_state': metadata.get('state'), 'warmup': metadata.get('warmup'),
              'apks': metadata.get('apks'), 'sequence': metadata.get('sequence'),
              'reference': reference, 'blocks': [], 'variants': {}, 'comparisons': {}, 'warnings': []}
    for block in metadata.get('blocks', []):
        b = {k: block.get(k) for k in ['directory', 'variant', 'status', 'kind']}
        for state in STATES:
            folder = base / block['directory'] / state
            if not (folder / 'analysis.json').exists():
                if state == 'process-first' or block.get('kind') != 'additional-process-first-only':
                    result['warnings'].append(f'Missing analysis: {folder}')
                continue
            rows = read_rows(folder)
            for row in rows:
                row['block'] = block['directory']
            collected[block['variant']][state].extend(rows)
            b[state] = summarize(rows)
        result['blocks'].append(b)
    for variant in variants:
        result['variants'][variant] = {}
        for state, rows in collected[variant].items():
            summary = summarize(rows)
            summary['trials_detail'] = rows
            if any('preload_ready' in r for r in rows):
                summary['preload_strata'] = {
                    label: summarize([r for r in rows if ('preload_ready' not in r if value is None else r.get('preload_ready') == value)])
                    for label, value in [('hit', 1), ('miss', 0), ('unmarked', None)]}
            result['variants'][variant][state] = summary
    for variant in variants:
        if variant == reference:
            continue
        result['comparisons'][variant] = {}
        for state in STATES:
            result['comparisons'][variant][state] = {}
            baseline = result['variants'][reference][state]['metrics_ms']
            candidate = result['variants'][variant][state]['metrics_ms']
            for metric in baseline.keys() & candidate.keys():
                a, b = baseline[metric], candidate[metric]
                result['comparisons'][variant][state][metric] = {
                    'reference_n': a['n'], 'candidate_n': b['n'],
                    'reference_median_ms': a['median'], 'candidate_median_ms': b['median'],
                    'candidate_minus_reference_ms': b['median'] - a['median'],
                    'median_reduction_percent': (a['median'] - b['median']) / a['median'] * 100 if a['median'] else None,
                    'note': 'Positive reduction means lower latency; difference of sample medians, not paired-trial causal effect or statistical significance.'}
    result['interpretation'] = [
        'Process-first is not first-ever installation or image-cache-cold unless metadata explicitly establishes those conditions.',
        'Absent shared endpoints are fallback/incomplete outcomes, not proof of missed input. Verify screenshot and card-press/page markers.',
        'Per-stage medians do not sum to end-to-end median. Inspect within-block variability and tail ranges before claiming improvement.',
        'Readiness-hit strata are observational; cache hits may correlate with lower load at other stages.',
        'Pair comparisons use each variant versus the specified reference; observations are not one-to-one randomized pairs.']
    output = args.output or base.with_name(base.name + '-summary.json')
    output.write_text(json.dumps(result, indent=2) + '\n')
    print('Matrix:', result['status'], '| reference:', reference)
    for variant, states in result['variants'].items():
        for state, s in states.items():
            parts = []
            for metric in ['up_to_motion', 'dest_to_ready', 'ready_to_motion', 'endpoint_to_unmount']:
                m = s['metrics_ms'].get(metric)
                if m:
                    parts.append(f'{metric}={m["median"]:.1f}[{m["min"]:.1f}–{m["max"]:.1f}](n={m["n"]})')
            print(f'{variant} {state}: trials={s["trials"]}; open/close absent={s["shared_open_not_observed"]}/{s["shared_close_not_observed"]}; ' + '; '.join(parts))
    for b in result['blocks']:
        print('Block', b['directory'], ', '.join(f'{state} UP→UI={b[state]["metrics_ms"]["up_to_motion"]["median"]:.1f}' for state in STATES if state in b and 'up_to_motion' in b[state]['metrics_ms']))
    for variant, states in result['comparisons'].items():
        for state, metrics in states.items():
            m = metrics.get('up_to_motion')
            if m:
                reduction = m['median_reduction_percent']
                print(f'{variant} versus {reference}, {state}: UP→UI delta {m["candidate_minus_reference_ms"]:+.1f}ms, reduction {reduction:+.1f}%' if reduction is not None else f'{variant} versus {reference}, {state}: percent undefined')
    for warning in result['warnings']:
        print('WARNING:', warning)
    print('Saved:', output)

if __name__ == '__main__':
    main()
