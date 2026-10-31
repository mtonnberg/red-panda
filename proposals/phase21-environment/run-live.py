from pathlib import Path
import json,hashlib,subprocess,time,urllib.request
r=Path.cwd();o=r/'.cache/validation/phase21-onboarding'
def snap():
 paths=[p for n in ['src','native','bin','node_modules','automation/src']for p in(r/n).rglob('*')if p.is_file()and '__pycache__'not in p.parts]+[r/n for n in ['package.json','package-lock.json','automation/spago.yaml','automation/spago.lock']]
 return{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
commit=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip();assert commit=='9df839235be651d9408d3eea2b3ee7c3286ab914';b=snap();(o/'live-source-before.json').write_text(json.dumps(b,indent=2));health=json.load(urllib.request.build_opener(urllib.request.ProxyHandler({})).open('http://127.0.0.1:9222/health',timeout=5));assert health['status']=='ok';start=time.monotonic()
with(o/'live-example.log').open('w')as f:c=subprocess.run(['npm','run','example:puppeteer'],stdout=f,stderr=subprocess.STDOUT,timeout=90)
a=snap();(o/'live-source-after.json').write_text(json.dumps(a,indent=2));clean=subprocess.run(['git','diff','--exit-code','--','src','native','bin','scripts','automation/src','automation/spago.yaml','automation/spago.lock'],stdout=subprocess.DEVNULL).returncode==0;d={'commit':commit,'health':health,'exampleExit':c.returncode,'exampleSeconds':time.monotonic()-start,'unchanged':a==b,'inputs':len(b),'trackedRuntimeClean':clean};(o/'live-status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d));raise SystemExit(0 if c.returncode==0 and a==b and clean else 1)
