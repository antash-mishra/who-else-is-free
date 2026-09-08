import csv,io,json,statistics,subprocess
from pathlib import Path
OUT=Path('/tmp/weif-opening-native/latency-analysis'); TRACE=OUT.parent/'trace.perfetto-trace';TP='/tmp/weif-animation-benchmark/trace_processor';BASE=Path('/tmp/weif-input-latency/native-baseline-01')
def query(name,sql):
 (OUT/(name+'.sql')).write_text(sql+'\n');raw=subprocess.check_output([TP,str(TRACE),'-Q',sql],text=True,stderr=subprocess.DEVNULL);(OUT/(name+'.csv')).write_text(raw);return list(csv.DictReader(io.StringIO(raw)))
clocks=query('clocks',"SELECT * FROM clock_snapshot WHERE clock_name IN ('MONOTONIC','BOOTTIME','REALTIME') ORDER BY snapshot_id,clock_id")
offsets=[int(r['ts'])-int(r['clock_value'])for r in clocks if r['clock_name']=='MONOTONIC'];offset=statistics.median(offsets)
threads=query('thread-states',"SELECT t.tid,t.name,s.ts,s.dur,s.state,s.io_wait,s.blocked_function FROM thread_state s JOIN thread t USING(utid) JOIN process p USING(upid) WHERE p.pid=16838 AND (t.is_main_thread=1 OR t.name IN ('mqt_v_js','RenderThread')) AND s.dur>0 ORDER BY s.ts")
frames=query('frames',"SELECT a.id,a.ts,a.dur,a.surface_frame_token,a.display_frame_token,a.layer_name,a.present_type,a.jank_type,a.on_time_finish, f.ts AS display_start_ns,f.dur AS display_duration_ns,f.ts+f.dur AS display_end_ns,f.present_type AS display_present_type FROM actual_frame_timeline_slice a JOIN process p ON p.upid=a.upid LEFT JOIN actual_frame_timeline_slice f ON f.display_frame_token=a.display_frame_token AND f.surface_frame_token IS NULL AND f.dur>0 WHERE p.pid=16838 AND a.layer_name LIKE '%MainActivity%' AND a.dur>0 ORDER BY a.ts")
events=sorted([json.loads(l)for l in(BASE/'events.jsonl').read_text().splitlines()],key=lambda e:e['host_monotonic']); trials=json.loads((BASE/'trials.json').read_text());windows=[]
def ns(e,key):return round(e[key]*1e6+offset)
for trial in trials:
 w=events[trial['start_index']:trial['end_index']]
 def find(name,phase=None):return next((e for e in w if e['name']==name and(phase is None or e.get('phase')==phase)),None)
 for phase in ['flying','closing']:
  first,end=find('first-ui-motion',phase),find('ui-endpoint',phase); native=find('input-up'if phase=='flying'else'input-back')
  if first and end:
   windows.append({'cycle':trial['cycle'],'phase':phase,'stage':'startup','start_ns':ns(native,'native_ms'),'end_ns':ns(first,'ui_ms')})
   windows.append({'cycle':trial['cycle'],'phase':phase,'stage':'motion','start_ns':ns(first,'ui_ms'),'end_ns':ns(end,'ui_ms')})
 if trial['shared_open']:
  points=[('release',find('input-up'),'native_ms'),('navigate',find('navigate'),'js_ms'),('destination',find('destination-measured'),'js_ms'),('ready',find('takeoff-ready'),'js_ms'),('request',find('animation-requested','flying'),'js_ms'),('first',find('first-ui-motion','flying'),'ui_ms')]
  for (an,ae,ak),(bn,be,bk)in zip(points,points[1:]):
   if ae and be:windows.append({'cycle':trial['cycle'],'phase':'flying','stage':an+'-'+bn,'start_ns':ns(ae,ak),'end_ns':ns(be,bk)})
