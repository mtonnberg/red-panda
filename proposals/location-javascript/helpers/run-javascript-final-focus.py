from pathlib import Path
import subprocess,json,os,time,hashlib
node='/workspace/shared/rea-tools/node_modules/node/bin/node';root=Path('.').resolve();started=time.monotonic();env=dict(os.environ,NODE_USE_ENV_PROXY='1');existing=','.join(filter(None,[os.environ.get('NO_PROXY',''),os.environ.get('no_proxy','')]));bypass='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[existing,bypass])) for key in ['NO_PROXY','no_proxy']});rows=[]
files=sorted(set([*root.glob('src/**/*.js'),root/'test/location-javascript.test.js',*root.glob('helpers/*'),*root.glob('native/**/*'),root/'package.json',root/'package-lock.json',Path('/workspace/red-panda/test/cdp-client.js'),Path('/workspace/red-panda/scripts/reference-server.mjs')]))
def inventory():return [{'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in files if f.is_file()]
before=inventory();(root/'evidence/final-focus-v2-inputs-before.json').write_text(json.dumps(before,indent=2)+'\n')
ops=[('corrected-opaque-pair-v2',[node,'--experimental-vm-modules','helpers/location-javascript-opaque-targets.mjs',str(root),'evidence/candidate-final-javascript-opaque-v3.json'],root),('negative-host-error-v2',[node,'--experimental-vm-modules','--test','--test-name-pattern=trusted Host reporter','test/location-javascript.test.js'],root/'counterfactual-host-error-v2')]
for label,path in [('prepared24',node),('system24','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('prepared26','/workspace/shared/node26/node_modules/node/bin/node')]:ops.append(('final-focus-v2-'+label,[path,'--experimental-vm-modules','--test','--test-concurrency=1','test/location-javascript.test.js'],root))
for label,args,cwd in ops:
 with open(root/('evidence/'+label+'.log'),'x') as log:r=subprocess.run(args,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
 row={'stage':label,'exit':r.returncode,'expectedNegative':label=='negative-host-error-v2','elapsedSeconds':round(time.monotonic()-started,3)};rows.append(row);print(json.dumps(row),flush=True)
 if r.returncode and label!='negative-host-error-v2':break
after=inventory();(root/'evidence/final-focus-v2-inputs-after.json').write_text(json.dumps(after,indent=2)+'\n');(root/'evidence/final-focus-v2-run-status.json').write_text(json.dumps({'rows':rows,'inputCount':len(before),'inputsUnchanged':before==after},indent=2)+'\n')
