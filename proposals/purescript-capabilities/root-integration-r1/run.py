from pathlib import Path
import json,hashlib,subprocess,time,os,re
r=Path.cwd();o=r/'.cache/validation/phase25-purescript-root'
def snap():
 folders=['src','test','native','bin','scripts','helpers','node_modules','automation/src','automation/test','automation/.spago/p','oracle','docs/reference','.cache/lightpanda-reference/browser-948d773786/src/browser/tests']
 paths={f for n in folders for f in(r/n).rglob('*')if f.is_file()and'__pycache__'not in f.parts and'.git'not in f.parts};paths.update(r/n for n in['package.json','package-lock.json','automation/spago.yaml','automation/spago.lock','automation/package-set.json','automation/package-set-provenance.json']);d={str(f.relative_to(r)):hashlib.sha256(f.read_bytes()).hexdigest()for f in sorted(paths)};node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');d['external:Node']=hashlib.sha256(node.read_bytes()).hexdigest();return d
before=snap();(o/'inputs-before.json').write_text(json.dumps(before,indent=2));status=[]
try:
 for label,cmd in [('strict',['npm','run','build:automation','--','--strict','--pedantic-packages']),('purescript117',['npm','run','test:puppeteer'])]:
  start=time.monotonic()
  with(o/(label+'.log')).open('x')as log:p=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT,timeout=180)
  row={'name':label,'command':cmd,'exit':p.returncode,'seconds':time.monotonic()-start}
  if label=='purescript117':
   raw=(o/(label+'.log')).read_text();row['actualPassLines']=len(re.findall(r'^PASS ',raw,re.M));row['reported117']='PureScript Puppeteer integration: 117 checks passed'in raw
  status.append(row);(o/'status.json').write_text(json.dumps(status,indent=2));print(json.dumps(row),flush=True)
  if p.returncode:break
finally:
 after=snap();(o/'inputs-after.json').write_text(json.dumps(after,indent=2));(o/'source-stable.json').write_text(json.dumps({'unchanged':before==after,'inputs':len(before),'changed':[k for k in before.keys()|after.keys()if before.get(k)!=after.get(k)]},indent=2));print(json.dumps({'stable':before==after,'inputs':len(before)}),flush=True)
assert len(status)==2 and all(x['exit']==0 for x in status)and status[-1].get('actualPassLines')==117 and status[-1].get('reported117')and before==after
