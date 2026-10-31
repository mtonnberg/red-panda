"""Prepared remaining-SDK-only gate; prior100 positives remain separate."""
from pathlib import Path
import json,hashlib,subprocess,time,signal,os,re,resource
p=Path(__file__).resolve().parent;root=p.parent.parent;s=Path('/workspace/shared/promise-attribution-authority-r2');packet=p/'candidate-static-r2';out=p/'sdk42-validation-r1';plan=json.loads((p/'sdk42-static-r1/plan.json').read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();base=json.loads((packet/'base-source.json').read_text());candidate=json.loads((packet/'candidate-source.json').read_text());steps=[];start=time.monotonic();overall=start+180
def save(name,value):(out/name).write_text(json.dumps(value,indent=2)+'\n')
def snapshot():
 result={}
 for label,folder,mapping in [('Root',root,base),('candidate',s,candidate)]:
  for name,expected in mapping.items():
   value=sha(folder/name)
   if value!=expected:raise RuntimeError('Source epoch mismatch: '+label+'/'+name)
   result[label+'/'+name]=value
 for name,expected in plan['oracles'].items():
  for label,folder in [('Root',root),('candidate',s)]:
   value=sha(folder/name)
   if value!=expected:raise RuntimeError('Oracle epoch mismatch: '+label+'/'+name)
   result[label+'/'+name]=value
 for f in (root/'node_modules').rglob('*'):
  if f.is_file():result['dependency/'+str(f.relative_to(root/'node_modules'))]=sha(f)
 for node in plan['nodes'].values():result[node]=sha(Path(node))
 for f in [Path(__file__),p/'sdk42-static-r1/plan.json',packet/'integration.patch']:result[str(f)]=sha(f)
 return result
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
def run(name,sdk,files,expected_tests,expected_pass,expected_skip=0,cap=90,extra=None,proof=False):
 command=[plan['nodes'][sdk],'--experimental-vm-modules','--test','--test-reporter=tap','--test-concurrency=1',*(extra or []),*files];env=dict(os.environ,NODE_USE_ENV_PROXY='1')
 for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[env.get(key),'127.0.0.1','localhost','0.0.0.0']))
 if proof:env['PROMISE_ATTRIBUTION_EVIDENCE']=str(out/(name+'-actual-cases.json'))
 began=time.monotonic()
 with (out/(name+'.stdout')).open('xb')as stdout,(out/(name+'.stderr')).open('xb')as stderr:
  child=subprocess.Popen(command,cwd=s,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=core_zero)
  try:code=child.wait(timeout=min(cap,overall-time.monotonic()));expired=False
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
 text=(out/(name+'.stdout')).read_text();counts={}
 for label in ['tests','pass','fail','skipped','cancelled']:
  found=re.findall(r'^# '+label+r' (\d+)$',text,re.M);counts[label]=int(found[-1])if found else None
 step={'name':name,'sdk':sdk,'pid':child.pid,'exit':code,'deadline':expired,'seconds':time.monotonic()-began,'command':command,'expectedTests':expected_tests,'expectedPass':expected_pass,'expectedSkipped':expected_skip,'counts':counts};steps.append(step);save('steps.json',steps);print(json.dumps(step),flush=True)
 if code or expired or counts!={'tests':expected_tests,'pass':expected_pass,'fail':0,'skipped':expected_skip,'cancelled':0}:raise RuntimeError(name+' failed; no retries or later phases')
out.mkdir(exist_ok=False);before=snapshot();save('source-before.json',before);failure=None
try:
 for sdk in ['24.19','26.13']:run(sdk+'-attribution',sdk,['test/promise-attribution.test.js','test/errors.test.js'],21,21,cap=90,proof=True)
except Exception as error:failure={'name':type(error).__name__,'message':str(error)}
after=snapshot();save('source-after.json',after);status={'scope':'same21 attribution/errors each remainingSDK; prior100 not repeated','steps':steps,'failure':failure,'unchanged':before==after,'guardInputs':len(before),'actualExecutedPass':sum(step['counts'].get('pass')or 0 for step in steps),'expectedExecutedPass':42,'explicitlyUnrunHeapCase':True,'seconds':time.monotonic()-start,'administrativeSeconds':180,'RootEdits':False};save('status.json',status);print(json.dumps(status));raise SystemExit(0 if failure is None and before==after and status['actualExecutedPass']==42 else 1)
