from pathlib import Path
import subprocess,json,time,hashlib,os,signal,sys
p=Path.cwd();c=p/'candidate';base=json.loads((p/'evidence/first-candidate-inputs.json').read_text());state=lambda:{n:hashlib.sha256((c/n).read_bytes()).hexdigest()for n in base};assert state()==base
frozen=json.loads(Path('/workspace/red-panda/.cache/validation/phase22-full-diagnostic/full-source-before.json').read_text());deps={n:h for n,h in frozen.items()if n.startswith('node_modules/')};depstate=lambda:{n:hashlib.sha256((Path('/workspace/red-panda')/n).read_bytes()).hexdigest()for n in deps};assert depstate()==deps
command=['/workspace/shared/rea-tools/node_modules/node/bin/node','--experimental-vm-modules','--test','--test-concurrency=1','test/lp-private-author-style.test.js'];start=time.monotonic();watchdog=False
with(p/'evidence/first-candidate.log').open('xb')as log:
 child=subprocess.Popen(command,cwd=c,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:code=child.wait(timeout=45)
 except subprocess.TimeoutExpired:
  watchdog=True;os.killpg(child.pid,signal.SIGTERM)
  try:code=child.wait(timeout=3)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
source=state();afterdeps=depstate();result={'command':command,'exit':code,'seconds':time.monotonic()-start,'outerWatchdog':45,'cleanupGrace':3,'watchdogTriggered':watchdog,'sourceInputs':len(source),'changed':[n for n in base if source[n]!=base[n]],'dependencyInputs':len(deps),'dependencyChanged':[n for n in deps if afterdeps[n]!=deps[n]]};(p/'evidence/first-candidate-status.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True);sys.exit(code if code else bool(result['changed']or result['dependencyChanged']))
