from pathlib import Path
import subprocess,os,signal,json,time,hashlib,sys
r=Path(__file__).resolve().parent.parent;candidate=Path('/workspace/shared/cdp-cookie-shape-followup');node='/workspace/shared/rea-tools/node_modules/node/bin/node';label=sys.argv[1]
env=dict(os.environ,NODE_USE_ENV_PROXY='1');prior=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]))
aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[prior,aliases]))for key in ['NO_PROXY','no_proxy']})
paths=sorted(set([p for tree in [candidate/'src',candidate/'native',candidate/'node_modules',r/'helpers']for p in tree.rglob('*')if p.is_file()and'__pycache__'not in p.parts]+[candidate/'package.json',candidate/'package-lock.json',Path(node),Path('/workspace/red-panda/scripts/reference-server.mjs'),Path('/workspace/red-panda/test/cdp-client.js'),Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux')]))
def snapshot():return{str(p):hashlib.sha256(p.read_bytes()).hexdigest()for p in paths}
start=time.monotonic();before=snapshot();(r/('evidence/'+label+'-before.json')).write_text(json.dumps(before,indent=2)+'\n');target='native'if label=='native'else str(candidate)
command=[node,'--experimental-vm-modules','helpers/discriminators.mjs',target,'evidence/'+label+'.json']
with(r/('evidence/'+label+'.log')).open('x')as log:
 process=subprocess.Popen(command,cwd=r,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:code=process.wait(timeout=25)
 except BaseException:
  os.killpg(process.pid,signal.SIGTERM)
  try:process.wait(timeout=.2)
  except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
  raise
after=snapshot();(r/('evidence/'+label+'-after.json')).write_text(json.dumps(after,indent=2)+'\n');status={'target':label,'command':command,'exit':code,'inputs':len(before),'unchanged':before==after,'changed':[p for p in set(before)|set(after)if before.get(p)!=after.get(p)],'elapsedSeconds':round(time.monotonic()-start,3)};(r/('evidence/'+label+'-status.json')).write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status),flush=True)
