"""Prepared Native-only observation gate; no implementation or browser build."""
from pathlib import Path
import json,hashlib,subprocess,time,os,signal,resource
p=Path(__file__).resolve().parent;root=p.parent.parent;out=p/'native-r2';node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');binary=Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux');sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
def snapshot():
 files=[f for d in ['src','test','native']for f in(root/d).rglob('*')if f.is_file()]+[f for f in p.glob('*')if f.is_file()]+[node,binary,root/'scripts/reference-server.mjs'];return{str(f):sha(f)for f in files}
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
out.mkdir(exist_ok=False);before=snapshot();(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n');env=dict(os.environ,NODE_USE_ENV_PROXY='1')
for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[env.get(key),'127.0.0.1','localhost','0.0.0.0']))
command=[str(node),str(p/'native-probe-r2.mjs'),str(out/'Native.json')];start=time.monotonic()
with(out/'stdout').open('xb')as stdout,(out/'stderr').open('xb')as stderr:
 child=subprocess.Popen(command,cwd=root,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=core_zero)
 try:code=child.wait(timeout=20);expired=False
 except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'scope':'Native-only7 same-backend profiles; expected crossworld rejection retained','pid':child.pid,'exit':code,'deadline':expired,'seconds':time.monotonic()-start,'RPCBudgetMS':2500,'ownedBudgetMS':15000,'outerSeconds':20,'sourceUnchanged':before==after,'guardInputs':len(before),'implementationChanged':False};(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if code==0 and not expired and before==after else 1)
