from pathlib import Path
import subprocess,os,signal,json,time,hashlib
r=Path(__file__).resolve().parent.parent;node='/workspace/shared/rea-tools/node_modules/node/bin/node'
env=dict(os.environ,NODE_USE_ENV_PROXY='1');prior=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]))
aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[prior,aliases])) for key in ['NO_PROXY','no_proxy']})
paths=sorted(set([p for tree in [r/'src',r/'native',r/'helpers',r/'node_modules'] for p in tree.rglob('*') if p.is_file() and '__pycache__'not in p.parts]+[r/'package.json',r/'package-lock.json',Path(node),Path('/workspace/red-panda/scripts/reference-server.mjs'),Path('/workspace/red-panda/test/cdp-client.js'),Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux')]))
def snapshot():return{str(p):hashlib.sha256(p.read_bytes()).hexdigest()for p in paths}
start=time.monotonic();before=snapshot();(r/'evidence/baseline-before.json').write_text(json.dumps(before,indent=2)+'\n');rows=[]
for label,target in [('native','native'),('candidate',str(r))]:
 command=[node,'--experimental-vm-modules','helpers/prototype-null.mjs',target,'evidence/'+label+'-baseline.json']
 with (r/('evidence/'+label+'-baseline.log')).open('x')as log:
  process=subprocess.Popen(command,cwd=r,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=process.wait(timeout=max(.5,6-(time.monotonic()-start)))
  except BaseException:
   os.killpg(process.pid,signal.SIGTERM)
   try:process.wait(timeout=.2)
   except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
   raise
 rows.append({'target':label,'exit':code,'elapsedSeconds':round(time.monotonic()-start,3)});print(json.dumps(rows[-1]),flush=True)
after=snapshot();(r/'evidence/baseline-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'rows':rows,'inputs':len(before),'unchanged':before==after,'elapsedSeconds':round(time.monotonic()-start,3)};(r/'evidence/baseline-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status),flush=True)
