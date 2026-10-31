from pathlib import Path
import subprocess,json,time
p=Path(__file__).parent;s=Path('/workspace/shared/css-source-liveness-20261031');steps=[]
for index in range(1,4):
 command=['/workspace/shared/rea-tools/node_modules/node/bin/node','scripts/conformance.mjs','--root','/workspace/red-panda/.cache/lightpanda-reference/browser-948d773786/src/browser/tests','--binary',str(s/'candidate-browser'),'--test','css/external_stylesheet.html','--isolate','--fixture-profile','upstream','--source-load-contract','--registration-map','/workspace/red-panda/proposals/candidate455-phase17/registration-map.json','--port','9582','--report',str(p/f'candidate-canonical-final-{index}.json')]
 begin=time.time()
 with (p/f'candidate-canonical-final-{index}.log').open('w') as log:result=subprocess.run(command,cwd=s,stdout=log,stderr=subprocess.STDOUT,timeout=25)
 steps.append({'index':index,'command':command,'exitCode':result.returncode,'seconds':round(time.time()-begin,3)});(p/'canonical-final-status.json').write_text(json.dumps(steps,indent=2)+'\n');print(index,result.returncode,flush=True)
