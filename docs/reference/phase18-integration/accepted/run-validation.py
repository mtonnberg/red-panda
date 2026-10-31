from pathlib import Path
import json,hashlib,subprocess,time
root=Path.cwd();out=root/'.cache/validation/phase18-final'
proposal_inputs=['css-layout','audio-core','web-crypto','urlpattern','text-encoder','document-write','images','payment-request','window-open']
def snapshot():
 paths=[]
 for name in ['src','test','native','bin','scripts','automation/src','automation/test','oracle','docs/reference','node_modules','.cache/lightpanda-reference/browser-948d773786/src/browser/tests',*[f'proposals/{p}'for p in proposal_inputs]]:
  paths.extend(p for p in(root/name).rglob('*')if p.is_file()and '__pycache__'not in p.parts)
 paths.extend(root/p for p in ['package.json','package-lock.json','automation/spago.yaml','automation/spago.lock','proposals/fixture-routes/evidence/registration-map.json','.cache/validation/phase18-final/run-validation.py'])
 return{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
before=snapshot();(out/'full-source-before.json').write_text(json.dumps(before,indent=2));status=[]
for name,command in [('full',['npm','test']),('reference',['npm','run','test:reference','--','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux']),('check',['npm','run','check']),('strict',['npm','run','build:automation','--','--strict','--pedantic-packages'])]:
 start=time.monotonic()
 with(out/(name+'.log')).open('w')as f:result=subprocess.run(command,stdout=f,stderr=subprocess.STDOUT)
 status.append({'name':name,'exit':result.returncode,'seconds':time.monotonic()-start});(out/'full-status.json').write_text(json.dumps(status,indent=2))
 if result.returncode:break
end=snapshot();(out/'full-source-after.json').write_text(json.dumps(end,indent=2));stable=before==end;(out/'source-stable.json').write_text(json.dumps({'unchanged':stable,'inputs':len(before),'changed':[p for p in set(before)|set(end)if before.get(p)!=end.get(p)]},indent=2));print(json.dumps({'status':status,'unchanged':stable,'inputs':len(before)}));raise SystemExit(0 if stable and len(status)==4 and all(x['exit']==0 for x in status)else 1)
