# Explicitly scoped two-SDK affected checks; not a broad/full-suite claim.
import pathlib,json,hashlib,subprocess,time,signal,os,re,resource
p=pathlib.Path(__file__).resolve().parent;root=pathlib.Path('/workspace/red-panda');s=pathlib.Path('/workspace/shared/animation-scheduler-only-20261031');out=p/'scheduler-only-sdk-validation-r1';out.mkdir(exist_ok=False);sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();save=lambda n,v:(out/n).write_text(json.dumps(v,indent=2)+'\n');base=json.loads((p/'scheduler-only-static-r1/base-source.json').read_text());candidate=json.loads((p/'scheduler-only-static-r1/candidate-source.json').read_text());deps=json.loads((root/'proposals/phase23-first-gate-dacebc/dependencies.json').read_text());native=json.loads((root/'proposals/phase23-first-gate-dacebc/native18.json').read_text());nodes=[('24.19','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('26.13','/workspace/shared/node26/node_modules/node/bin/node')];steps=[];start=time.monotonic();deadline=start+180
def snapshot():
 values={}
 for label,folder,items in [('Root',root,base),('candidate',s,candidate),('dependencies',root,deps),('RootNative18',root,native),('copiedNative18',s,native)]:
  for name,h in items.items():value=sha(folder/name);assert value==h,(label,name);values[label+'/'+name]=value
 for f in [pathlib.Path(n)for _,n in nodes]+[pathlib.Path(__file__),p/'scheduler-only-probe.mjs',p/'timing-expression.js',p/'timing-r1/Native.json']:values[str(f)]=sha(f)
 return values
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
def run(sdk,name,command,folder,env=None,cap=40):
 began=time.monotonic();logfile=folder/(name+'.log')
 with logfile.open('xb')as log:
  child=subprocess.Popen(command,cwd=s,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,preexec_fn=core_zero)
  try:code=child.wait(timeout=min(cap,deadline-time.monotonic()));expired=False
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
 step={'sdk':sdk,'name':name,'command':command,'pid':child.pid,'exit':code,'administrativeDeadline':expired,'seconds':time.monotonic()-began};steps.append(step);save('steps.json',steps)
 if code or expired:raise RuntimeError(sdk+' '+name+' failed; no retries')
 return step
def project(v):return{'mode':v['mode'],'blockMS':v['blockMS'],'state':v['state'],'finishEvents':v['finishEvents'],'cancelEvents':v['cancelEvents'],'firstState':next(e['state']for e in v['events']if e['name']=='first-before'),'middleStates':[e['state']for e in v['events']if e['name']=='middle']}
before=snapshot();save('source-before.json',before);failure=None
try:
 for sdk,node in nodes:
  folder=out/sdk;folder.mkdir()
  run(sdk,'timing',[node,'--experimental-vm-modules',str(p/'scheduler-only-probe.mjs'),'candidate','timing',str(folder/'timing.json')],folder,cap=20);n=json.loads((p/'timing-r1/Native.json').read_text());c=json.loads((folder/'timing.json').read_text());assert n['templateSHA256']==c['templateSHA256'];rows=[]
  for nr,cr in zip(n['rows'],c['rows']):
   assert nr['expressionSHA256']==cr['sourceSHA256']
   for nv,cv in zip(nr['result']['result']['value'],cr['result']['result']['value']):rows.append({'Native':project(nv),'candidate':project(cv),'equal':project(nv)==project(cv)})
  (folder/'timing-comparison.json').write_text(json.dumps(rows,indent=2)+'\n');assert len(rows)==6 and all(v['equal']for v in rows),'Controlled state mismatch'
  for name,count in [('animations',12),('window-lifecycle-timers',12),('animations-allocation',2),('animation-task-owner',2)]:
   env=os.environ.copy()
   if name=='animations-allocation':env['ANIMATION_CONTEXT_EVIDENCE']=str(folder/'actual-animation-context.json')
   if name=='window-lifecycle-timers':env['RED_PANDA_WINDOW_TASK_PROOF']=str(folder/'actual-window-context.json')
   step=run(sdk,name,[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/'+name+'.test.js'],folder,env);text=(folder/(name+'.log')).read_text();find=lambda label:int(re.findall(r'\b'+label+r' (\d+)',text)[-1]);step.update({'expected':count,'actual':find('tests'),'pass':find('pass'),'fail':find('fail')});save('steps.json',steps);assert step['actual']==step['pass']==count and step['fail']==0
except Exception as error:failure={'name':type(error).__name__,'message':str(error)}
after=snapshot();save('source-after.json',after);status={'scope':'Same unchanged five-leaf queue-only candidate, affected checks only','steps':steps,'failure':failure,'sourceUnchanged':before==after,'guardInputs':len(before),'seconds':time.monotonic()-start,'expectedPerSDK':28,'actualTests':sum(v.get('actual',0)for v in steps),'pass':sum(v.get('pass',0)for v in steps),'RootApplied':False};save('status.json',status);print(json.dumps(status));raise SystemExit(0 if not failure and before==after and status['actualTests']==status['pass']==56 else 1)
