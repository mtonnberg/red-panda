from pathlib import Path
import json,subprocess,time,hashlib
r=Path.cwd();out=r/'.cache/validation/phase20-source';roots=['src','test','native','bin','scripts','automation/src','automation/test','oracle','docs/reference','node_modules','proposals/css-layout','proposals/audio-core','proposals/web-crypto','proposals/urlpattern','proposals/text-encoder','proposals/document-write','proposals/images','proposals/payment-request','proposals/window-open','proposals/shared-worker','proposals/eventsource','proposals/websocket-quota','.cache/lightpanda-reference/browser-948d773786/src/browser/tests']
def snapshot():
 paths=[p for name in roots for p in(r/name).rglob('*')if p.is_file()and'__pycache__'not in p.parts]+[r/'package.json',r/'package-lock.json',r/'automation/spago.yaml',r/'automation/spago.lock',r/'proposals/fixture-routes/evidence/registration-map.json',out/'source27.json',out/'websocket2.json',out/'network-fetch.json',out/'run-source.py']
 return{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
before=snapshot();(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n');status=[]
for group,extra in [('source27',[]),('websocket2',['--runner-global-arg=--ws-max-concurrent','--runner-global-arg=50']),('network-fetch',[])]:
 for name,binary in [('native','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'),('candidate',str(r/'bin/red-panda.js'))]:
  command=['node','scripts/conformance.mjs','--root',str(r/'.cache/lightpanda-reference/browser-948d773786/src/browser/tests'),'--binary',binary,'--isolate','--fixture-profile','upstream','--source-load-contract','--websocket-port','9584','--registration-map','proposals/fixture-routes/evidence/registration-map.json','--port','9582','--tests-file',str(out/(group+'.json')),'--report',str(out/(group+'-'+name+'.json')),*extra];start=time.monotonic()
  with(out/(group+'-'+name+'.log')).open('w')as f:p=subprocess.run(command,stdout=f,stderr=subprocess.STDOUT)
  status.append({'group':group,'name':name,'exit':p.returncode,'seconds':time.monotonic()-start,'command':command});(out/'status-partial.json').write_text(json.dumps(status,indent=2)+'\n')
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n')
for check in status:
 report=out/(check['group']+'-'+check['name']+'.json')
 check['counts']=json.loads(report.read_text())['counts']if report.exists()else None
allPassed=all(x['exit']==0 for x in status)
result={'allPassed':allPassed,'checks':status,'unchanged':before==after,'inputs':len(before),'changed':[p for p in set(before)|set(after)if before.get(p)!=after.get(p)]}
(out/'status.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));raise SystemExit(0 if before==after and allPassed else 1)
