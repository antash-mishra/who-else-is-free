#!/usr/bin/env python3
"""Summarize buffered UI progress samples, not FPS or display presentation.

Usage: analyze-progress.py CAPTURE_DIRECTORY [--output JSON_PATH]
Sample marker: ui-motion-samples {phase,samples_json:[{ui_ms,progress}],dropped_samples}.
Only complete phase windows with matching ui-endpoint receive timing statistics.
"""
import argparse
import json
import math
import statistics
from pathlib import Path


def describe(values):
    if not values:
        return None
    values = sorted(values)
    return {'n': len(values), 'median': statistics.median(values),
            'p95': values[max(0, math.ceil(.95 * len(values)) - 1)],
            'min': values[0], 'max': values[-1]}


def analyze(base):
    events = sorted([json.loads(line) for line in (base / 'events.jsonl').read_text().splitlines()],
                    key=lambda e: e['host_monotonic'])
    trials = json.loads((base / 'trials.json').read_text())
    rows = []
    for trial in trials:
        if trial.get('kind') != 'normal':
            rows.append({'cycle': trial.get('cycle'), 'status': 'unsupported-trial-kind', 'kind': trial.get('kind')})
            continue
        window = events[trial['start_index']:trial['end_index']]
        for phase in ['flying', 'closing']:
            phase_endpoints = [e for e in window if e['name'] == 'ui-endpoint' and e.get('phase') == phase]
            buffers = [e for e in window if e['name'] == 'ui-motion-samples' and e.get('phase') == phase]
            row = {'cycle': trial['cycle'], 'phase': phase,
                   'shared_endpoint_flag': trial.get('shared_open' if phase == 'flying' else 'shared_close'),
                   'endpoint_count': len(phase_endpoints), 'sample_buffer_count': len(buffers)}
            rows.append(row)
            if len(phase_endpoints) != 1:
                row['status'] = 'fallback-or-incomplete' if not phase_endpoints else 'ambiguous-endpoint'
                continue
            if len(buffers) != 1:
                row['status'] = 'samples-missing' if not buffers else 'ambiguous-sample-buffer'
                continue
            endpoint, buffer = phase_endpoints[0], buffers[0]
            try:
                samples = buffer.get('samples_json', [])
                samples = json.loads(samples) if isinstance(samples, str) else samples
                if not isinstance(samples, list):
                    raise ValueError('samples_json must decode to a list')
                samples = [{'ui_ms': float(s['ui_ms']), 'progress': float(s['progress'])} for s in samples]
                if any(not math.isfinite(s['ui_ms']) or not math.isfinite(s['progress']) for s in samples):
                    raise ValueError('Nonfinite sample')
                dropped = int(buffer.get('dropped_samples', 0))
                if dropped < 0:
                    raise ValueError('Negative dropped_samples')
            except (ValueError, KeyError, TypeError) as error:
                row.update(status='invalid-samples', error=str(error))
                continue
            row.update(sample_count=len(samples), dropped_samples=dropped, capped_samples=dropped > 0)
            if not samples:
                row['status'] = 'empty-samples'
                continue
            end_ms = float(endpoint['ui_ms'])
            if any(b['ui_ms'] < a['ui_ms'] for a, b in zip(samples, samples[1:])):
                row['status'] = 'nonmonotonic-samples'
                continue
            terminal_progress = 1.0 if phase == 'flying' else 0.0
            sampled_endpoint = abs(samples[-1]['progress'] - terminal_progress) <= 1e-6
            after_completion = [sample for sample in samples if sample['ui_ms'] > end_ms]
            row.update(sampled_endpoint_observed=sampled_endpoint,
                       samples_after_completion=len(after_completion),
                       nonterminal_samples_after_completion=sum(abs(sample['progress'] - terminal_progress) > 1e-6 for sample in after_completion))
            first_marker = next((e for e in window if e['name'] == 'first-ui-motion' and e.get('phase') == phase), None)
            native_name = 'input-up' if phase == 'flying' else 'input-back'
            native = next((e for e in window if e['name'] == native_name), None)
            gaps = [b['ui_ms'] - a['ui_ms'] for a, b in zip(samples, samples[1:])]
            jumps = [abs(b['progress'] - a['progress']) for a, b in zip(samples, samples[1:])]
            row.update(status='complete-capped' if dropped else 'complete',
                       intersample_gap_ms=describe(gaps), max_progress_jump=max(jumps) if jumps else None,
                       first_sample_progress=samples[0]['progress'], last_sample_progress=samples[-1]['progress'],
                       first_sample_to_endpoint_ms=samples[-1]['ui_ms'] - samples[0]['ui_ms'] if sampled_endpoint else None,
                       sampled_span_ms=samples[-1]['ui_ms'] - samples[0]['ui_ms'],
                       first_sample_to_completion_ms=end_ms - samples[0]['ui_ms'],
                       completion_to_last_sample_ms=samples[-1]['ui_ms'] - end_ms,
                       input_to_endpoint_ms=end_ms - native['native_ms'] if native else None,
                       first_motion_marker_to_endpoint_ms=end_ms - first_marker['ui_ms'] if first_marker else None,
                       sample_times_ms=[s['ui_ms'] for s in samples], progress=[s['progress'] for s in samples])
            if phase == 'flying':
                row['up_to_endpoint_ms'] = row['input_to_endpoint_ms']
            else:
                row['back_to_endpoint_ms'] = row['input_to_endpoint_ms']
    summary = {}
    for phase in ['flying', 'closing']:
        phase_rows = [r for r in rows if r.get('phase') == phase]
        complete = [r for r in phase_rows if r['status'] == 'complete']
        statuses = {}
        for r in phase_rows:
            statuses[r['status']] = statuses.get(r['status'], 0) + 1
        output = {'trials': len(phase_rows), 'status_counts': statuses,
                  'capped_trials': sum(r.get('capped_samples', False) for r in phase_rows),
                  'dropped_samples_total': sum(r.get('dropped_samples', 0) for r in phase_rows),
                  'uncapped_complete_trials': len(complete), 'metrics': {}}
        for key in ['sample_count', 'max_progress_jump', 'first_sample_to_endpoint_ms',
                    'sampled_span_ms', 'first_sample_to_completion_ms', 'completion_to_last_sample_ms', 'input_to_endpoint_ms']:
            output['metrics'][key] = describe([r[key] for r in complete if r.get(key) is not None])
        for key in ['median', 'p95', 'max']:
            output['metrics']['trial_gap_' + key + '_ms'] = describe([
                r['intersample_gap_ms'][key] for r in complete if r.get('intersample_gap_ms')])
        summary[phase] = output
    return {'capture': str(base.resolve()), 'quantile': 'Nearest-rank p95 within each trial; aggregate summarizes trial statistics.',
            'limits': ['UI progress observations are not displayed frames or FPS.',
                       'Matching endpoint and one sample buffer are required within the same trial and phase.',
                       'Gaps span consecutive buffered observations, not necessarily every vsync.',
                       'Maximum progress jump is absolute, allowing comparison of opening and return.',
                       'ui-endpoint marks animation completion; its callback may precede the reaction observing terminal progress in the same frame.',
                       'first_sample_to_endpoint_ms uses the last buffered sample only when it reaches terminal progress. first_sample_to_completion_ms and input_to_endpoint_ms use the original completion callback.',
                       'completion_to_last_sample_ms is signed: positive means the last observation follows completion. All samples are retained, including any nonterminal observations after completion.',
                       'sampled_span_ms covers the complete buffer even when a terminal sample is absent. Zero-sample and missing/fallback phases remain visible.',
                       'Capped trials remain detailed but are excluded from aggregate cadence statistics.',
                       'Native/UI clock alignment must be verified separately for the capture runtime.'],
            'summary': summary, 'trials': rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = analyze(args.directory)
    output = args.output or args.directory.with_name(args.directory.name + '-progress-analysis.json')
    output.write_text(json.dumps(result, indent=2) + '\n')
    for phase, s in result['summary'].items():
        print(phase, 'statuses=', s['status_counts'], 'dropped=', s['dropped_samples_total'])
        print(' ', {k: round(v['median'], 3) for k, v in s['metrics'].items() if v})
    print('Saved:', output)

if __name__ == '__main__':
    main()
