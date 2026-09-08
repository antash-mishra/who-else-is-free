SELECT * FROM clock_snapshot WHERE clock_name IN ('MONOTONIC','BOOTTIME','REALTIME') ORDER BY snapshot_id,clock_id
