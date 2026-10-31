from pathlib import Path
import json,hashlib,subprocess,time
r=Path.cwd();o=r/'integration-evidence'
def snap():
 paths=[]
 for n in ['src','test','native','bin','scripts','proposals/shared-worker','node_modules']:
  paths.extend(p for p in(r/n).rglob('*')if p.is_file()and'__pycache__'not in p.parts)
 paths.extend(r/n for n in ['package.json','package-lock.json','integration-evidence/run-network-focused.py'])
 return{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
b=snap();(o/'network-source-before.json').write_text(json.dumps(b,indent=2));cmd=['node','--experimental-vm-modules','--test','--test-concurrency=1',*[f'test/{n}.test.js'for n in ['shared-worker-transports','shared-workers','wasm-streaming','worker-document-response','request-metadata','fetch-redirect-taint','worker-blob-urls','fetch','xhr','worker-apis','eventsource','websocket-quota','service-workers']]];start=time.monotonic()
with(o/'network-focused.log').open('w')as f:c=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
a=snap();(o/'network-source-after.json').write_text(json.dumps(a,indent=2));d={'command':cmd,'exit':c.returncode,'seconds':time.monotonic()-start,'unchanged':a==b,'inputs':len(b),'changed':[p for p in set(a)|set(b)if a.get(p)!=b.get(p)]};(o/'network-status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d));raise SystemExit(0 if c.returncode==0 and a==b else 1)
