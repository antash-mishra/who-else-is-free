#!/usr/bin/env python3
"""Measure explicit emulator UI steps. Inspect saved screenshots before accepting a run."""
import argparse,csv,io,json,pathlib,subprocess,time
p=argparse.ArgumentParser()
p.add_argument('--scenario',type=pathlib.Path,required=True)
p.add_argument('--output',type=pathlib.Path,required=True)
p.add_argument('--cycles',type=int,default=10)
p.add_argument('--window',type=float,default=1.6)
a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
adb=['adb','-s','emulator-5554'];package='com.whoelseisfree.app'
def shell(*args):return subprocess.check_output(adb+['shell',*map(str,args)],text=True,timeout=30)
if shell('getprop','ro.kernel.qemu').strip()!='1':raise SystemExit('Emulator required')
scenario=json.loads(a.scenario.read_text());(a.output/'scenario.json').write_text(json.dumps(scenario,indent=2))
metadata={'device':shell('getprop'),'display':shell('dumpsys','display'),'package':shell('dumpsys','package',package),'window_seconds':a.window,'cycles':a.cycles}
(a.output/'environment.json').write_text(json.dumps(metadata,indent=2))
results=[]
for cycle in range(a.cycles):
 for step in scenario:
  index=len(results);shell('dumpsys','gfxinfo',package,'reset')
  uptime=float(shell('cat','/proc/uptime').split()[0]);before=time.monotonic()
  shell('input',*step['input']);input_return=time.monotonic()
  time.sleep(a.window)
  raw=shell('dumpsys','gfxinfo',package,'framestats');(a.output/f'{index:03d}-open.txt').write_text(raw)
  frames=[]
  for block in raw.split('---PROFILEDATA---')[1::2]:
   for row in csv.DictReader(io.StringIO(block.strip())):
    try:
     start=int(row['IntendedVsync']);end=int(row['FrameCompleted'])
     if int(row['Flags'])==0 and uptime*1e9 <= start and 0<end-start<10_000_000_000:frames.append((start,end))
    except (KeyError,ValueError,TypeError):pass
  values=sorted((end-start)/1e6 for start,end in frames)
  def percentile(q):return values[min(len(values)-1,int((len(values)-1)*q))] if values else None
  r={'index':index,'cycle':cycle,'scenario':step['name'],'device_uptime_s':uptime,'frames':len(values),'gfxinfo_p50_ms':percentile(.5),'gfxinfo_p95_ms':percentile(.95),'gfxinfo_max_ms':max(values) if values else None,'drawing_span_ms':(max(x[0] for x in frames)-min(x[0] for x in frames))/1e6 if frames else None,'adb_input_command_ms':(input_return-before)*1000}
  results.append(r);(a.output/'results.json').write_text(json.dumps(results,indent=2))
  with (a.output/f'{index:03d}-{step["name"]}.png').open('wb') as f:subprocess.run(adb+['exec-out','screencap','-p'],stdout=f,check=True,timeout=30)
  print(json.dumps(r),flush=True)
  if not values:raise SystemExit('No frames: inspect screenshot; do not count as smooth')
  time.sleep(.3)
