from pathlib import Path
import json,hashlib,subprocess,time
r=Path.cwd();o=r/'integration-evidence';fixture=r/'.cache/lightpanda-reference/browser-948d773786/src/browser/tests';roots=['src','test','native','bin','scripts','automation/src','automation/test','oracle','node_modules','docs/reference','.cache/lightpanda-reference/browser-948d773786/src/browser/tests']
def snap():
 paths=[p for name in roots for p in(r/name).rglob('*')if p.is_file()and'__pycache__'not in p.parts]+[r/'package.json',r/'package-lock.json',r/'automation/spago.yaml',r/'automation/spago.lock',r/'proposals/fixture-routes/evidence/registration-map.json',o/'run-fullfetch-phase22.py',o/'fullfetch-selection.json']
 return{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
b=snap();(o/'fullfetch-phase22-before.json').write_text(json.dumps(b,indent=2));checks=[]
for name,binary in [('native','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'),('candidate',str(r/'bin/red-panda.js'))]:
 cmd=['node','scripts/conformance.mjs','--root',str(fixture),'--binary',binary,'--isolate','--fixture-profile','upstream','--source-load-contract','--websocket-port','9584','--registration-map','proposals/fixture-routes/evidence/registration-map.json','--port','9582','--tests-file',str(o/'fullfetch-selection.json'),'--report',str(o/('fullfetch-phase22-'+name+'.json'))];start=time.monotonic()
 with(o/('fullfetch-phase22-'+name+'.log')).open('w')as f:c=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=120)
 checks.append({'name':name,'command':cmd,'exit':c.returncode,'seconds':time.monotonic()-start,'counts':json.loads((o/('fullfetch-phase22-'+name+'.json')).read_text())['counts']});(o/'fullfetch-phase22-status-partial.json').write_text(json.dumps(checks,indent=2))
a=snap();(o/'fullfetch-phase22-after.json').write_text(json.dumps(a,indent=2));d={'checks':checks,'unchanged':a==b,'inputs':len(b),'changed':[p for p in set(a)|set(b)if a.get(p)!=b.get(p)]};(o/'fullfetch-phase22-status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d));raise SystemExit(0 if a==b and all(x['exit']==0 for x in checks)else 1)