for win in windows:
 start,end=win['start_ns'],win['end_ns'];win['duration_ms']=(end-start)/1e6;states={}
 for r in threads:
  overlap=max(0,min(end,int(r['ts'])+int(r['dur']))-max(start,int(r['ts'])))/1e6
  if overlap:
   row=states.setdefault(r['name'],{});row[r['state']]=row.get(r['state'],0)+overlap
 win['thread_state_ms']=states
 # Frame deadline attribution cohort: app frames whose work begins within exact marker window.
 cohort=[r for r in frames if start<=int(r['ts'])<end]
 win['frame_records_started']={'n':len(cohort),'app_deadline_missed':sum('App Deadline Missed'in r['jank_type']for r in cohort),'dropped':sum(r['present_type']=='Dropped Frame'for r in cohort)}
 # Display-end cadence: distinct display frames presenting this activity surface inside marker window.
 displayed=sorted(set(int(r['display_end_ns'])for r in frames if r['display_end_ns']!='[NULL]'and r['present_type']!='Dropped Frame'and r['display_present_type']!='Dropped Frame'and start<=int(r['display_end_ns'])<=end))
 gaps=[(b-a)/1e6 for a,b in zip(displayed,displayed[1:])]
 win['display_frame_end_cadence']={'unique_display_frames':len(displayed),'presentation_end_timestamps_ns':displayed,'gap_ms':gaps,'gap_p50_ms':statistics.median(gaps)if gaps else None,'gap_p95_ms':sorted(gaps)[int((len(gaps)-1)*.95)]if gaps else None,'gap_max_ms':max(gaps)if gaps else None,'gaps_above_33_34_ms':sum(g>33.34 for g in gaps),'gaps_above_50_ms':sum(g>50 for g in gaps)}
summary={}
for phase in ['flying','closing']:
 for stage in ['startup','motion','release-navigate','navigate-destination','destination-ready','ready-request','request-first']:
  ws=[w for w in windows if w['phase']==phase and w['stage']==stage]
  if not ws:continue
  row={'n':len(ws),'duration_median_ms':statistics.median(w['duration_ms']for w in ws),'threads':{}}
  for thread in ['oelseisfree.app','mqt_v_js','RenderThread']:
   keys=set(k for w in ws for k in w['thread_state_ms'].get(thread,{}))
   row['threads'][thread]={k:statistics.median(w['thread_state_ms'].get(thread,{}).get(k,0)for w in ws)for k in keys}
  row['thread_derived']={}
  for thread in ['oelseisfree.app','mqt_v_js','RenderThread']:
   ss=[w['thread_state_ms'].get(thread,{})for w in ws]
   row['thread_derived'][thread]={'median_running_ms':statistics.median(x.get('Running',0)for x in ss),'median_runnable_ms':statistics.median(x.get('R',0)+x.get('R+',0)for x in ss),'median_sleeping_ms':statistics.median(x.get('S',0)for x in ss),'pooled_running_percent':100*sum(x.get('Running',0)for x in ss)/sum(w['duration_ms']for w in ws)}
  if stage=='motion':
   row['app_frames_started']=sum(w['frame_records_started']['n']for w in ws);row['app_deadline_missed']=sum(w['frame_records_started']['app_deadline_missed']for w in ws)
   for key in ['gap_p50_ms','gap_p95_ms','gap_max_ms','unique_display_frames']:
    vals=[w['display_frame_end_cadence'][key]for w in ws if w['display_frame_end_cadence'][key]is not None];row['median_trial_'+key]=statistics.median(vals)if vals else None
  summary[phase+'/'+stage]=row
result={'pid':16838,'clock_monotonic_to_trace_offset_ns':offset,'clock_offsets_ns':offsets,'trials_total':len(trials),'shared_open_completed':sum(t['shared_open']for t in trials),'shared_close_completed':sum(t['shared_close']for t in trials),'windows':windows,'summary':summary,'limits':['Window boundary is first sampled UI progress, not proof of first visible motion.','Display cadence joins activity surface frame tokens to SurfaceFlinger display ends; not hardware photon timestamps.','Cadence includes only intervals between activity-associated display ends inside window; excludes partial first/last intervals and deduplicates display tokens.','App deadline cohort uses app frame start in window; presentation cadence uses display end in window; denominators differ.','Thread-state Running is CPU execution; R/R+ runnable scheduling delay; S sleeping is not necessarily harmful blocking.','Per-thread/state medians do not add to median window length; inspect per-trial values.','One fallback trial retained in total but lacks shared-motion window.','Some distinct display tokens have nearly coincident end timestamps in this software-rendered emulator; reported display-end cadence must not be equated with distinct physical screen refreshes or hardware FPS.']}
(OUT/'results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(summary,indent=2));print('CLOCK OFFSET',offsets)
