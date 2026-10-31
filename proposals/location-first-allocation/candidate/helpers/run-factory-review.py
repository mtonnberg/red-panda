from pathlib import Path
import subprocess,os,json,time,hashlib
root=Path('.').resolve();node='/workspace/shared/rea-tools/node_modules/node/bin/node';env=dict(os.environ,NODE_USE_ENV_PROXY='1');prior=','.join(filter(None,[os.environ.get('NO_PROXY',''),os.environ.get('no_proxy','')]));aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[prior,aliases])) for key in ['NO_PROXY','no_proxy']});started=time.monotonic();rows=[]
inputs=sorted(set([*root.glob('src/**/*.js'),root/'test/location-factory.test.js',*root.glob('native/**/*'),*root.glob('helpers/*'),root/'package.json',root/'package-lock.json',Path('/workspace/red-panda/test/cdp-client.js'),Path('/workspace/red-panda/scripts/reference-server.mjs')]))
def inventory():return [{'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in inputs if f.is_file()]
negativeFiles=sorted([*root.glob('counterfactual-front-retarget/src/**/*.js'),*root.glob('counterfactual-front-retarget/test/*.js')]);negativeBefore=[{'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in negativeFiles];Path('evidence/negative-inputs-before.json').write_text(json.dumps(negativeBefore,indent=2)+'\n')
before=inventory();Path('evidence/review-inputs-before.json').write_text(json.dumps(before,indent=2)+'\n')
ops=[('candidate-allocation-metadata',[node,'--experimental-vm-modules','helpers/location-accessors.mjs',str(root),'evidence/candidate-first-allocation-v1.json'],root),('proper-focused6',[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/location-factory.test.js'],root),('host-retarget-negative',[node,'--experimental-vm-modules','--test','--test-name-pattern=first actual Location front','test/location-factory.test.js'],root/'counterfactual-front-retarget')]
for label,args,cwd in ops:
 with open(root/('evidence/'+label+'.log'),'x') as log:r=subprocess.run(args,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
 rows.append({'stage':label,'exit':r.returncode,'elapsedSeconds':round(time.monotonic()-started,3),'expectedNegative':label=='host-retarget-negative'});print(json.dumps(rows[-1]),flush=True)
 if r.returncode and label!='host-retarget-negative':break
negativeAfter=[{'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in negativeFiles];Path('evidence/negative-inputs-after.json').write_text(json.dumps(negativeAfter,indent=2)+'\n')
after=inventory();Path('evidence/review-inputs-after.json').write_text(json.dumps(after,indent=2)+'\n');Path('evidence/review-run-status.json').write_text(json.dumps({'rows':rows,'listedInputs':len(before),'unchanged':before==after,'negativeListedInputs':len(negativeBefore),'negativeUnchanged':negativeBefore==negativeAfter},indent=2)+'\n')
