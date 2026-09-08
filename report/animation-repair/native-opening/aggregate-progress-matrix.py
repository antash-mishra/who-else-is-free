#!/usr/bin/env python3
"""Aggregate complete controlled matrices using native-input and buffered UI samples."""
import argparse,importlib.util,json,statistics
from pathlib import Path
spec=importlib.util.spec_from_file_location('progress_analyzer', '/tmp/weif-opening-native/analyze-progress.py')
progress=importlib.util.module_from_spec(spec);spec.loader.exec_module(progress)

def stats(v):
 return {'n':len(v),'median':statistics.median(v),'min':min(v),'max':max(v),'values':v}if v else None

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('matrix',type=Path);p.add_argument('--output',type=Path);a=p.parse_args();base=a.matrix;meta=json.loads((base/'comparison.json').read_text())
 if meta['status']!='complete':p.error('Matrix not complete; wait for root completion notice')
 groups={};blocks=[]
 for b in meta['blocks']:
  block={'directory':b['directory'],'variant':b['variant'],'states':{}}
  for kind in ['process-first','repeated']:
   folder=base/b['directory']/kind
   if not(folder/'trials.json').exists():continue
   pr=progress.analyze(folder);lat=json.loads((folder/'analysis.json').read_text());bycycle={r['cycle']:r for r in lat['trials']};block['states'][kind]={'progress':pr['summary'],'latency':lat['summary']}
   for row in pr['trials']:
    row['block']=b['directory'];row['latency']=bycycle.get(row['cycle'],{});groups.setdefault((b['variant'],kind,row.get('phase','unknown')),[]).append(row)
  blocks.append(block)
 result={'matrix':str(base),'apks':meta['apks'],'state':meta.get('state'),'sequence':meta['sequence'],'blocks':blocks,'groups':{},'reference_comparisons':{},'limits':progress.analyze(base/meta['blocks'][0]['directory']/'process-first')['limits']+['Ablation comparison changes blur, but sequential block host variation and small sample sizes limit causal precision.','Capped sample buffers are excluded from cadence aggregates but still reported.','Separate stage medians do not sum to end-to-end median.']}
 metrics=['sample_count','max_progress_jump','first_sample_to_endpoint_ms','first_sample_to_completion_ms','input_to_endpoint_ms','completion_to_last_sample_ms']
 for key,rows in groups.items():
  variant,kind,phase=key;statuses={}
  for row in rows:statuses[row['status']]=statuses.get(row['status'],0)+1
  complete=[r for r in rows if r['status']=='complete'];summary={'trials':len(rows),'statuses':statuses,'dropped_samples_total':sum(r.get('dropped_samples',0)for r in rows),'metrics':{},'trials_detail':rows}
  for metric in metrics:summary['metrics'][metric]=stats([r[metric]for r in complete if r.get(metric)is not None])
  for q in ['median','p95','max']:summary['metrics']['trial_gap_'+q+'_ms']=stats([r['intersample_gap_ms'][q]for r in complete if r.get('intersample_gap_ms')])
  for metric in (['up_to_motion','mount_measure','dest_to_ready','ready_to_motion']if phase=='flying'else['back_to_motion','endpoint_to_unmount']):
   summary['metrics'][metric]=stats([r['latency'][metric]for r in rows if metric in r['latency']])
  result['groups']['/'.join(key)]=summary
 variants=list(meta['apks']);ref=variants[0]
 for variant in variants[1:]:
  for kind in ['process-first','repeated']:
   for phase in ['flying','closing']:
    left=result['groups'].get('/'.join([ref,kind,phase]),{}).get('metrics',{});right=result['groups'].get('/'.join([variant,kind,phase]),{}).get('metrics',{});comparisons={}
    for metric in left.keys()&right.keys():
     x,y=left[metric],right[metric]
     if x and y:comparisons[metric]={'reference_n':x['n'],'candidate_n':y['n'],'delta_ms_or_units':y['median']-x['median'],'median_reduction_percent':100*(x['median']-y['median'])/x['median']if x['median']else None}
    result['reference_comparisons']['/'.join([variant,kind,phase])]=comparisons
 output=a.output or base.with_name(base.name+'-progress-summary.json');output.write_text(json.dumps(result,indent=2)+'\n')
 for key,summary in result['groups'].items():print(key,summary['statuses'],{k:round(v['median'],2)for k,v in summary['metrics'].items()if v})
 print('Saved',output)
if __name__=='__main__':main()
