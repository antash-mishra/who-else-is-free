#!/usr/bin/env python3
"""Compare matching scenarios; first cycle excluded, screenshots must be checked separately."""
import argparse,csv,json,pathlib,statistics
p=argparse.ArgumentParser();p.add_argument('baseline',type=pathlib.Path);p.add_argument('fixed',type=pathlib.Path);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
def quantile(v,q):
 v=sorted(v);return v[int((len(v)-1)*q)]
def summarize(directory):
 runs=json.loads((directory/'results.json').read_text());frames={int(x['sample']):x for x in csv.DictReader((directory/'frame-timeline.csv').open())};out={}
 for name in dict.fromkeys(x['scenario'] for x in runs):
  samples=[x for x in runs if x['scenario']==name and x['cycle']>0]
  if not samples:continue
  data=[frames[x['index']] for x in samples]
  if any(not x.get('actual_durations_ns') for x in data):raise ValueError('Rerun summarize_trace.py to retain frame durations')
  p95=[quantile([int(d)/1e6 for d in x['actual_durations_ns'].split(',')],.95) for x in data]
  count=sum(int(x['app_frame_records']) for x in data);miss=sum(int(x['app_deadline_misses']) for x in data)
  out[name]={'samples':len(samples),'median_trial_p95_ms':statistics.median(p95),'trial_p95_range_ms':[min(p95),max(p95)],'app_frame_records':count,'app_deadline_misses':miss,'app_deadline_miss_pct':100*miss/count,'median_gfxinfo_p95_ms':statistics.median(x['gfxinfo_p95_ms'] for x in samples)}
 return out
b=summarize(a.baseline);f=summarize(a.fixed);result={}
for name in b.keys() & f.keys():
 x,y=b[name],f[name];result[name]={'baseline':x,'fixed':y,'p95_reduction_pct':100*(x['median_trial_p95_ms']-y['median_trial_p95_ms'])/x['median_trial_p95_ms'],'deadline_reduction_percentage_points':x['app_deadline_miss_pct']-y['app_deadline_miss_pct']}
a.output.write_text(json.dumps(result,indent=2))
for name,v in sorted(result.items()):print(name, 'p95 ms',round(v['baseline']['median_trial_p95_ms'],1),'->',round(v['fixed']['median_trial_p95_ms'],1),'change %',round(v['p95_reduction_pct'],1),'miss %',round(v['baseline']['app_deadline_miss_pct'],1),'->',round(v['fixed']['app_deadline_miss_pct'],1))
