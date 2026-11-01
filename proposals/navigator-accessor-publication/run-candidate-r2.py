"""Unrun isolated publication gate; Parent runtime lease required."""
from pathlib import Path
import json,hashlib,subprocess,time,signal,os,re,resource
p=Path(__file__).resolve().parent;root=p.parent.parent;s=Path('/workspace/shared/navigator-accessor-publication-r2-20261101');packet=p/'candidate-static-r2';out=p/'candidate-validation-r2';node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();candidate=json.loads((packet/'candidate-source.json').read_text());steps=[];start=time.monotonic();deadline=start+120
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
 for f in [node,Path(__file__),p/'probe-r2.mjs',p/'expressions.json',p/'candidate-launcher-r2',root/'proposals/branding-heldout-static-r1/paired-r1/Native.json',root/'proposals/branding-heldout-static-r1/paired-r1/manifest.json',packet/'integration.patch']:result[str(f)]=sha(f)
 return result
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
def run(name,args,cap,tests=None,proof=False):
 env=dict(os.environ,NODE_USE_ENV_PROXY='1')
 for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[env.get(key),'127.0.0.1','localhost','0.0.0.0']))
 if proof:env['NAVIGATOR_ACCESSOR_REALM_PROOF']=str(out/'actual-realm-proof.json')
 began=time.monotonic()
 with(out/(name+'.stdout')).open('xb')as stdout,(out/(name+'.stderr')).open('xb')as stderr:
  child=subprocess.Popen([str(node),*args],cwd=s,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=core_zero)
  try:code=child.wait(timeout=min(cap,deadline-time.monotonic()));expired=False
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
 step={'name':name,'pid':child.pid,'exit':code,'deadline':expired,'seconds':time.monotonic()-began};steps.append(step)
 if tests is not None:
  text=(out/(name+'.stdout')).read_text();counts={}
  for label in ['tests','pass','fail','skipped','cancelled']:
   found=re.findall(r'^# '+label+r' (\d+)$',text,re.M);counts[label]=int(found[-1])if found else None
  step['counts']=counts
 save('steps.json',steps);print(json.dumps(step),flush=True)
 if code or expired:raise RuntimeError(name+' failed; later phases unrun')
 if tests is not None and step['counts']!={'tests':tests,'pass':tests,'fail':0,'skipped':0,'cancelled':0}:raise RuntimeError(name+' test count failure')
out.mkdir(exist_ok=False);before=snapshot();save('source-before.json',before);failure=None
try:
 run('new-tests',['--experimental-vm-modules','--test','--test-reporter=tap','--test-concurrency=1','test/navigator-accessor-publication.test.js'],45,4,True)
 proofs=json.loads((out/'actual-realm-proof.json').read_text())['proofs']
 if len(proofs)!=88 or not all(row[phase]=={'selected':True,'Host':False,'global':True}for row in proofs for phase in ['before','after']):raise RuntimeError('Actual creation-context proof mismatch')
 run('existing-navigator9',['--experimental-vm-modules','--test','--test-reporter=tap','--test-concurrency=1','test/navigator.test.js'],45,9)
 run('candidate-heldouts',[str(p/'probe-r2.mjs'),'candidate',str(p/'candidate-launcher-r2'),str(out/'candidate.json')],20)
 actual=json.loads((out/'candidate.json').read_text());native=json.loads((root/'proposals/branding-heldout-static-r1/paired-r1/Native.json').read_text());values={row['name']:row['response']['result']['value']for row in actual['rows']};expected=next(row for row in native['rows']if row['name']=='navigator-accessor-suffix')['response']['result']['value'];equal=values.get('navigator-accessor-suffix')==expected;save('native-descriptor-comparison.json',{'Native':expected,'candidate':values.get('navigator-accessor-suffix'),'exactEqual':equal,'completeOtherRawRowsPreserved':True,'noBrandNormalization':True})
 if actual.get('error')or len(actual['rows'])!=6 or any(row['functionalFailures']for row in actual['rows'])or not equal:raise RuntimeError('Actual heldout/Native descriptor mismatch')
except Exception as error:failure={'name':type(error).__name__,'message':str(error)}
after=snapshot();save('source-after.json',after);status={'scope':'owned Navigator public getter publication; real identity unchanged','steps':steps,'failure':failure,'guardInputs':len(before),'sourceUnchanged':before==after,'actualTests':sum(step.get('counts',{}).get('tests')or 0 for step in steps),'expectedTests':13,'expectedPhysicalRows':88,'seconds':time.monotonic()-start,'administrativeSeconds':120,'RootEdits':False,'OriginalBrandingNonpassesPreserved':True,'pluginsWrapperPhysicalBirthUnclaimed':True,'foreignBorrowingUnclaimed':True};save('status.json',status);print(json.dumps(status));raise SystemExit(0 if failure is None and before==after and status['actualTests']==13 else 1)
