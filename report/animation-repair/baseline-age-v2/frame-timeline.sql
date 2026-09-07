WITH windows AS (SELECT 0 AS sample, 6634 AS pid, 855290000000 AS start_ns, 857243568491 AS end_ns UNION ALL SELECT 1 AS sample, 6634 AS pid, 865280000000 AS start_ns, 867199648954 AS end_ns UNION ALL SELECT 2 AS sample, 6634 AS pid, 875210000000 AS start_ns, 876853381751 AS end_ns UNION ALL SELECT 3 AS sample, 6634 AS pid, 880310000000 AS start_ns, 881908492086 AS end_ns UNION ALL SELECT 4 AS sample, 6634 AS pid, 885270000000 AS start_ns, 886943429005 AS end_ns UNION ALL SELECT 5 AS sample, 6634 AS pid, 900450000000 AS start_ns, 902181449388 AS end_ns UNION ALL SELECT 6 AS sample, 6634 AS pid, 960320000000 AS start_ns, 961937215624 AS end_ns)
SELECT w.sample, count(*) AS presented_frame_records,
 sum(CASE WHEN a.jank_type LIKE '%App Deadline Missed%' THEN 1 ELSE 0 END) AS app_deadline_misses,
 sum(CASE WHEN a.jank_type != 'None' THEN 1 ELSE 0 END) AS all_jank_records,
 round(avg(a.dur)/1e6,2) AS mean_actual_frame_ms,
 round(max(a.dur)/1e6,2) AS max_actual_frame_ms
FROM windows w JOIN process p ON p.pid=w.pid
JOIN actual_frame_timeline_slice a ON a.upid=p.upid
WHERE a.ts >= w.start_ns AND a.ts < w.end_ns AND a.dur > 0
GROUP BY w.sample ORDER BY w.sample