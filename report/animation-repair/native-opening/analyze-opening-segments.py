#!/usr/bin/env python3
"""Split opening progress observations into first-200-ms and remaining intervals."""
import argparse
import json
import statistics
from pathlib import Path


def summarize(values):
    return {'n': len(values), 'median': statistics.median(values), 'min': min(values),
            'max': max(values), 'values': values} if values else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='Aggregated progress-summary JSON')
    parser.add_argument('--output', type=Path, help='New JSON path; existing files are never overwritten')
    parser.add_argument('--early-ms', type=float, default=200)
    args = parser.parse_args()
    if args.early_ms <= 0:
        parser.error('--early-ms must be positive')
    target = args.output or args.input.with_name(args.input.stem + '-opening-segments.json')
    if target.exists():
        parser.error('Output already exists; supply a new path to preserve earlier results')
    data = json.loads(args.input.read_text())
    output = {'source': str(args.input.resolve()), 'early_ms': args.early_ms,
              'variant_labels': data.get('variant_labels'), 'apks': data.get('apks'),
              'method': 'Times relative to first buffered UI motion. Early intervals START before the boundary; full straddling intervals retained. Tail intervals START at/after the boundary.',
              'limits': ['UI sample gaps are not display presentation or FPS.',
                         'Cubic easing naturally makes early progress increments larger; time gaps independently establish stalls.',
                         'Only uncapped complete buffers enter timing summaries; other outcomes remain counted.',
                         'UP-to-first-motion is separate from the motion sampling gaps.',
                         'Process-first means first Details after process restart, not first-ever installation.'],
              'groups': {}}
    for key, group in data['groups'].items():
        if not key.endswith('/flying'):
            continue
        rows = []
        for row in group['trials_detail']:
            if row['status'] != 'complete':
                continue
            ts, progress = row['sample_times_ms'], row['progress']
            pairs = [{'start': a - ts[0], 'end': b - ts[0], 'gap': b - a, 'jump': abs(y - x)}
                     for a, b, x, y in zip(ts, ts[1:], progress, progress[1:])]
            result = {'block': row['block'], 'cycle': row['cycle'],
                      'up_to_motion_ms': row['latency'].get('up_to_motion'),
                      'first_progress': progress[0] if progress else None,
                      'sampled_duration_ms': row.get('first_sample_to_endpoint_ms'),
                      'completion_duration_ms': row.get('first_sample_to_completion_ms')}
            for name, intervals in [('early', [p for p in pairs if p['start'] < args.early_ms]),
                                    ('tail', [p for p in pairs if p['start'] >= args.early_ms])]:
                result[name] = {
                    'intervals': len(intervals),
                    'gap_median_ms': statistics.median(p['gap'] for p in intervals),
                    'gap_max_ms': max(p['gap'] for p in intervals),
                    'max_progress_jump': max(p['jump'] for p in intervals),
                    'gaps_over50_ms': sum(p['gap'] > 50 for p in intervals),
                    'gaps_over75_ms': sum(p['gap'] > 75 for p in intervals),
                    'worst_gap': max(intervals, key=lambda p: p['gap'])
                } if intervals else None
            rows.append(result)
        metrics = {part: {metric: summarize([r[part][metric] for r in rows if r[part]])
                          for metric in ['gap_median_ms', 'gap_max_ms', 'max_progress_jump',
                                         'gaps_over50_ms', 'gaps_over75_ms']}
                   for part in ['early', 'tail']}
        output['groups'][key] = {
            'trials_total': group['trials'], 'status_counts': group['statuses'],
            'uncapped_complete_trials': len(rows), 'summary': metrics,
            'up_to_motion_ms': summarize([r['up_to_motion_ms'] for r in rows if r['up_to_motion_ms'] is not None]),
            'sampled_duration_ms': summarize([r['sampled_duration_ms'] for r in rows if r['sampled_duration_ms'] is not None]),
            'completion_duration_ms': summarize([r['completion_duration_ms'] for r in rows if r['completion_duration_ms'] is not None]),
            'trials': rows}
        print(key, 'statuses=', group['statuses'])
        for part in ['early', 'tail']:
            print(' ', part, {metric: round(value['median'], 3) for metric, value in metrics[part].items() if value})
    with target.open('x') as file:
        json.dump(output, file, indent=2)
        file.write('\n')
    print('Saved:', target)


if __name__ == '__main__':
    main()
