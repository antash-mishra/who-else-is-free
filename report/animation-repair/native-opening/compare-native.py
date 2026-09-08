#!/usr/bin/env python3
"""Compare two native attribution result files descriptively, never causal proof."""
import argparse,json
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--baseline',type=Path,required=True)
p.add_argument('--candidate',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
a=p.parse_args();b=json.loads(a.baseline.read_text());c=json.loads(a.candidate.read_text())
def delta(x,y):
 return {'baseline':x,'candidate':y,'candidate_minus_baseline':y-x if x is not None and y is not None else None,'reduction_percent':100*(x-y)/x if x not in [None,0] and y is not None else None}
r={}
for key in sorted(set(b['summary'])|set(c['summary'])):
 x=b['summary'].get(key);y=c['summary'].get(key)
 if not x or not y:r[key]={'comparable':False};continue
 z={'baseline_n':x['n'],'candidate_n':y['n'],'duration_median_ms':delta(x['duration_median_ms'],y['duration_median_ms']),'native_scopes':{},'threads':{}}
 for k in set(x.get('native_scopes',{}))|set(y.get('native_scopes',{})):
  xv=x.get('native_scopes',{}).get(k);yv=y.get('native_scopes',{}).get(k)
  z['native_scopes'][k]=delta(xv['median'] if xv else None,yv['median'] if yv else None)
 for t in set(x['thread_derived'])|set(y['thread_derived']):
  z['threads'][t]={k:delta(x['thread_derived'].get(t,{}).get(k),y['thread_derived'].get(t,{}).get(k)) for k in ['median_running_ms','median_runnable_ms','median_sleeping_ms','pooled_running_percent']}
 for k in ['median_trial_gap_p50_ms','median_trial_gap_p95_ms','median_trial_gap_max_ms','median_trial_unique_display_frames']:
  if k in x or k in y:z[k]=delta(x.get(k),y.get(k))
 z['frame_cohorts']={k:{'frame_records':v.get('app_frames_started'),'deadline_misses':v.get('app_deadline_missed'),'miss_percent':100*v['app_deadline_missed']/v['app_frames_started'] if v.get('app_frames_started') else None} for k,v in [('baseline',x),('candidate',y)]}
 r[key]=z
result={'baseline':str(a.baseline),'candidate':str(a.candidate),'baseline_pid':b['pid'],'candidate_pid':c['pid'],'baseline_trials':b['trials_total'],'candidate_trials':c['trials_total'],'comparisons':r,'limits':['Single-trace descriptive comparison; unequal runs/host load/cache state are not paired statistical proof.','Keep matching AVD,renderer,density,scenario,cache-state labels,trace configuration and diagnostics. Tool cannot prove those match.','Native mount batches are not React commits; absent native commit instrumentation is null.','Scoped wall durations and overlapping thread CPU times cannot be summed.','Display-end cadence is not physical-device FPS; cohorts use different frame start/end boundaries.','Incomplete transitions remain in source totals; compare completion counts alongside successful-window metrics.']}
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,indent=2));print(a.output)
