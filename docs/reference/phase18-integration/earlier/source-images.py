import pathlib,json,subprocess,hashlib,time
r=pathlib.Path.cwd();out=r/'.cache/validation/phase18';source=r/'.cache/lightpanda-reference/browser-948d773786/src/browser/tests'
def snapshot():
 ps=[p for d in ['src','bin','native','scripts','test']for p in(r/d).rglob('*')if p.is_file()and '__pycache__'not in p.parts];ps +=[r/'package.json',r/'package-lock.json'];return{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(ps)}
before=snapshot();(out/'image-source-before.json').write_text(json.dumps(before,indent=2));status=[]
for name,binary in [('native','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'),('candidate',str(r/'bin/red-panda.js'))]:
 cmd=['node','scripts/conformance.mjs','--root',str(source),'--binary',binary,'--isolate','--fixture-profile','upstream','--source-load-contract','--websocket-port','9584','--registration-map','proposals/fixture-routes/evidence/registration-map.json','--port','9582','--report',str(out/('source-images-'+name+'.json'))]
 for p in ['image.html','image_fetch.html','image_srcset.html','image_frameless_load.html']:cmd+=['--test','element/html/'+p]
 start=time.monotonic()
 with(out/('source-images-'+name+'.log')).open('w')as f:result=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
 status.append({'target':name,'exit':result.returncode,'seconds':time.monotonic()-start,'args':cmd})
after=snapshot();(out/'image-source-after.json').write_text(json.dumps(after,indent=2));stable=before==after;(out/'image-source-status.json').write_text(json.dumps({'status':status,'inputs':len(before),'unchanged':stable},indent=2));print(json.dumps({'status':status,'unchanged':stable}))
