import csv,json
from pathlib import Path
p=Path('/tmp/weif-opening-native/pipeline-analysis');states=list(csv.DictReader((p/'states.csv').open()));slices=list(csv.DictReader((p/'slices.csv').open()));w=json.loads((p/'windows.json').read_text());trials=json.load(open('/tmp/weif-input-latency/native-baseline-01/trials.json'));summary=[]
for n,label,b,e in w:
 if label!='opening':continue
 d={'cycle':n,'shared_open_completed':trials[n]['shared_open'],'release_to_first_observed_motion_ms':round(e-b,3),'threads':{}}
 for tid,name in [('16838','main'),('16880','JS'),('16871','RenderThread')]:
  rows=[x for x in states if x['cycle']==str(n) and x['label']=='opening' and x['tid']==tid]
  v={x['state']:float(x['overlap_ms']) for x in rows}
  d['threads'][name]={'running_ms':round(v.get('Running',0),3),'runnable_ms':round(v.get('R',0)+v.get('R+',0),3),'sleep_ms':round(v.get('S',0),3)}
 rows=[x for x in slices if x['cycle']==str(n)]
 d['main_postAndWait_elapsed_ms']=round(sum(float(x['overlap_ms']) for x in rows if x['name']=='postAndWait' and x['tid']=='16838'),3)
 d['main_mount_dispatch_elapsed_ms']=round(sum(float(x['overlap_ms']) for x in rows if x['name'].startswith('MountItemDispatcher::mountViews') and x['tid']=='16838'),3)
 summary.append(d)
(p/'summary.json').write_text(json.dumps(summary,indent=2))
