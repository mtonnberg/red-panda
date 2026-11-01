"""Static prepared paired branding heldouts; Parent runtime lease required."""
from pathlib import Path
import json,hashlib,subprocess,time,os,signal,resource
p=Path(__file__).resolve().parent;root=p.parent.parent;out=p/'paired-r1';node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');binary=Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux');sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();steps=[];started=time.monotonic()
def snapshot():
 result={}
 for d in ['src','test','native','scripts','bin']:
  for f in(root/d).rglob('*'):
   if f.is_file():result['Root/'+str(f.relative_to(root))]=sha(f)
 for f in(root/'node_modules').rglob('*'):
  if f.is_file():result['dependency/'+str(f.relative_to(root/'node_modules'))]=sha(f)
 for f in [node,binary,*[f for f in p.iterdir()if f.is_file()]]:result[str(f)]=sha(f)
 for name in ['navigator/navigator.html','net/fetch.html','net/xhr.html','testing.js']:
  f=root/'.cache/lightpanda-reference/browser-948d773786/src/browser/tests'/name;result[str(f)]=sha(f)
 return result
def save(name,value):(out/name).write_text(json.dumps(value,indent=2)+'\n')
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
out.mkdir(exist_ok=False);before=snapshot();save('source-before.json',before);failure=None
try:
 for engine,executable in [('Native',binary),('candidate',p/'candidate-launcher')]:
  env=dict(os.environ,NODE_USE_ENV_PROXY='1')
  for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[env.get(key),'127.0.0.1','localhost','0.0.0.0']))
  command=[str(node),str(p/'probe.mjs'),engine,str(executable),str(out/(engine+'.json'))];begin=time.monotonic()
  with(out/(engine+'.stdout')).open('xb')as stdout,(out/(engine+'.stderr')).open('xb')as stderr:
   child=subprocess.Popen(command,cwd=root,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=core_zero)
   try:code=child.wait(timeout=min(20,45-(time.monotonic()-started)));expired=False
   except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
  step={'engine':engine,'pid':child.pid,'exit':code,'deadline':expired,'seconds':time.monotonic()-begin};steps.append(step);save('steps.json',steps);print(json.dumps(step),flush=True)
  if code or expired:raise RuntimeError(engine+' failed; later phases unobserved')
  result=json.loads((out/(engine+'.json')).read_text());step['actualRows']=len(result['rows']);step['functionalFailures']=[{'name':r['name'],'checks':r.get('functionalFailures')}for r in result['rows']if r.get('functionalFailures')];save('steps.json',steps)
  if result.get('error')or len(result['rows'])!=6:raise RuntimeError(engine+' incomplete actual profile')
except Exception as error:failure={'name':type(error).__name__,'message':str(error)}
after=snapshot();save('source-after.json',after);status={'steps':steps,'failure':failure,'guardInputs':len(before),'sourceUnchanged':before==after,'actualRows':sum(s.get('actualRows',0)for s in steps),'expectedRows':12,'seconds':time.monotonic()-started,'originalNonpassesUnchanged':True,'functionalFailuresRemainObservations':True,'RootEdits':False};save('status.json',status);print(json.dumps(status));raise SystemExit(0 if failure is None and before==after and status['actualRows']==12 else 1)
