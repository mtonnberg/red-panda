from pathlib import Path
import os,subprocess,json,time
root=Path('.').resolve();node='/workspace/shared/rea-tools/node_modules/node/bin/node';env=dict(os.environ,NODE_USE_ENV_PROXY='1');existing=','.join(filter(None,[os.environ.get('NO_PROXY',''),os.environ.get('no_proxy','')]));aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[existing,aliases])) for key in ['NO_PROXY','no_proxy']});started=time.monotonic()
for target,label in [('native','native'),(str(root),'candidate-baseline')]:
 with open('evidence/'+label+'-location-accessors-v1.log','x') as out:r=subprocess.run([node,'--experimental-vm-modules','helpers/location-accessors.mjs',target,'evidence/'+label+'-location-accessors-v1.json'],stdout=out,stderr=subprocess.STDOUT,env=env)
 print(json.dumps({'target':label,'exit':r.returncode,'elapsedSeconds':round(time.monotonic()-started,3)}),flush=True)
