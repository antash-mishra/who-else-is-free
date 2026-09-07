WITH windows AS (SELECT 0 AS sample, 6120 AS pid, 687020000000 AS start_ns, 688808919453 AS end_ns UNION ALL SELECT 1 AS sample, 6120 AS pid, 696970000000 AS start_ns, 698452128666 AS end_ns UNION ALL SELECT 2 AS sample, 6120 AS pid, 706950000000 AS start_ns, 708099616295 AS end_ns UNION ALL SELECT 3 AS sample, 6120 AS pid, 712070000000 AS start_ns, 713239572048 AS end_ns UNION ALL SELECT 4 AS sample, 6120 AS pid, 716950000000 AS start_ns, 717930917383 AS end_ns UNION ALL SELECT 5 AS sample, 6120 AS pid, 731990000000 AS start_ns, 733027765807 AS end_ns UNION ALL SELECT 6 AS sample, 6120 AS pid, 792070000000 AS start_ns, 793361843877 AS end_ns)
SELECT w.sample, count(*) AS presented_frame_records,
 sum(CASE WHEN a.jank_type LIKE '%App Deadline Missed%' THEN 1 ELSE 0 END) AS app_deadline_misses,
 sum(CASE WHEN a.jank_type != 'None' THEN 1 ELSE 0 END) AS all_jank_records,
 round(avg(a.dur)/1e6,2) AS mean_actual_frame_ms,
 round(max(a.dur)/1e6,2) AS max_actual_frame_ms
FROM windows w JOIN process p ON p.pid=w.pid
JOIN actual_frame_timeline_slice a ON a.upid=p.upid
WHERE a.ts >= w.start_ns AND a.ts < w.end_ns AND a.dur > 0
GROUP BY w.sample ORDER BY w.sample