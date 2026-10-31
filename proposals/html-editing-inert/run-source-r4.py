from pathlib import Path
import subprocess,json,time
p=Path(__file__).parent;s=Path('/workspace/shared/html-editing-inert-phase21-20261031');steps=[];started=time.monotonic()
for name,binary in [('native','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'),('candidate',str(s/'candidate-browser'))]:
 command=['/workspace/shared/rea-tools/node_modules/node/bin/node','scripts/conformance.mjs','--root','/workspace/red-panda/.cache/lightpanda-reference/browser-948d773786/src/browser/tests','--binary',binary,'--tests-file',str(p/'source-selection.json'),'--isolate','--fixture-profile','upstream','--source-load-contract','--registration-map','/workspace/red-panda/proposals/candidate455-phase17/registration-map.json','--port','9582','--report',str(p/f'{name}-source-r4.json')]
 with (p/f'{name}-source-r4.log').open('x') as log:r=subprocess.run(command,cwd=s,stdout=log,stderr=subprocess.STDOUT,timeout=max(1,60-(time.monotonic()-started)))
 steps.append({'name':name,'command':command,'exitCode':r.returncode});(p/'source-r4-status.json').write_text(json.dumps(steps,indent=2)+'\n');print(name,r.returncode,flush=True)
