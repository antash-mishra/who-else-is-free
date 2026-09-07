import subprocess,time,threading,json,sys
from pathlib import Path
name=sys.argv[1];mode=sys.argv[2] if len(sys.argv)>2 else 'pilot'
out=Path(name);out.mkdir(parents=True,exist_ok=False)
adb=['adb','-s','emulator-5554'];events=[];cv=threading.Condition();trials=[]
def shell(*a):return subprocess.check_output(adb+['shell',*map(str,a)],text=True,timeout=30)
assert shell('getprop','ro.kernel.qemu').strip()=='1'
def record(event):
 with cv:
  event['host_monotonic']=time.monotonic();events.append(event);cv.notify_all()
 with (out/'events.jsonl').open('a') as f:f.write(json.dumps(event)+'\n')
def read(stream,islog):
 for line in stream:
  try:
   if islog:
    if '[transition-metric] ' not in line:continue
    line=line.split('[transition-metric] ',1)[1]
   r=json.loads(line);r['origin']='app' if islog else 'input';record(r)
  except (ValueError,IndexError):pass
log=subprocess.Popen(adb+['logcat','-v','raw','-T','1','ReactNativeJS:I','*:S'],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
driver=subprocess.Popen(adb+['shell','CLASSPATH=/data/local/tmp/weif-latency.dex app_process /data/local/tmp LatencyInput'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
for p,flag in [(log,True),(driver,False)]:threading.Thread(target=read,args=(p.stdout,flag),daemon=True).start()
def wait(name,start=0,phase=None,timeout=5):
 until=time.monotonic()+timeout
 with cv:
  while time.monotonic()<until:
   for e in events[start:]:
    if e['name']==name and (phase is None or e.get('phase')==phase):return e
   cv.wait(max(.01,until-time.monotonic()))
 return None
def send(s):driver.stdin.write(s+'\n');driver.stdin.flush()
def screenshot(n):
 with (out/(n+'.png')).open('wb') as f:subprocess.run(adb+['exec-out','screencap','-p'],stdout=f,check=True)
def open_card():
 start=len(events);send('tap 100 410 60');end=wait('ui-endpoint',start,'flying',5)
 if not end:screenshot('fallback-open')
 return start,end
def close_page():
 start=len(events);send('back');end=wait('ui-endpoint',start,'closing',5)
 if not end:screenshot('fallback-close')
 return start,end
try:
 assert wait('driver-ready',timeout=30)
 if mode in ('pilot','normal'):
  for i in range(1 if mode=='pilot' else 7):
   start,end=open_card();screenshot(f'{i:02d}-details');time.sleep(.25)
   close_start,closed=close_page();unmounted=wait('page-unmount',close_start,timeout=4);screenshot(f'{i:02d}-feed')
   trials.append({'kind':'normal','cycle':i,'start_index':start,'end_index':len(events),'close_start_index':close_start,'shared_open':bool(end),'shared_close':bool(closed)});print(json.dumps(trials[-1]),flush=True);time.sleep(.5)
 else:
  # Target a range around the 400 ms return. Use actual injected timestamps
  # relative to the measured UI endpoint in analysis, not these host delays.
  for i,delay in enumerate([.35,.45,.55,.65,.8,1.0]*3):
   start,opened=open_card();time.sleep(.3)
   if not opened:
    ci,ce=close_page();wait('page-unmount',ci,timeout=4);time.sleep(.4);continue
   close_start=len(events);send('back');back=wait('input-back',close_start)
   time.sleep(delay);tap_start=len(events);send('tap 100 410 60')
   reopened=wait('ui-endpoint',tap_start,'flying',2.5)
   screenshot(f'{i:02d}-retap')
   trials.append({'kind':'retap','cycle':i,'requested_delay_s':delay,'start_index':start,'close_start_index':close_start,'tap_start_index':tap_start,'end_index':len(events),'reopened':bool(reopened)})
   print(json.dumps(trials[-1]),flush=True)
   if reopened:
    ci,ce=close_page();assert wait('page-unmount',ci,timeout=4)
   else:assert wait('page-unmount',close_start,timeout=4)
   time.sleep(.4)
finally:
 (out/'trials.json').write_text(json.dumps(trials,indent=2)+'\n')
 driver.stdin.close();driver.terminate();log.terminate()
