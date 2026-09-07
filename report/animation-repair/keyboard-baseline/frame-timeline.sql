WITH windows AS (SELECT 0 AS sample, 12124 AS pid, 8249590000000 AS start_ns, 8251306988166 AS end_ns UNION ALL SELECT 1 AS sample, 12124 AS pid, 8252230000000 AS start_ns, 8253936919375 AS end_ns UNION ALL SELECT 2 AS sample, 12124 AS pid, 8254840000000 AS start_ns, 8256600625082 AS end_ns UNION ALL SELECT 3 AS sample, 12124 AS pid, 8257590000000 AS start_ns, 8259243844041 AS end_ns UNION ALL SELECT 4 AS sample, 12124 AS pid, 8260190000000 AS start_ns, 8261879177125 AS end_ns UNION ALL SELECT 5 AS sample, 12124 AS pid, 8262770000000 AS start_ns, 8264475442583 AS end_ns UNION ALL SELECT 6 AS sample, 12124 AS pid, 8265459999999 AS start_ns, 8267114016749 AS end_ns UNION ALL SELECT 7 AS sample, 12124 AS pid, 8268010000000 AS start_ns, 8269669442666 AS end_ns UNION ALL SELECT 8 AS sample, 12124 AS pid, 8270670000000 AS start_ns, 8272364677041 AS end_ns UNION ALL SELECT 9 AS sample, 12124 AS pid, 8273270000000 AS start_ns, 8274966526250 AS end_ns UNION ALL SELECT 10 AS sample, 12124 AS pid, 8275840000000 AS start_ns, 8277531438208 AS end_ns UNION ALL SELECT 11 AS sample, 12124 AS pid, 8278440000000 AS start_ns, 8280109838792 AS end_ns UNION ALL SELECT 12 AS sample, 12124 AS pid, 8281110000000 AS start_ns, 8282789777375 AS end_ns UNION ALL SELECT 13 AS sample, 12124 AS pid, 8283690000000 AS start_ns, 8285404821624 AS end_ns UNION ALL SELECT 14 AS sample, 12124 AS pid, 8286250000000 AS start_ns, 8287955966083 AS end_ns UNION ALL SELECT 15 AS sample, 12124 AS pid, 8288860000000 AS start_ns, 8290522324500 AS end_ns)
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
GROUP BY w.sample ORDER BY w.sample