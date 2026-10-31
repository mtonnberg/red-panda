"""Prepared PS129 composition; explicit runtime/build lease required."""
from pathlib import Path
import json,hashlib,subprocess,time,signal,os,re,resource,tempfile
p=Path(__file__).resolve().parent;root=p.parent.parent;s=Path('/workspace/shared/utility-data-transfer-ps-r1-20261031');packet=p/'ps-composition-static-r1';out=p/'ps129-validation-r1';plan=json.loads((packet/'plan.json').read_text());candidate=json.loads((packet/'candidate-source.json').read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();steps=[];start=time.monotonic();deadline=start+180

def save(name,value):(out/name).write_text(json.dumps(value,indent=2)+'\n')
def snapshot():
 result={}
 for name,expected in candidate.items():
  value=sha(s/name)
  if value!=expected:raise RuntimeError('Owned source epoch mismatch: '+name)
  result['candidate/'+name]=value
 for d in ['src','test','native','scripts','bin','automation']:
  for f in (root/d).rglob('*'):
   if f.is_file() and (d!='automation' or not set(f.relative_to(root/d).parts)&{'.spago','output'}):result['Root/'+str(f.relative_to(root))]=sha(f)
 for f in (root/'node_modules').rglob('*'):
  if f.is_file():result['dependency/'+str(f.relative_to(root/'node_modules'))]=sha(f)
 for f in (s/'automation/.spago/p').rglob('*.purs'):result['cached-pinned-source/'+str(f.relative_to(s/'automation/.spago/p'))]=sha(f)
 for node in [plan['node'],*plan['otherNodes']]:result[node]=sha(Path(node))
 for f in [Path(__file__),packet/'plan.json',packet/'composition.json',p/'candidate-static-r3/integration.patch',root/'proposals/purescript-upload/static-r1/integration.patch']:result[str(f)]=sha(f)
 return result
def outputs():return {str(f.relative_to(s/'automation/output')):sha(f)for f in (s/'automation/output').rglob('*')if f.is_file()}
def fixture_dirs():return sorted(str(f)for f in Path(tempfile.gettempdir()).glob(plan['fixturePrefix']+'*'))
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
def run(name,args,cap):
 env=dict(os.environ,NODE_USE_ENV_PROXY='1',XDG_CACHE_HOME=str(s/'.cache'),XDG_CONFIG_HOME=str(s/'.cache/config'),XDG_DATA_HOME=str(s/'.cache/data'))
 for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[env.get(key),'127.0.0.1','localhost','0.0.0.0']))
 command=[plan['node'],*args];began=time.monotonic()
 with(out/(name+'.stdout')).open('xb')as stdout,(out/(name+'.stderr')).open('xb')as stderr:
  child=subprocess.Popen(command,cwd=s,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=core_zero)
  try:code=child.wait(timeout=min(cap,deadline-time.monotonic()));expired=False
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
 step={'name':name,'pid':child.pid,'exit':code,'deadline':expired,'seconds':time.monotonic()-began,'command':command};steps.append(step);save('steps.json',steps);print(json.dumps(step),flush=True)
 if code or expired:raise RuntimeError(name+' failed; later stages unrun')
 if name=='PS129':
  text=(out/(name+'.stdout')).read_text();step['actualAssertions']=len(re.findall(r'^PASS ',text,re.M));step['old117Completion']='PureScript Puppeteer integration: 117 checks passed' in text;step['new12Completion']='PureScript Puppeteer upload: 12 checks passed' in text;save('steps.json',steps)
  if step['actualAssertions']!=129 or not step['old117Completion']or not step['new12Completion']or re.search(r'^FAIL ',text,re.M):raise RuntimeError('PS assertion/completion mismatch')
out.mkdir(exist_ok=False);before=snapshot();save('source-before.json',before);save('outputs-before.json',outputs());fixtures_before=fixture_dirs();save('fixtures-before.json',fixtures_before);failure=None
try:
 run('strict-cached-build',plan['buildCommand'],90)
 run('PS129',plan['testCommand'],90)
except Exception as error:failure={'name':type(error).__name__,'message':str(error)}
after=snapshot();save('source-after.json',after);save('outputs-after.json',outputs());fixtures_after=fixture_dirs();save('fixtures-after.json',fixtures_after);leaked=sorted(set(fixtures_after)-set(fixtures_before));status={'scope':plan['scope'],'steps':steps,'failure':failure,'guardInputs':len(before),'sourceUnchanged':before==after,'newDiskFixturesRemaining':leaked,'actualAssertions':sum(step.get('actualAssertions',0)for step in steps),'expectedAssertions':129,'seconds':time.monotonic()-start,'administrativeSeconds':180,'RootEdits':False,'noNativeBuild':True};save('status.json',status);print(json.dumps(status));raise SystemExit(0 if failure is None and before==after and not leaked and status['actualAssertions']==129 else 1)
