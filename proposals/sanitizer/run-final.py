from pathlib import Path
import json,subprocess,time,hashlib,os
p=Path(__file__).parent;s=Path('/workspace/shared/sanitizer-20261031');node='/workspace/shared/rea-tools/node_modules/node/bin/node';binary=str(s/'candidate-browser')
steps=[]
for script,label in [('probe.mjs','core'),('extra-probe.mjs','extra'),('dom-probe.mjs','dom'),('lifecycle-probe.mjs','lifecycle'),('realm-probe.mjs','realms'),('identity-probe.mjs','identity')]:
 report=p/'evidence'/f'candidate-{label}-final.json';command=[node,str(p/script),binary,str(report)];start=time.time()
 with (p/'evidence'/f'candidate-{label}-final.log').open('w') as log:
  try:result=subprocess.run(command,cwd=s,stdout=log,stderr=subprocess.STDOUT,timeout=35);record={'exitCode':result.returncode}
  except subprocess.TimeoutExpired:record={'timeout':True}
 steps.append({'name':label,'command':command,'cwd':str(s),'durationSeconds':round(time.time()-start,3),**record});(p/'final-run-status.json').write_text(json.dumps(steps,indent=2)+'\n')
 print(label,record,flush=True)
 if record.get('exitCode')!=0:raise SystemExit(1)
command=[node,'scripts/conformance.mjs','--root','/workspace/red-panda/.cache/lightpanda-reference/browser-948d773786/src/browser/tests','--binary',binary,'--test','sanitizer.html','--isolate','--timeout','15000','--settle-ms','100','--port','0','--browser-arg=--load-resources','--browser-arg=iframe','--browser-arg=--load-resources','--browser-arg=worker','--report',str(p/'evidence/candidate-source-final.json')]
start=time.time()
with (p/'evidence/candidate-source-final.log').open('w') as log:
 try:result=subprocess.run(command,cwd=s,stdout=log,stderr=subprocess.STDOUT,timeout=35);record={'exitCode':result.returncode}
 except subprocess.TimeoutExpired:record={'timeout':True}
steps.append({'name':'source','command':command,'cwd':str(s),'durationSeconds':round(time.time()-start,3),**record});(p/'final-run-status.json').write_text(json.dumps(steps,indent=2)+'\n');print('source',record,flush=True)
if record.get('exitCode')!=0:raise SystemExit(1)
