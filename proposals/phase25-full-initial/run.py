from pathlib import Path
import json,hashlib,subprocess,time,os,re
r=Path.cwd();o=r/'.cache/validation/phase25-all-features'
def snap():
 paths=[f for n in ['src','test','native','bin','scripts','helpers','node_modules','automation/src','automation/test','oracle','docs/reference','.cache/lightpanda-reference/browser-948d773786/src/browser/tests']for f in(r/n).rglob('*')if f.is_file()and'__pycache__'not in f.parts]+[r/n for n in ['package.json','package-lock.json','automation/spago.yaml','automation/spago.lock']]
 d={str(f.relative_to(r)):hashlib.sha256(f.read_bytes()).hexdigest()for f in sorted(set(paths))};native=Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux');d['external:Native']=hashlib.sha256(native.read_bytes()).hexdigest();assert d['external:Native']=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f';return d
before=snap();(o/'inputs-before.json').write_text(json.dumps(before,indent=2));status=[]
files=['cdp-cookie-actions','javascript-dialogs','runtime-thrown-values','page-lifecycle','lp-aliases','cookie-unicode-transport','permission-control','network-body-capture']
steps=[('features43-'+version,[node,'--experimental-vm-modules','--test','--test-concurrency=1',*['test/'+f+'.test.js'for f in files]],180)for version,node in [('24.22.1','/workspace/shared/rea-tools/node_modules/node/bin/node'),('24.19.0','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('26.13.0','/workspace/shared/node26/node_modules/node/bin/node')]]
steps.extend([('full',['npm','test'],1800),('reference',['npm','run','test:reference','--','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'],180),('syntax',['npm','run','check'],180),('strict',['npm','run','build:automation','--','--strict','--pedantic-packages'],180)])
try:
 for name,command,cap in steps:
  begin=time.monotonic()
  with(o/(name+'.log')).open('x')as f:result=subprocess.run(command,stdout=f,stderr=subprocess.STDOUT,timeout=cap)
  item={'name':name,'command':command,'exit':result.returncode,'seconds':time.monotonic()-begin};status.append(item);(o/'status.json').write_text(json.dumps(status,indent=2));print(json.dumps(item),flush=True)
  if result.returncode:break
finally:
 after=snap();(o/'inputs-after.json').write_text(json.dumps(after,indent=2));stable=before==after;(o/'source-stable.json').write_text(json.dumps({'unchanged':stable,'inputs':len(before),'changed':[p for p in set(before)|set(after)if before.get(p)!=after.get(p)]},indent=2));print(json.dumps({'steps':len(status),'unchanged':stable,'inputs':len(before)}),flush=True)
assert len(status)==len(steps)and all(x['exit']==0 for x in status)and stable
