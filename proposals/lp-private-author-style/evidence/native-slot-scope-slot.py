from pathlib import Path
import subprocess,json,hashlib,time,os,signal,sys
p=Path.cwd();manifest=p/'evidence/native-slot-scope-inputs.json';expected=json.loads(manifest.read_text())
def digest(path):
 h=hashlib.sha256()
 with path.open('rb')as source:
  for block in iter(lambda:source.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def path(name):return Path(name[9:])if name.startswith('absolute:')else p/name
def state():return{n:digest(path(n))for n in expected}
assert state()==expected,'Frozen Native slot inputs changed before launch'
node='/workspace/shared/rea-tools/node_modules/node/bin/node';binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';command=[node,'--experimental-vm-modules','evidence/slot-scope-probe.mjs',binary,'evidence/native-slot-scope.json'];start=time.monotonic();watchdog=False
with(p/'evidence/native-slot-scope.log').open('xb')as log:
 child=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:code=child.wait(timeout=10)
 except subprocess.TimeoutExpired:
  watchdog=True;os.killpg(child.pid,signal.SIGTERM)
  try:code=child.wait(timeout=3)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
after=state();rawfile=p/'evidence/native-slot-scope.json';progress=p/'evidence/native-slot-scope.json.progress.json';raw=json.loads(rawfile.read_text())if rawfile.exists()else json.loads(progress.read_text())if progress.exists()else{};groups=raw.get('groups',[]);complete=rawfile.exists()and len(groups)==2 and all(g.get('completed')is True for g in groups)and not raw.get('failure');producer=raw.get('pid');present=bool(producer)and Path('/proc/'+str(producer)).exists();result={'command':command,'exit':code,'seconds':time.monotonic()-start,'outerWatchdog':10,'cleanupGrace':3,'watchdogTriggered':watchdog,'sourceInputs':len(after),'changed':[n for n in expected if after[n]!=expected[n]],'manifestSHA256':digest(manifest),'groups':len(groups),'completedGroups':sum(g.get('completed')is True for g in groups),'complete':complete,'producerPID':producer,'producerPresentAfterCleanup':present,'rawFile':str(rawfile if rawfile.exists()else progress if progress.exists()else''),'guardedNode':expected['absolute:'+node],'guardedNative':expected['absolute:'+binary]};(p/'evidence/native-slot-scope-status.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True);sys.exit(1 if code!=0 or watchdog or result['changed']or not complete or present else 0)
