from pathlib import Path
import subprocess,json,os,time,hashlib
root=Path('.').resolve();node='/workspace/shared/rea-tools/node_modules/node/bin/node';started=time.monotonic();env=dict(os.environ,NODE_USE_ENV_PROXY='1');existing=','.join(filter(None,[os.environ.get('NO_PROXY',''),os.environ.get('no_proxy','')]));bypass='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[existing,bypass])) for key in ['NO_PROXY','no_proxy']})
files=sorted(set([*root.glob('src/**/*.js'),root/'test/location-boundaries.test.js',*root.glob('helpers/*'),*root.glob('native/**/*'),root/'package.json',root/'package-lock.json',Path('/workspace/red-panda/test/cdp-client.js'),Path('/workspace/red-panda/scripts/reference-server.mjs')]))
def inventory():return [{'path':str(f),'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in files if f.is_file()]
before=inventory();Path('evidence/final-inputs-before.json').write_text(json.dumps(before,indent=2)+'\n');rows=[]
ops=[('candidate-final',[node,'--experimental-vm-modules','helpers/location-boundary-controls.mjs',str(root),'evidence/candidate-final-location-boundaries-v1.json'])]
for label,exe in [('prepared24',node),('system24','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('prepared26','/workspace/shared/node26/node_modules/node/bin/node')]:ops.append(('focus-'+label,[exe,'--experimental-vm-modules','--test','--test-concurrency=1','test/location-boundaries.test.js']))
for label,args in ops:
 with open('evidence/'+label+'.log','x') as log:r=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT,env=env)
 row={'stage':label,'exit':r.returncode,'elapsedSeconds':round(time.monotonic()-started,3)};rows.append(row);print(json.dumps(row),flush=True)
 if r.returncode:break
after=inventory();Path('evidence/final-inputs-after.json').write_text(json.dumps(after,indent=2)+'\n');Path('evidence/final-run-status.json').write_text(json.dumps({'rows':rows,'listedInputs':len(before),'unchanged':before==after},indent=2)+'\n')
