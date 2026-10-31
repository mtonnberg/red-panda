from pathlib import Path
import json,hashlib,subprocess,time
r=Path.cwd();o=r/'.cache/validation/phase21-corrected/focused-stable';out=[]
def snap():
 paths=[p for n in ['src','test','native','bin','scripts','docs/reference','node_modules']for p in(r/n).rglob('*')if p.is_file()and '__pycache__'not in p.parts]+[r/'package.json',r/'package-lock.json',o/'run-focused.py']
 return{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
b=snap();(o/'focused-source-before.json').write_text(json.dumps(b,indent=2))
for label,node in [('24.19.0','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('24.22.1','/workspace/shared/rea-tools/node_modules/node/bin/node'),('26.13.0','/workspace/shared/node26/node_modules/node/bin/node')]:
 identity=json.loads(subprocess.check_output([node,'-p','JSON.stringify({executable:process.execPath,versions:process.versions})'],text=True));cmd=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/input.test.js','test/beacon.test.js','test/xhr.test.js'];start=time.monotonic()
 with(o/('focused-'+label+'.log')).open('w')as f:c=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=180)
 out.append({'runtime':identity,'command':cmd,'exit':c.returncode,'seconds':time.monotonic()-start});(o/'focused-status-partial.json').write_text(json.dumps(out,indent=2))
 if c.returncode:break
a=snap();(o/'focused-source-after.json').write_text(json.dumps(a,indent=2));d={'steps':out,'unchanged':a==b,'inputs':len(b),'changed':[p for p in set(a)|set(b)if a.get(p)!=b.get(p)]};(o/'focused-status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d));raise SystemExit(0 if len(out)==3 and all(x['exit']==0 for x in out)and a==b else 1)
