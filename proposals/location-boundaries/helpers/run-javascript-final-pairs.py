from pathlib import Path
import subprocess,json,os,time,hashlib
node='/workspace/shared/rea-tools/node_modules/node/bin/node';root=Path('.').resolve();started=time.monotonic();env=dict(os.environ,NODE_USE_ENV_PROXY='1');existing=','.join(filter(None,[os.environ.get('NO_PROXY',''),os.environ.get('no_proxy','')]));bypass='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[existing,bypass])) for key in ['NO_PROXY','no_proxy']});rows=[]
inputs=sorted(set([*root.glob('src/**/*.js'),*root.glob('test/**/*.js'),*root.glob('helpers/*.mjs'),*root.glob('native/**/*'),root/'package.json',root/'package-lock.json',Path('/workspace/red-panda/test/cdp-client.js'),Path('/workspace/red-panda/scripts/reference-server.mjs')]))
def inventory():return [{'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in inputs if f.is_file()]
before=inventory();(root/'evidence/final-pairs-inputs-before.json').write_text(json.dumps(before,indent=2)+'\n')
ops=[('history-bigint-atomicity.mjs','native','native-history-bigint-atomicity-v1'),('location-javascript-opaque-targets.mjs','native','native-javascript-opaque-v1'),('location-javascript-self.mjs',str(root),'candidate-final-javascript-self-v1'),('location-javascript-targets.mjs',str(root),'candidate-final-javascript-targets-v1'),('location-javascript-opaque-targets.mjs',str(root),'candidate-final-javascript-opaque-v1')]
for helper,target,stem in ops:
 out='evidence/'+stem+'.json'
 with open('evidence/'+stem+'.log','x') as log:r=subprocess.run([node,'--experimental-vm-modules','helpers/'+helper,target,out],stdout=log,stderr=subprocess.STDOUT,env=env)
 d=json.loads(Path(out).read_text()) if Path(out).exists() else {};row={'stage':stem,'exit':r.returncode,'rows':len(d.get('observations',[])),'setupFailure':d.get('failure'),'rowFailures':[v.get('name') for v in d.get('observations',[]) if v.get('failure')],'elapsedSeconds':round(time.monotonic()-started,3)};rows.append(row);print(json.dumps(row),flush=True)
 if r.returncode or d.get('failure') or row['rowFailures']:break
after=inventory();(root/'evidence/final-pairs-inputs-after.json').write_text(json.dumps(after,indent=2)+'\n');(root/'evidence/final-pairs-run-status.json').write_text(json.dumps({'rows':rows,'inputCount':len(before),'inputsUnchanged':before==after},indent=2)+'\n')
