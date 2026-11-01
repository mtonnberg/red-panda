from pathlib import Path
import json,os,signal,time,socket
out=Path('.cache/validation/pointer-public-environment');prior=json.loads(Path('.cache/validation/navigator-environment/current-service.json').read_text());expected=prior['process'];pid=expected['pid']
def identity():
 p=Path('/proc')/str(pid);tail=(p/'stat').read_text().rsplit(')',1)[1].split();return {'pid':pid,'startTicks':int(tail[19]),'argv':(p/'cmdline').read_bytes().decode().strip('\0').split('\0'),'state':tail[0]}
a=identity();assert all(a[n]==expected[n]for n in ['pid','startTicks','argv']);(out/'prior-service-stop.json').write_text(json.dumps({'expected':expected,'actual':a,'signal':'SIGTERM'},indent=2)+'\n');os.kill(pid,signal.SIGTERM)
end=time.monotonic()+10
while time.monotonic()<end:
 try:
  row=identity()
  if row['startTicks']!=a['startTicks']:raise RuntimeError('PID reused; do not touch replacement')
 except FileNotFoundError:break
 time.sleep(.05)
else:raise RuntimeError('Prior identity still present')
s=socket.socket();s.settimeout(1);closed=s.connect_ex(('127.0.0.1',9222))!=0;s.close();assert closed;(out/'prior-stopped.json').write_text(json.dumps({'pid':pid,'startTicks':a['startTicks'],'absent':True,'port9222Closed':True},indent=2)+'\n');print('Prior owned service stopped; PID absent and9222closed')
