import csv,io,json,subprocess
from pathlib import Path
out=Path('/tmp/weif-opening-native/early-motion-analysis');out.mkdir(exist_ok=True)
e=sorted([json.loads(l) for l in Path('/tmp/weif-opening-native/final-native-capture/events.jsonl').read_text().splitlines()],key=lambda x:x['host_monotonic']);trials=json.load(open('/tmp/weif-opening-native/final-native-capture/trials.json'));wins=[];sample_report=[]
for t in trials:
 c=e[t['start_index']:t['end_index']]
 def get(n):return next(x for x in c if x['name']==n and x.get('phase','flying')=='flying')
 p=json.loads(get('ui-motion-samples')['samples_json']);first=p[0]['ui_ms'];req=get('animation-requested')['js_ms'];ready=get('takeoff-ready')['js_ms'];
 sample_report.append({'cycle':t['cycle'],'ready_to_request_ms':req-ready,'request_to_first_ms':first-req,'samples_first200':[{**x,'after_first_ms':x['ui_ms']-first} for x in p if x['ui_ms']-first<=200],'first_three_gap_ms':[p[i+1]['ui_ms']-p[i]['ui_ms'] for i in range(2)]})
 for label,a,b in [('ready-request',ready,req),('request-first',req,first),('first200',first,first+200),('first-second',p[0]['ui_ms'],p[1]['ui_ms']),('second-third',p[1]['ui_ms'],p[2]['ui_ms'])]:wins.append((t['cycle'],label,round(a*1e6-41.5),round(b*1e6-41.5)))
(out/'samples.json').write_text(json.dumps(sample_report,indent=2));values=','.join(f"({n},'{l}',{a},{b})" for n,l,a,b in wins);cte='WITH win(cycle,label,a,b) AS (VALUES '+values+') '
queries={'states':cte+'''SELECT w.cycle,w.label,t.name,st.state,round(sum(min(st.ts+st.dur,w.b)-max(st.ts,w.a))/1e6,3) AS ms FROM win w JOIN thread_state st ON st.ts<w.b AND st.ts+st.dur>w.a JOIN thread t USING(utid) JOIN process p USING(upid) WHERE p.pid=23055 AND (t.is_main_thread=1 OR t.name IN ('mqt_v_js','RenderThread')) GROUP BY w.cycle,w.label,t.name,st.state ORDER BY w.cycle,w.label,t.name,ms DESC;''','slices':cte+'''SELECT w.cycle,w.label,t.name AS thread,s.name,round((max(s.ts,w.a)-w.a)/1e6,3) AS offset_ms,round((min(s.ts+s.dur,w.b)-max(s.ts,w.a))/1e6,3) AS ms,s.depth FROM win w JOIN slice s ON s.ts<w.b AND s.ts+s.dur>w.a JOIN thread_track tt ON tt.id=s.track_id JOIN thread t USING(utid) JOIN process p USING(upid) WHERE p.pid=23055 AND (t.is_main_thread=1 OR t.name='RenderThread') ORDER BY w.cycle,w.label,s.ts;'''}
for name,q in queries.items():
 (out/(name+'.sql')).write_text(q);r=subprocess.run(['/tmp/weif-animation-benchmark/trace_processor','query','/tmp/weif-opening-native/final.perfetto-trace',q],capture_output=True,text=True,check=True);(out/(name+'.csv')).write_text(r.stdout)
print(out)
