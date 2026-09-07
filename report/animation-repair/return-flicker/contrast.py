from pathlib import Path
from PIL import Image
import json,sys
base=Path(sys.argv[2]) if len(sys.argv)>2 else Path(__file__).resolve().parent
name=sys.argv[1]
frames=sorted((base/(name+'-frames')).glob('*.png'))
pts=json.loads((base/(name+'-pts.json')).read_text())['frames']
# Interior of the returned first cover, above the Hosting badge. Avoid corner edges.
box=(36,359,160,435)
ref=[255-v for v in Image.open(frames[-1]).convert('RGB').crop(box).tobytes()]
den=sum(v*v for v in ref)
rows=[]
for index,(frame,pt) in enumerate(zip(frames,pts)):
    pixels=Image.open(frame).convert('RGB').crop(box).tobytes()
    contrast=sum((255-v)*r for v,r in zip(pixels,ref))/den
    rows.append({'frame':index+1,'time_s':float(pt['best_effort_timestamp_time']),'contrast_ratio':round(contrast,6)})
(base/(name+'-contrast.json')).write_text(json.dumps({'roi_xyxy':box,'reference_frame':len(frames),'formula':'sum((255-frame)*(255-reference))/sum((255-reference)^2), RGB bytes','frames':rows},indent=2)+'\n')
for r in rows:
    if 5.3<r['time_s']<7 or r['time_s']>12.5:print(r)
