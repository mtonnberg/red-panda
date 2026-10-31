from pathlib import Path
import subprocess,json,os,time
node='/workspace/shared/rea-tools/node_modules/node/bin/node'
root=str(Path('.').resolve());started=time.monotonic()
env=dict(os.environ,NODE_USE_ENV_PROXY='1',NO_PROXY='0.0.0.0,127.0.0.1,127.0.0.2,localhost,::1,[::1]',no_proxy='0.0.0.0,127.0.0.1,127.0.0.2,localhost,::1,[::1]')
rows=[]
for helper,kind in [('location-javascript-self.mjs','self'),('location-javascript-targets.mjs','targets')]:
 for target,label in [('native','native'),(root,'candidate-baseline')]:
  stem=label+'-javascript-'+kind+'-v1';out='evidence/'+stem+'.json'
  with open('evidence/'+stem+'.log','x') as log:
   result=subprocess.run([node,'--experimental-vm-modules','helpers/'+helper,target,out],stdout=log,stderr=subprocess.STDOUT,env=env)
  d=json.loads(Path(out).read_text()) if Path(out).exists() else {};row={'helper':helper,'target':label,'exit':result.returncode,'rows':len(d.get('observations',[])),'setupFailure':d.get('failure'),'rowFailures':[r.get('name') for r in d.get('observations',[]) if r.get('failure')],'elapsedSeconds':round(time.monotonic()-started,3)};rows.append(row);print(json.dumps(row),flush=True)
Path('evidence/baseline-run-status.json').write_text(json.dumps(rows,indent=2)+'\n')
