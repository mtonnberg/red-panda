from pathlib import Path
import hashlib,json,os,subprocess,time
root=Path.cwd();out=root/'.cache/validation/phase22-cli-sdk'
nodes=[('24.19.0','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('26.13.0','/workspace/shared/node26/node_modules/node/bin/node')]
def snapshot():
    paths=[p for name in ['src','test','bin','scripts','native','node_modules'] for p in(root/name).rglob('*') if p.is_file() and '__pycache__'not in p.parts]
    paths += [root/'package.json',root/'package-lock.json',out/'run.py']
    return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
before=snapshot();(out/'before.json').write_text(json.dumps(before,indent=2));runs=[]
for label,node in nodes:
    identity=json.loads(subprocess.check_output([node,'-p','JSON.stringify({execPath:process.execPath,versions:process.versions})'],text=True))
    command=[node,'--experimental-vm-modules','--test','--test-concurrency=1','--test-name-pattern=saved-script CLI','test/cli-transports.test.js']
    start=time.monotonic()
    with(out/(label+'.log')).open('w')as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
    runs.append({'sdk':label,'identity':identity,'command':command,'exit':r.returncode,'seconds':time.monotonic()-start})
    if r.returncode:break
after=snapshot();(out/'after.json').write_text(json.dumps(after,indent=2));status={'runs':runs,'stable':before==after,'inputs':len(before),'scope':'Only original saved-script case/three real child commands per SDK; unchanged15000ms helper deadline. Other CLI cases filtered, not counted.'};(out/'status.json').write_text(json.dumps(status,indent=2));print(json.dumps(status));raise SystemExit(0 if before==after and len(runs)==2 and all(x['exit']==0 for x in runs)else 1)
