from pathlib import Path
import json,hashlib,subprocess,time
r=Path.cwd();o=r/'proposals/cdp-configuration-acks/validation';o.mkdir(exist_ok=True)
def snapshot():
 p=[f for n in ['src','test','native','bin','scripts','node_modules','automation/src','automation/output']for f in(r/n).rglob('*')if f.is_file()and'__pycache__'not in f.parts]+[r/n for n in ['package.json','package-lock.json','automation/spago.yaml','automation/spago.lock','proposals/cdp-configuration-acks/run-focused.py']]
 return{str(f.relative_to(r)):hashlib.sha256(f.read_bytes()).hexdigest()for f in sorted(set(p))}
b=snapshot();(o/'inputs-before.json').write_text(json.dumps(b,indent=2));runs=[]
for label,node in [('24.22.1','/workspace/shared/rea-tools/node_modules/node/bin/node'),('24.19.0','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('26.13.0','/workspace/shared/node26/node_modules/node/bin/node')]:
 command=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/cdp-configuration-acks.test.js','test/cdp-domain-dispatch.test.js','test/cdp.test.js','test/dom.test.js','test/world-protocol.test.js'];start=time.monotonic()
 with(o/(label+'.tap')).open('x')as f:c=subprocess.run(command,stdout=f,stderr=subprocess.STDOUT,timeout=120)
 item={'SDK':label,'command':command,'exit':c.returncode,'seconds':time.monotonic()-start};runs.append(item);print(json.dumps(item),flush=True)
 if c.returncode:break
a=snapshot();(o/'inputs-after.json').write_text(json.dumps(a,indent=2));d={'runs':runs,'unchanged':b==a,'inputs':len(b),'scope':'27 focused cases per SDK; no full-suite or current PureScript execution claim'};(o/'status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d));assert len(runs)==3 and all(x['exit']==0 for x in runs)and b==a
