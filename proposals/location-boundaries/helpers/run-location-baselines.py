import os,subprocess,json,time
from pathlib import Path
started=time.monotonic();root=Path('.').resolve();node='/workspace/shared/rea-tools/node_modules/node/bin/node';env=dict(os.environ,NODE_USE_ENV_PROXY='1');existing=','.join(filter(None,[os.environ.get('NO_PROXY',''),os.environ.get('no_proxy','')]));bypass='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[existing,bypass])) for key in ['NO_PROXY','no_proxy']});rows=[]
for target,label in [('native','native'),(str(root),'candidate-baseline')]:
 out='evidence/'+label+'-location-boundaries-v1.json'
 with open('evidence/'+label+'-location-boundaries-v1.log','x') as log:r=subprocess.run([node,'--experimental-vm-modules','helpers/location-boundary-controls.mjs',target,out],stdout=log,stderr=subprocess.STDOUT,env=env)
 d=json.loads(Path(out).read_text()) if Path(out).exists() else {};row={'target':label,'exit':r.returncode,'rows':len(d.get('observations',[])),'setupFailure':d.get('failure'),'rowFailures':[x['name'] for x in d.get('observations',[]) if x.get('failure')],'elapsedSeconds':round(time.monotonic()-started,3)};rows.append(row);print(json.dumps(row),flush=True)
 if r.returncode or d.get('failure') or row['rowFailures']:break
Path('evidence/baseline-run-status.json').write_text(json.dumps(rows,indent=2)+'\n')
