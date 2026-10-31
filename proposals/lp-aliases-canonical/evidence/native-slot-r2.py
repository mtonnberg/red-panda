from pathlib import Path
import json,hashlib,subprocess,time,os,signal
p=Path.cwd();base=json.loads((p/'evidence/base-manifest.json').read_text());state=lambda:{n:hashlib.sha256((p/n).read_bytes()).hexdigest() for n in base['source']};assert state()==base['source'];start=time.monotonic()
command=['/workspace/shared/rea-tools/node_modules/node/bin/node','--experimental-vm-modules','evidence/native-alias-probe-r2.mjs','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux','evidence/native-aliases-r2.json'];watchdog=False
with (p/'evidence/native-aliases-r2.log').open('xb')as log:
 child=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:code=child.wait(timeout=25)
 except subprocess.TimeoutExpired:
  watchdog=True;os.killpg(child.pid,signal.SIGTERM)
  try:code=child.wait(timeout=3)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
after=state();(p/'evidence/native-status-r2.json').write_text(json.dumps({'command':command,'exit':code,'seconds':time.monotonic()-start,'adminWatchdogSeconds':25,'cleanupGraceSeconds':3,'watchdogTriggered':watchdog,'sourceInputs':len(after),'changed':[n for n,h in base['source'].items() if after[n]!=h]},indent=2)+'\n');print((p/'evidence/native-status-r2.json').read_text())
