from pathlib import Path
import subprocess,json,hashlib,time,os,signal
p=Path.cwd();base=json.loads((p/'evidence/base-manifest.json').read_text());state=lambda:{n:hashlib.sha256((p/n).read_bytes()).hexdigest() for n in base['source']};assert state()==base['source'];start=time.monotonic();command=['/workspace/shared/rea-tools/node_modules/node/bin/node','--experimental-vm-modules','evidence/author-style-native-probe.mjs','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux','evidence/native-author-style.json'];watchdog=False
with (p/'evidence/native-author-style.log').open('xb')as log:
 child=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:code=child.wait(timeout=15)
 except subprocess.TimeoutExpired:
  watchdog=True;os.killpg(child.pid,signal.SIGTERM)
  try:code=child.wait(timeout=3)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
after=state();result={'command':command,'exit':code,'seconds':time.monotonic()-start,'outerWatchdog':15,'cleanupGrace':3,'watchdogTriggered':watchdog,'sourceInputs':len(after),'changed':[n for n in after if after[n]!=base['source'][n]]};(p/'evidence/native-author-style-status.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
