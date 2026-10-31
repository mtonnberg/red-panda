from pathlib import Path
import subprocess,json,time,hashlib,os,signal,sys
p=Path.cwd();c=p/'candidate';phase=sys.argv[1]if len(sys.argv)>1 else'seven';sdk=sys.argv[2]if len(sys.argv)>2 else'24.22.1';nodes={'24.22.1':'/workspace/shared/rea-tools/node_modules/node/bin/node','24.19.0':'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node','26.13.0':'/workspace/shared/node26/node_modules/node/bin/node'};node=nodes[sdk]
inputs=json.loads((p/'evidence/corrected-candidate-inputs.json').read_text());state=lambda:{n:hashlib.sha256((p/n).read_bytes()).hexdigest()for n in inputs};assert state()==inputs
frozen=json.loads(Path('/workspace/red-panda/.cache/validation/phase22-full-diagnostic/full-source-before.json').read_text());deps={n:h for n,h in frozen.items()if n.startswith('node_modules/')};depstate=lambda:{n:hashlib.sha256((Path('/workspace/red-panda')/n).read_bytes()).hexdigest()for n in deps};assert depstate()==deps
output=p/('evidence/corrected-'+phase+'-'+sdk);cwd=c;outer=45
if phase=='seven':command=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/lp-private-author-style.test.js']
elif phase=='realms':command=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/cssom-private-realms.test.js']
elif phase=='regressions':
 command=[node,'--experimental-vm-modules','--test','--test-concurrency=1',*['test/'+name+'.test.js'for name in['cssom','styles','selectors','css-compat','dump','lp-aliases']]];outer=90
elif phase in['owner','cache']:
 assert sdk=='24.22.1','Raw candidate CLI wrapper is pinned to Node24.22.1';cwd=p;probe='candidate-renderer-owner-probe.mjs'if phase=='owner'else'style-cache-probe.mjs';command=[node,'--experimental-vm-modules','evidence/'+probe,str(p/'evidence/candidate-cli'),str(output)+'.json'];outer=20
else:raise ValueError(phase)
start=time.monotonic();watchdog=False
with Path(str(output)+'.log').open('xb')as log:
 child=subprocess.Popen(command,cwd=cwd,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:code=child.wait(timeout=outer)
 except subprocess.TimeoutExpired:
  watchdog=True;os.killpg(child.pid,signal.SIGTERM)
  try:code=child.wait(timeout=3)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
after=state();afterdeps=depstate();result={'phase':phase,'sdk':sdk,'command':command,'cwd':str(cwd),'exit':code,'seconds':time.monotonic()-start,'outerWatchdog':outer,'cleanupGrace':3,'watchdogTriggered':watchdog,'sourceInputs':len(inputs),'changed':[n for n in inputs if after[n]!=inputs[n]],'dependencyInputs':len(deps),'dependencyChanged':[n for n in deps if afterdeps[n]!=deps[n]],'controllerSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
if phase in['owner','cache']and Path(str(output)+'.json').exists():
 raw=json.loads(Path(str(output)+'.json').read_text());result['observations']={'groups':len(raw['groups']),'completed':sum(g['completed']for g in raw['groups']),'failures':[{'name':g['name'],'failure':g.get('failure')}for g in raw['groups']if not g['completed']],'producerPID':raw.get('pid'),'producerPresentAfterCleanup':Path('/proc/'+str(raw.get('pid'))).exists()}
Path(str(output)+'-status.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True);sys.exit(code if code else bool(result['changed']or result['dependencyChanged']))
