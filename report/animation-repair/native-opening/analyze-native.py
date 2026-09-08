import argparse,csv,io,json,statistics,subprocess
from pathlib import Path
parser=argparse.ArgumentParser(description='Native transition attribution; no device operations')
parser.add_argument('--trace',type=Path,required=True)
parser.add_argument('--events',type=Path,required=True,help='events.jsonl')
parser.add_argument('--trials',type=Path,help='trials.json; defaults beside events')
parser.add_argument('--pid',type=int,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--processor',default='/tmp/weif-animation-benchmark/trace_processor')
args=parser.parse_args()
OUT=args.output;OUT.mkdir(parents=True,exist_ok=True)
TRACE=args.trace;TP=args.processor;PID=args.pid
TRIALS=args.trials or args.events.parent/'trials.json'

def query(name,sql):
 (OUT/(name+'.sql')).write_text(sql+'\n');raw=subprocess.check_output([TP,str(TRACE),'-Q',sql],text=True,stderr=subprocess.DEVNULL);(OUT/(name+'.csv')).write_text(raw);return list(csv.DictReader(io.StringIO(raw)))
clocks=query('clocks',"SELECT * FROM clock_snapshot WHERE clock_name IN ('MONOTONIC','BOOTTIME','REALTIME') ORDER BY snapshot_id,clock_id")
offsets=[int(r['ts'])-int(r['clock_value'])for r in clocks if r['clock_name']=='MONOTONIC'];offset=statistics.median(offsets) if offsets else None
if offset is None:raise SystemExit('No MONOTONIC clock snapshot; do not assume clock alignment')
threads=query('thread-states',f"SELECT t.tid,CASE WHEN t.is_main_thread=1 THEN 'MainThread' ELSE t.name END AS name,s.ts,s.dur,s.state,s.io_wait,s.blocked_function FROM thread_state s JOIN thread t USING(utid) JOIN process p USING(upid) WHERE p.pid={PID} AND (t.is_main_thread=1 OR t.name IN ('mqt_v_js','RenderThread')) AND s.dur>0 ORDER BY s.ts")
frames=query('frames',f"SELECT a.id,a.ts,a.dur,a.surface_frame_token,a.display_frame_token,a.layer_name,a.present_type,a.jank_type,a.on_time_finish, f.ts AS display_start_ns,f.dur AS display_duration_ns,f.ts+f.dur AS display_end_ns,f.present_type AS display_present_type FROM actual_frame_timeline_slice a JOIN process p ON p.upid=a.upid LEFT JOIN actual_frame_timeline_slice f ON f.display_frame_token=a.display_frame_token AND f.surface_frame_token IS NULL AND f.dur>0 WHERE p.pid={PID} AND a.layer_name LIKE '%MainActivity%' AND a.dur>0 ORDER BY a.ts")
events=sorted([json.loads(l)for l in args.events.read_text().splitlines()],key=lambda e:e['host_monotonic']); trials=json.loads(TRIALS.read_text());windows=[]
def ns(e,key):return round(e[key]*1e6+offset)
for trial in trials:
 w=events[trial['start_index']:trial['end_index']]
 def find(name,phase=None):return next((e for e in w if e['name']==name and(phase is None or e.get('phase')==phase)),None)
 for phase in ['flying','closing']:
  first,end=find('first-ui-motion',phase),find('ui-endpoint',phase); native=find('input-up'if phase=='flying'else'input-back')
  if first and end and native:
   windows.append({'cycle':trial['cycle'],'phase':phase,'stage':'startup','start_ns':ns(native,'native_ms'),'end_ns':ns(first,'ui_ms')})
   windows.append({'cycle':trial['cycle'],'phase':phase,'stage':'motion','start_ns':ns(first,'ui_ms'),'end_ns':ns(end,'ui_ms')})
 if trial['shared_open']:
  points=[('release',find('input-up'),'native_ms'),('navigate',find('navigate'),'js_ms'),('destination',find('destination-measured'),'js_ms'),('ready',find('takeoff-ready'),'js_ms'),('request',find('animation-requested','flying'),'js_ms'),('first',find('first-ui-motion','flying'),'ui_ms')]
  for (an,ae,ak),(bn,be,bk)in zip(points,points[1:]):
   if ae and be:windows.append({'cycle':trial['cycle'],'phase':'flying','stage':an+'-'+bn,'start_ns':ns(ae,ak),'end_ns':ns(be,bk)})
bounds=query('trace-bounds','SELECT start_ts,end_ts FROM trace_bounds')[0]
if not threads:raise SystemExit('Requested PID has no matching main/JS/RenderThread states; verify PID')
if any(w['start_ns']<int(bounds['start_ts']) or w['end_ns']>int(bounds['end_ts']) for w in windows):raise SystemExit('A measured window lies outside this trace; verify matching capture/clock mapping')
slices=query('native-scopes',f"SELECT s.name,s.ts,s.dur,t.tid,t.name AS thread_name,t.is_main_thread FROM slice s JOIN thread_track tt ON s.track_id=tt.id JOIN thread t USING(utid) JOIN process p USING(upid) WHERE p.pid={PID} AND s.dur>0 AND (s.name GLOB 'ShadowTree::commit*' OR s.name='IntBufferBatchMountItem::mountViews' OR s.name='postAndWait' OR s.name='[ExpoImage] onResourceReady' OR (t.name='RenderThread' AND s.name GLOB 'DrawFrame*')) ORDER BY s.ts")
commit_scopes_available=any(x['name'].startswith('ShadowTree::commit') for x in slices)
if not windows:raise SystemExit('No completed transition windows; inspect markers rather than report zero cost')
for win in windows:
 start,end=win['start_ns'],win['end_ns'];win['duration_ms']=(end-start)/1e6;states={}
 for r in threads:
  overlap=max(0,min(end,int(r['ts'])+int(r['dur']))-max(start,int(r['ts'])))/1e6
  if overlap:
   row=states.setdefault(r['name'],{});row[r['state']]=row.get(r['state'],0)+overlap
 win['thread_state_ms']=states
 def scope_count(predicate):return sum(predicate(r) and start<=int(r['ts'])<end for r in slices)
 def scope_elapsed(predicate):return sum(max(0,min(end,int(r['ts'])+int(r['dur']))-max(start,int(r['ts'])))/1e6 for r in slices if predicate(r))
 win['native_scopes']={
  'native_commit_scopes_started':scope_count(lambda r:r['name'].startswith('ShadowTree::commit')) if commit_scopes_available else None,
  'fabric_mount_batches_started':scope_count(lambda r:r['name']=='IntBufferBatchMountItem::mountViews'),
  'fabric_mount_batch_elapsed_ms':scope_elapsed(lambda r:r['name']=='IntBufferBatchMountItem::mountViews'),
  'main_postAndWait_elapsed_ms':scope_elapsed(lambda r:r['name']=='postAndWait' and r['is_main_thread']=='1'),
  'image_install_callbacks_started':scope_count(lambda r:r['name']=='[ExpoImage] onResourceReady'),
  'render_draw_frames_started':scope_count(lambda r:r['thread_name']=='RenderThread' and r['name'].startswith('DrawFrame'))}
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
  for thread in ['MainThread','mqt_v_js','RenderThread']:
   keys=set(k for w in ws for k in w['thread_state_ms'].get(thread,{}))
   row['threads'][thread]={k:statistics.median(w['thread_state_ms'].get(thread,{}).get(k,0)for w in ws)for k in keys}
  row['native_scopes']={}
  for metric in ws[0]['native_scopes']:
   vals=[w['native_scopes'][metric] for w in ws if w['native_scopes'][metric] is not None]
   row['native_scopes'][metric]={'n':len(vals),'median':statistics.median(vals),'min':min(vals),'max':max(vals)} if vals else None
  row['thread_derived']={}
  for thread in ['MainThread','mqt_v_js','RenderThread']:
   ss=[w['thread_state_ms'].get(thread,{})for w in ws]
   row['thread_derived'][thread]={'median_running_ms':statistics.median(x.get('Running',0)for x in ss),'median_runnable_ms':statistics.median(x.get('R',0)+x.get('R+',0)for x in ss),'median_sleeping_ms':statistics.median(x.get('S',0)for x in ss),'pooled_running_percent':100*sum(x.get('Running',0)for x in ss)/sum(w['duration_ms']for w in ws)}
  if stage=='motion':
   row['app_frames_started']=sum(w['frame_records_started']['n']for w in ws);row['app_deadline_missed']=sum(w['frame_records_started']['app_deadline_missed']for w in ws)
   for key in ['gap_p50_ms','gap_p95_ms','gap_max_ms','unique_display_frames']:
    vals=[w['display_frame_end_cadence'][key]for w in ws if w['display_frame_end_cadence'][key]is not None];row['median_trial_'+key]=statistics.median(vals)if vals else None
  summary[phase+'/'+stage]=row
result={'pid':PID,'trace':str(TRACE),'events':str(args.events),'clock_monotonic_to_trace_offset_ns':offset,'clock_offsets_ns':offsets,'trials_total':len(trials),'shared_open_completed':sum(t['shared_open']for t in trials),'shared_close_completed':sum(t['shared_close']for t in trials),'windows':windows,'summary':summary,'native_commit_scopes_available':commit_scopes_available,'limits':['Fabric mount-batch count is not React commit count; unavailable native commit scopes are null, not zero.','Native scoped durations include descheduled time and are not exclusive CPU milliseconds.','One trace comparison is descriptive only, not paired statistical proof.','Window boundary is first sampled UI progress, not proof of first visible motion.','Display cadence joins activity surface frame tokens to SurfaceFlinger display ends; not hardware photon timestamps.','Cadence includes only intervals between activity-associated display ends inside window; excludes partial first/last intervals and deduplicates display tokens.','App deadline cohort uses app frame start in window; presentation cadence uses display end in window; denominators differ.','Thread-state Running is CPU execution; R/R+ runnable scheduling delay; S sleeping is not necessarily harmful blocking.','Per-thread/state medians do not add to median window length; inspect per-trial values.','Incomplete transitions retained in totals; motion windows require first-motion and endpoint markers.','Some distinct display tokens have nearly coincident end timestamps in this software-rendered emulator; reported display-end cadence must not be equated with distinct physical screen refreshes or hardware FPS.']}
(OUT/'results.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(summary,indent=2));print('CLOCK OFFSET',offsets)
