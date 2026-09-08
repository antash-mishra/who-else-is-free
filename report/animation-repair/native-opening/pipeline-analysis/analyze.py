import json,subprocess
from pathlib import Path
out=Path('/tmp/weif-opening-native/pipeline-analysis');src=Path('/tmp/weif-input-latency/native-baseline-01')
e=sorted([json.loads(x) for x in (src/'events.jsonl').read_text().splitlines()],key=lambda x:x['host_monotonic'])
trials=json.loads((src/'trials.json').read_text());windows=[];markers=[]
for t in trials:
 chunk=e[t['start_index']:t['end_index']]
 up=next((x for x in chunk if x['name']=='input-up'),None)
 motion=next((x for x in chunk if x['name']=='first-ui-motion' and x.get('phase')=='flying'),None)
 if not up or not motion:continue
 w=(t['cycle'],'opening',up['native_ms'],motion['ui_ms']);windows.append(w)
 last=('up',up['native_ms'])
 for name in ['navigate','destination-measured','takeoff-ready','animation-requested','first-ui-motion']:
  x=next((x for x in chunk if x['name']==name and x.get('phase','flying')=='flying'),None)
  if not x:continue
  tm=x.get('ui_ms',x.get('js_ms'))
  windows.append((t['cycle'],last[0]+'→'+name,last[1],tm));last=(name,tm)
 for x in chunk:
  if x.get('origin')=='app' and x.get('js_ms') and x['js_ms']<=motion['ui_ms']+100:
   markers.append({'cycle':t['cycle'],**x})
(out/'windows.json').write_text(json.dumps(windows,indent=2));(out/'markers.json').write_text(json.dumps(markers,indent=2))
# Snapshots show trace clock BOOTTIME - MONOTONIC = -83 to -84ns.
values=','.join(f"({n},'{label}',{round(a*1e6)-84},{round(b*1e6)-84})" for n,label,a,b in windows)
cte='WITH win(cycle,label,start_ns,end_ns) AS (VALUES '+values+')\n'
queries={
 'clocks': 'SELECT * FROM clock_snapshot; SELECT start_ts,end_ts FROM trace_bounds;',
 'states':cte+'''SELECT w.cycle,w.label,t.tid,t.name,st.state,round(sum(min(st.ts+st.dur,w.end_ns)-max(st.ts,w.start_ns))/1e6,3) AS overlap_ms FROM win w JOIN thread_state st ON st.ts<w.end_ns AND st.ts+st.dur>w.start_ns JOIN thread t USING(utid) JOIN process p USING(upid) WHERE p.pid=16838 GROUP BY w.cycle,w.label,t.tid,t.name,st.state ORDER BY w.cycle,w.label,overlap_ms DESC;''',
 'slices':cte+'''SELECT w.cycle,w.label,t.tid,t.name AS thread,s.name,s.ts,s.dur,s.depth,round((max(s.ts,w.start_ns)-w.start_ns)/1e6,3) AS offset_ms,round((min(s.ts+s.dur,w.end_ns)-max(s.ts,w.start_ns))/1e6,3) AS overlap_ms FROM win w JOIN slice s ON s.ts<w.end_ns AND s.ts+s.dur>w.start_ns JOIN thread_track tt ON s.track_id=tt.id JOIN thread t USING(utid) JOIN process p USING(upid) WHERE p.pid=16838 AND w.label='opening' ORDER BY w.cycle,s.ts;''',
 'async_images':'''SELECT s.id,s.name,s.ts,s.dur,tr.name AS track,tr.type FROM slice s JOIN track tr ON tr.id=s.track_id WHERE s.name GLOB '*ExpoImage*' ORDER BY s.ts;'''
}
for name,q in queries.items():
 (out/(name+'.sql')).write_text(q)
 p=subprocess.run(['/tmp/weif-animation-benchmark/trace_processor','query','-f',str(out/(name+'.sql')),'/tmp/weif-opening-native/trace.perfetto-trace'],capture_output=True,text=True)
 (out/(name+'.csv')).write_text(p.stdout);(out/(name+'.stderr')).write_text(p.stderr)
 print(name,p.returncode,len(p.stdout))
