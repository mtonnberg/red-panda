from pathlib import Path
import subprocess,json,time
p=Path(__file__).parent;s=Path('/workspace/shared/css-stylesheet-loading-20261031');steps=[]
for leaf in ['stylesheet_charset','stylesheet_event_order']:
 command=['/workspace/shared/rea-tools/node_modules/node/bin/node','scripts/conformance.mjs','--root','/workspace/red-panda/.cache/lightpanda-reference/browser-948d773786/src/browser/tests','--binary',str(s/'candidate-browser'),'--test','css/'+leaf+'.html','--isolate','--fixture-profile','upstream','--source-load-contract','--registration-map','/workspace/red-panda/proposals/candidate455-phase17/registration-map.json','--port','0','--report',str(p/f'candidate-source-final-{leaf}.json')]
 start=time.time()
 with (p/f'candidate-source-final-{leaf}.log').open('w') as log:
  result=subprocess.run(command,cwd=s,stdout=log,stderr=subprocess.STDOUT,timeout=30)
 steps.append({'fixture':leaf,'command':command,'exitCode':result.returncode,'durationSeconds':round(time.time()-start,3)});(p/'source-final-run-status.json').write_text(json.dumps(steps,indent=2)+'\n');print(leaf,result.returncode,flush=True)
