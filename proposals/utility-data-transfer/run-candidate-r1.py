"""Prepared first candidate gate. Parent lease required; no Native repeats."""
from pathlib import Path
import json,hashlib,subprocess,time,signal,os,re,resource
p=Path(__file__).resolve().parent;root=p.parent.parent;s=Path('/workspace/shared/utility-data-transfer-20261031');packet=p/'candidate-static-r1';out=p/'candidate-validation-r1';node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();candidate=json.loads((packet/'candidate-source.json').read_text());steps=[];start=time.monotonic();deadline=start+120
def save(name,value):(out/name).write_text(json.dumps(value,indent=2)+'\n')
def snapshot():
 result={}
 for name,expected in candidate.items():
  value=sha(s/name)
  if value!=expected:raise RuntimeError('Owned source epoch mismatch: '+name)
  result['candidate/'+name]=value
 for d in ['src','test','native','scripts','bin']:
  for f in (root/d).rglob('*'):
   if f.is_file():result['Root/'+str(f.relative_to(root))]=sha(f)
 for f in (root/'node_modules').rglob('*'):
  if f.is_file():result['dependency/'+str(f.relative_to(root/'node_modules'))]=sha(f)
 for f in [node,Path(__file__),p/'candidate-probe-r1.mjs',p/'native-r2/Native.json',packet/'integration.patch']:result[str(f)]=sha(f)
 return result
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
def run(name,args,cap,tests=None,proof=False):
 env=dict(os.environ,NODE_USE_ENV_PROXY='1')
 for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[env.get(key),'127.0.0.1','localhost','0.0.0.0']))
 if proof:env['DATA_TRANSFER_REALM_PROOF']=str(out/'actual-realm-proof.json')
 began=time.monotonic()
 with(out/(name+'.stdout')).open('xb')as stdout,(out/(name+'.stderr')).open('xb')as stderr:
  child=subprocess.Popen([str(node),*args],cwd=s,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=core_zero)
  try:code=child.wait(timeout=min(cap,deadline-time.monotonic()));expired=False
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
 step={'name':name,'pid':child.pid,'exit':code,'deadline':expired,'seconds':time.monotonic()-began};steps.append(step);save('steps.json',steps);print(json.dumps(step),flush=True)
 if code or expired:raise RuntimeError(name+' failed; later phases unrun')
 if tests is not None:
  text=(out/(name+'.stdout')).read_text();counts={label:int(re.findall(r'^# '+label+r' (\d+)$',text,re.M)[-1])for label in ['tests','pass','fail','skipped','cancelled']};step['counts']=counts;save('steps.json',steps)
  if counts!={'tests':tests,'pass':tests,'fail':0,'skipped':0,'cancelled':0}:raise RuntimeError(name+' count/assertion failure')
def semantic(row):
 def value(response):
  if response.get('exceptionDetails'):raise RuntimeError('Runtime exception in '+row['name'])
  return response['result']['value']
 if row['name']=='actual-node-resolution':return{'sameBackend':row['sameBackend'],'main':value(row['main']),'utility':value(row['utility'])}
 return{key:value(row[key])for key in ['result','mainVerification','utility','main']if key in row}
out.mkdir(exist_ok=False);before=snapshot();save('source-before.json',before);failure=None
try:
 for name in ['src/data-transfer.js','src/file-wrapper-realms.js','src/dom-events.js','src/blob.js','src/isolated-world.js','src/world-sessions.js','test/utility-data-transfer.test.js']:run('syntax-'+Path(name).name,['--check',name],5)
 run('new-tests',['--experimental-vm-modules','--test','--test-reporter=tap','--test-concurrency=1','test/utility-data-transfer.test.js'],45,6,True)
 run('owned-profile',[str(p/'candidate-probe-r1.mjs'),str(out/'candidate-profile.json')],20)
 native=json.loads((p/'native-r2/Native.json').read_text());current=json.loads((out/'candidate-profile.json').read_text());comparisons=[]
 if len(current['rows'])!=7:raise RuntimeError('Incomplete owned profile')
 for n,c in zip(native['rows'][:6],current['rows'][:6]):
  if n['name']!=c['name']:raise RuntimeError('Profile ordering changed')
  a,b=semantic(n),semantic(c);comparisons.append({'name':n['name'],'Native':a,'candidate':b,'equal':a==b})
 save('native-semantic-comparison.json',{'rows':comparisons,'protocolControl':{'Native':native['rows'][6],'candidate':current['rows'][6]},'note':'Raw token/remote metadata retained in full reports; ordinary cross-world protocol control is separate from six DataTransfer semantic objects'})
 if not all(row['equal']for row in comparisons):raise RuntimeError('Actual Native DataTransfer semantic object mismatch')
 run('protected-tests',['--experimental-vm-modules','--test','--test-reporter=tap','--test-concurrency=1','test/dom-events.test.js','test/blob-integration.test.js','test/isolated-world.test.js','test/private-event-utility-backing.test.js','test/utility-node-target-binding.test.js','test/platform-codec.test.js'],60,33)
except Exception as error:failure={'name':type(error).__name__,'message':str(error)}
after=snapshot();save('source-after.json',after);status={'scope':'first owned utility DataTransfer/file-factory gate; R5 consumer acceptance separately pending','steps':steps,'failure':failure,'guardInputs':len(before),'sourceUnchanged':before==after,'actualTests':sum(step.get('counts',{}).get('tests',0)for step in steps),'expectedTests':39,'NativeSemanticObjects':6,'protocolControlSeparate':True,'seconds':time.monotonic()-start,'administrativeSeconds':120,'RootEdits':False,'PS129Unrun':True};save('status.json',status);print(json.dumps(status));raise SystemExit(0 if failure is None and before==after and status['actualTests']==39 else 1)
