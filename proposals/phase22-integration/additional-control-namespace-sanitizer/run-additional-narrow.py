from pathlib import Path
import json,hashlib,subprocess,time
r=Path.cwd();o=r/'integration-evidence';roots=['src','test','native','bin','scripts','oracle','node_modules','docs/reference','proposals/shared-worker','proposals/eventsource','proposals/websocket-quota','proposals/form-target-routing','proposals/joint-session-history','proposals/navigation-api','proposals/navigation-reload','proposals/history-url-principal']
def snap():
 paths=[p for n in roots for p in(r/n).rglob('*')if p.is_file()and'__pycache__'not in p.parts]+[r/'package.json',r/'package-lock.json',o/'run-additional-narrow.py']
 return{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
b=snap();(o/'additional-narrow-source-before.json').write_text(json.dumps(b,indent=2));names=['additional-control-interface-realms','programmatic-namespace','sanitizer','sanitizer-qualified-attributes'];cmd=['node','--experimental-vm-modules','--test','--test-concurrency=1',*[f'test/{n}.test.js'for n in names]];start=time.monotonic()
with(o/'additional-narrow.log').open('w')as f:c=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=240)
a=snap();(o/'additional-narrow-source-after.json').write_text(json.dumps(a,indent=2));d={'command':cmd,'exit':c.returncode,'seconds':time.monotonic()-start,'unchanged':a==b,'inputs':len(b),'changed':[p for p in set(a)|set(b)if a.get(p)!=b.get(p)]};(o/'additional-narrow-status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d));raise SystemExit(0 if c.returncode==0 and a==b else 1)
