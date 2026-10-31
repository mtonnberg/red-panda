from pathlib import Path
import json,hashlib,subprocess,time
r=Path.cwd();out=r/'integration-evidence'
def snapshot():
 paths=[]
 for n in ['src','test','native','bin','scripts','oracle','proposals/shared-worker','node_modules','.cache/lightpanda-reference/browser-948d773786/src/browser/tests']:
  paths.extend(p for p in(r/n).rglob('*')if p.is_file()and'__pycache__'not in p.parts)
 for n in ['package.json','package-lock.json','proposals/fixture-routes/evidence/registration-map.json','integration-evidence/run-composed-validation.py']:paths.append(r/n)
 return{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
b=snapshot();(out/'composed-source-before.json').write_text(json.dumps(b,indent=2));checks=[]
def run(name,cmd):
 start=time.monotonic()
 with(out/(name+'.log')).open('w')as f:c=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
 checks.append({'name':name,'command':cmd,'exit':c.returncode,'seconds':time.monotonic()-start});(out/'composed-status-partial.json').write_text(json.dumps(checks,indent=2));return c.returncode==0
okay=True
for name,node in [('prepared','/workspace/shared/rea-tools/node_modules/node/bin/node'),('24.19.0','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('26.13.0','/workspace/shared/node26/node_modules/node/bin/node')]:
 if not run('shared-sdk-'+name,[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/shared-worker-transports.test.js','test/shared-workers.test.js']):okay=False;break
if okay:
 for name,binary in [('native','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'),('candidate',str(r/'bin/red-panda.js'))]:
  if not run('shared-source-'+name,['node','scripts/conformance.mjs','--root',str(r/'.cache/lightpanda-reference/browser-948d773786/src/browser/tests'),'--binary',binary,'--isolate','--fixture-profile','upstream','--source-load-contract','--websocket-port','9584','--registration-map','proposals/fixture-routes/evidence/registration-map.json','--port','9582','--test','shared_worker/shared_worker.html','--report',str(out/('shared-source-'+name+'.json'))]):okay=False;break
a=snapshot();(out/'composed-source-after.json').write_text(json.dumps(a,indent=2));status={'checks':checks,'unchanged':b==a,'inputs':len(b),'changed':[p for p in set(b)|set(a)if b.get(p)!=a.get(p)]};(out/'composed-status.json').write_text(json.dumps(status,indent=2));print(json.dumps(status));raise SystemExit(0 if okay and b==a else 1)
