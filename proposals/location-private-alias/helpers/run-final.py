from pathlib import Path
import subprocess,os,signal,json,time,hashlib
r=Path(__file__).resolve().parent.parent;negative=r/'negative-before';nodes=['/workspace/shared/rea-tools/node_modules/node/bin/node','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node','/workspace/shared/node26/node_modules/node/bin/node']
env=dict(os.environ,NODE_USE_ENV_PROXY='1');prior=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]))
aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[prior,aliases])) for key in ['NO_PROXY','no_proxy']})
properFiles=sorted(set([p for tree in [r/'src',r/'native',r/'helpers',r/'node_modules',r/'test'] for p in tree.rglob('*') if p.is_file() and '__pycache__'not in p.parts]+[r/'package.json',r/'package-lock.json',*map(Path,nodes),Path('/workspace/red-panda/scripts/reference-server.mjs'),Path('/workspace/red-panda/test/cdp-client.js')]))
negativeFiles=sorted([*negative.glob('src/**/*.js'),*negative.glob('test/*.js'),negative/'package.json',negative/'package-lock.json'])
def snapshot(paths):return{str(p):hashlib.sha256(p.read_bytes()).hexdigest()for p in paths}
start=time.monotonic();before=snapshot(properFiles);negativeBefore=snapshot(negativeFiles)
for label,data in [('proper',before),('negative',negativeBefore)]:(r/('evidence/final-'+label+'-before.json')).write_text(json.dumps(data,indent=2)+'\n')
rows=[];operations=[('candidate-wire',[nodes[0],'--experimental-vm-modules','helpers/prototype-null.mjs',str(r),'evidence/candidate-positive.json'],r)]+[('proper-'+str(index),[node,'--experimental-vm-modules','--test','test/location-private-alias.test.js'],r)for index,node in enumerate(nodes)]+[('negative',[nodes[0],'--experimental-vm-modules','--test','test/location-private-alias.test.js'],negative)]
for label,command,cwd in operations:
 with (r/('evidence/'+label+'.log')).open('x')as log:
  process=subprocess.Popen(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=process.wait(timeout=max(.5,25-(time.monotonic()-start)))
  except BaseException:
   os.killpg(process.pid,signal.SIGTERM)
   try:process.wait(timeout=.2)
   except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
   raise
 rows.append({'label':label,'exit':code,'expectedNegative':label=='negative','elapsedSeconds':round(time.monotonic()-start,3)});print(json.dumps(rows[-1]),flush=True)
after=snapshot(properFiles);negativeAfter=snapshot(negativeFiles)
for label,data in [('proper',after),('negative',negativeAfter)]:(r/('evidence/final-'+label+'-after.json')).write_text(json.dumps(data,indent=2)+'\n')
status={'rows':rows,'properInputs':len(before),'properUnchanged':before==after,'negativeInputs':len(negativeBefore),'negativeUnchanged':negativeBefore==negativeAfter,'elapsedSeconds':round(time.monotonic()-start,3)};(r/'evidence/final-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status),flush=True)
