#!/usr/bin/env python3
"""Summarize app FrameTimeline slices in captured open windows, by recorded PID."""
import argparse
import csv
import io
import json
import pathlib
import re
import subprocess

p = argparse.ArgumentParser()
p.add_argument('directory', type=pathlib.Path)
p.add_argument('--processor', required=True)
a = p.parse_args()
rows = json.loads((a.directory / 'results.json').read_text())
metadata_path = a.directory / 'environment.json'
metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {}
windows = []
for row in rows:
    raw = (a.directory / f"{row['index']:03d}-open.txt").read_text()
    match = re.search(r'Graphics info for pid (\d+)', raw)
    if not match:
        continue
    pid = int(match.group(1))
    completed = []
    for block in raw.split('---PROFILEDATA---')[1::2]:
        for frame in csv.DictReader(io.StringIO(block.strip())):
            try:
                if int(frame['Flags']) == 0:
                    completed.append(int(frame['FrameCompleted']))
            except (KeyError, ValueError, TypeError):
                pass
    if not completed:
        continue
    start = int(row['device_uptime_s'] * 1e9)
    # Modal window frame history disappears from gfxinfo when the sheet closes.
    # Scenario captures therefore use their entire timed window, including the
    # native modal surface preserved by Perfetto. Older card captures retain
    # their original last-completed-frame boundary.
    end = int(start + (metadata['window_seconds'] + row['adb_input_command_ms'] / 1000) * 1e9) if 'window_seconds' in metadata else max(completed)
    windows.append(f"SELECT {row['index']} AS sample, {pid} AS pid, {start} AS start_ns, {end} AS end_ns")
if not windows:
    raise SystemExit('No valid frame windows')
sql = '''WITH windows AS (''' + ' UNION ALL '.join(windows) + ''')
SELECT w.sample, count(*) AS app_frame_records,
 sum(CASE WHEN a.jank_type LIKE '%App Deadline Missed%' THEN 1 ELSE 0 END) AS app_deadline_misses,
 sum(CASE WHEN a.jank_type != 'None' THEN 1 ELSE 0 END) AS all_jank_records,
 sum(CASE WHEN a.present_type = 'Dropped Frame' THEN 1 ELSE 0 END) AS dropped_frame_records,
 round(avg(a.dur)/1e6,2) AS mean_actual_frame_ms,
 round(max(a.dur)/1e6,2) AS max_actual_frame_ms,
 group_concat(a.dur) AS actual_durations_ns
FROM windows w JOIN process p ON p.pid=w.pid
JOIN actual_frame_timeline_slice a ON a.upid=p.upid
WHERE a.ts >= w.start_ns AND a.ts < w.end_ns AND a.dur > 0
GROUP BY w.sample ORDER BY w.sample'''
trace = a.directory / 'trace.perfetto-trace'
if not trace.exists() or trace.stat().st_size == 0:
    raise SystemExit('Trace is missing/empty. Wait for Perfetto to flush, then pull it again.')
result = subprocess.check_output([a.processor, str(trace), '-Q', sql], text=True)
(a.directory / 'frame-timeline.csv').write_text(result)
(a.directory / 'frame-timeline.sql').write_text(sql)
print(result)
