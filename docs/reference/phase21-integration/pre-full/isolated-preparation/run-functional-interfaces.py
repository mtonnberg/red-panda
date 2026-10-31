from pathlib import Path
import json,hashlib,subprocess,time
r=Path.cwd();o=r/'integration-evidence'
roots=['src','test','native','bin','scripts','oracle','node_modules','docs/reference','proposals/shared-worker','proposals/eventsource','proposals/websocket-quota','proposals/dom-attribute-names','proposals/namespace-serialization','proposals/event-api-parity','proposals/document-editing','proposals/form-control-parity','proposals/html-element-parity','proposals/css-source-liveness']
def snap():
 paths=[p for name in roots for p in(r/name).rglob('*')if p.is_file()and'__pycache__'not in p.parts]+[r/'package.json',r/'package-lock.json',o/'run-functional-interfaces.py',o/'interface-focused-plan.json']
 return{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
b=snap();(o/'interfaces-source-before.json').write_text(json.dumps(b,indent=2));files=json.loads((o/'interface-focused-plan.json').read_text())['files'];cmd=['node','--experimental-vm-modules','--test','--test-concurrency=1',*files];start=time.monotonic()
with(o/'interfaces.log').open('w')as f:c=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=120)
a=snap();(o/'interfaces-source-after.json').write_text(json.dumps(a,indent=2));status={'command':cmd,'exit':c.returncode,'seconds':time.monotonic()-start,'unchanged':a==b,'inputs':len(b),'changed':[p for p in set(a)|set(b)if a.get(p)!=b.get(p)]};(o/'interfaces-status.json').write_text(json.dumps(status,indent=2));print(json.dumps(status));raise SystemExit(0 if c.returncode==0 and a==b else 1)
