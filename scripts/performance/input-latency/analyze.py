"""Summarize captured native-input and UI-progress markers without hiding fallbacks."""
from pathlib import Path
import json
import statistics
import sys

base = Path(sys.argv[1])
events = sorted(
    [json.loads(line) for line in (base / 'events.jsonl').read_text().splitlines()],
    key=lambda event: event['host_monotonic'],
)
results = []
trials = json.loads((base / 'trials.json').read_text())


def find(sequence, name, phase=None):
    return next((event for event in sequence if event['name'] == name
                 and (phase is None or event.get('phase') == phase)), None)


for trial in trials:
    window = events[trial['start_index']:trial['end_index']]
    row = {'cycle': trial['cycle']}
    if trial['kind'] == 'normal':
        row.update(shared_open=trial['shared_open'], shared_close=trial['shared_close'])
        first = find(window, 'first-ui-motion', 'flying')
        if trial['shared_open'] and first:
            motion = first['ui_ms']
            nav = find(window, 'navigate')['js_ms']
            dest = find(window, 'destination-measured')['js_ms']
            ready = find(window, 'takeoff-ready')['js_ms']
            row.update(
                down_to_motion=motion-find(window, 'input-down')['native_ms'],
                up_to_motion=motion-find(window, 'input-up')['native_ms'],
                press_to_motion=motion-find(window, 'card-press')['js_ms'],
                mount_measure=dest-nav, dest_to_ready=ready-dest,
                ready_to_motion=motion-ready,
            )
        closing = find(window, 'first-ui-motion', 'closing')
        endpoint = find(window, 'ui-endpoint', 'closing')
        unmount = find(window, 'page-unmount')
        if trial['shared_close'] and closing:
            row['back_to_motion'] = closing['ui_ms']-find(window, 'input-back')['native_ms']
        if endpoint and unmount:
            row['endpoint_to_unmount'] = unmount['js_ms']-endpoint['ui_ms']
    else:
        close = events[trial['close_start_index']:trial['end_index']]
        tap = events[trial['tap_start_index']:trial['end_index']]
        endpoint = find(close, 'ui-endpoint', 'closing')
        down = find(tap, 'input-down')
        up = find(tap, 'input-up')
        unmount = find(close, 'page-unmount')
        first = find(tap, 'first-ui-motion', 'flying')
        row.update(
            tap_after_endpoint_ms=down['native_ms']-endpoint['ui_ms'] if endpoint else None,
            tap_before_unmount_ms=unmount['js_ms']-down['native_ms'] if unmount else None,
            card_press_seen=find(tap, 'card-press') is not None,
            reopened=trial['reopened'],
            reopen_up_to_motion_ms=first['ui_ms']-up['native_ms'] if first else None,
        )
    results.append(row)

summary = {}
if trials and trials[0]['kind'] == 'normal':
    keys = set().union(*(row.keys() for row in results))-{'cycle', 'shared_open', 'shared_close'}
    for key in sorted(keys):
        values = [row[key] for row in results if key in row]
        summary[key] = dict(n=len(values), median=statistics.median(values),
                            min=min(values), max=max(values))
else:
    after = [row for row in results if row['tap_after_endpoint_ms'] is not None
             and row['tap_after_endpoint_ms'] >= 0]
    summary = dict(total_trials=len(results), after_endpoint_taps=len(after),
                   after_endpoint_reopened=sum(row['reopened'] for row in after),
                   after_endpoint_missed=sum(not row['reopened'] for row in after),
                   missing_close_endpoint=sum(row['tap_after_endpoint_ms'] is None for row in results))
(base / 'analysis.json').write_text(json.dumps(dict(trials=results, summary=summary), indent=2)+'\n')
print(json.dumps(summary, indent=2))
