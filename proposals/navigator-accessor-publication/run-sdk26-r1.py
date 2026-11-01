"""Prepared remaining-SDK26 gate; explicit Parent lease required."""
from pathlib import Path
import json,hashlib,subprocess,time,signal,os,re,resource
p=Path(__file__).resolve().parent;root=p.parent.parent;s=Path('/workspace/shared/navigator-accessor-publication-r2-20261101');packet=p/'candidate-static-r2';out=p/'sdk26-validation-r1';plan=json.loads((p/'sdk26-static-r1/plan.json').read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();candidate=json.loads((packet/'candidate-source.json').read_text());steps=[];start=time.monotonic();deadline=start+180
def save(name,value):(out/name).write_text(json.dumps(value,indent=2)+'\n')
def snapshot():
 result={}
 for name,expected in candidate.items():
  value=sha(s/name)
  if value!=expected:raise RuntimeError('Owned source epoch mismatch: '+name)
  result['candidate/'+name]=value
 for d in ['src','test','native','scripts','bin']:
  for f in(root/d).rglob('*'):
   if f.is_file():result['Root/'+str(f.relative_to(root))]=sha(f)
 for f in(root/'node_modules').rglob('*'):
  if f.is_file():result['dependency/'+str(f.relative_to(root/'node_modules'))]=sha(f)
 for node in plan['nodes'].values():result[node]=sha(Path(node))
 for f in [Path(__file__),p/'sdk26-static-r1/plan.json',packet/'integration.patch',root/'proposals/branding-heldout-static-r1/paired-r1/Native.json']:result[str(f)]=sha(f)
 return result
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
def run(sdk):
 name=sdk+'-navigator13';env=dict(os.environ,NODE_USE_ENV_PROXY='1')
 for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[env.get(key),'127.0.0.1','localhost','0.0.0.0']))
 env['NAVIGATOR_ACCESSOR_REALM_PROOF']=str(out/(name+'-physical.json'));command=[plan['nodes'][sdk],'--experimental-vm-modules','--test','--test-reporter=tap','--test-concurrency=1',*plan['files']];began=time.monotonic()
 with(out/(name+'.stdout')).open('xb')as stdout,(out/(name+'.stderr')).open('xb')as stderr:
  child=subprocess.Popen(command,cwd=s,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=core_zero)
  try:code=child.wait(timeout=min(90,deadline-time.monotonic()));expired=False
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
 text=(out/(name+'.stdout')).read_text();counts={}
 for label in ['tests','pass','fail','skipped','cancelled']:
  found=re.findall(r'^# '+label+r' (\d+)$',text,re.M);counts[label]=int(found[-1])if found else None
 step={'name':name,'sdk':sdk,'pid':child.pid,'exit':code,'deadline':expired,'seconds':time.monotonic()-began,'command':command,'counts':counts};steps.append(step);save('steps.json',steps);print(json.dumps(step),flush=True)
 if code or expired or counts!={'tests':13,'pass':13,'fail':0,'skipped':0,'cancelled':0}:raise RuntimeError(name+' failed; later SDK unrun')
 proofs=json.loads((out/(name+'-physical.json')).read_text())['proofs'];step['physicalRows']=len(proofs);step['allPhysicalSelectedVMNotHostBeforeAfterNull']=all(row[phase]=={'selected':True,'Host':False,'global':True}for row in proofs for phase in ['before','after']);save('steps.json',steps)
 if len(proofs)!=88 or not step['allPhysicalSelectedVMNotHostBeforeAfterNull']:raise RuntimeError(name+' physical proof mismatch')
out.mkdir(exist_ok=False);before=snapshot();save('source-before.json',before);failure=None
try:
 for sdk in ['24.19','26.13']:run(sdk)
except Exception as error:failure={'name':type(error).__name__,'message':str(error)}
after=snapshot();save('source-after.json',after);status={'scope':plan['scope'],'steps':steps,'failure':failure,'guardInputs':len(before),'sourceUnchanged':before==after,'actualPassed':sum(step['counts'].get('pass')or 0 for step in steps),'expectedPassed':26,'seconds':time.monotonic()-start,'administrativeSeconds':180,'RootEdits':False};save('status.json',status);print(json.dumps(status));raise SystemExit(0 if failure is None and before==after and status['actualPassed']==26 else 1)
