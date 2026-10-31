# Execute only in the granted quiet slot. All original oracles and limits stay.
import pathlib,json,hashlib,subprocess,time,signal,os,re,resource
root=pathlib.Path('/workspace/red-panda');p=pathlib.Path(__file__).resolve().parent;s=pathlib.Path('/workspace/shared/animation-scheduler-only-20261031');node='/workspace/shared/rea-tools/node_modules/node/bin/node';out=p/'scheduler-only-validation-r1';out.mkdir(exist_ok=False);began=time.monotonic();deadline=began+90;sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();save=lambda name,value:(out/name).write_text(json.dumps(value,indent=2)+'\n');base=json.loads((p/'scheduler-only-static-r1/base-source.json').read_text());candidate=json.loads((p/'scheduler-only-static-r1/candidate-source.json').read_text());deps=json.loads((root/'proposals/phase23-first-gate-dacebc/dependencies.json').read_text());native=json.loads((root/'proposals/phase23-first-gate-dacebc/native18.json').read_text());steps=[]
def snapshot():
 values={}
 for label,folder,items in [('Root',root,base),('schedulerOnly',s,candidate),('dependencies',root,deps),('RootNative18',root,native),('candidateNative18',s,native)]:
  for name,expected in items.items():actual=sha(folder/name);assert actual==expected,(label,name);values[label+'/'+name]=actual
 for f in [pathlib.Path(node),pathlib.Path(__file__),p/'scheduler-only-probe.mjs',p/'timing-expression.js',p/'event-order-expression.js',p/'reaction-boundary-expression.js',p/'timing-r1/Native.json',p/'private-owner-validation-r1/Native-event-producers.json',p/'native-causal-r2/Native.json']:values[str(f)]=sha(f)
 return values
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
def run(name,command,cwd=root,env=None,cap=20):
 start=time.monotonic()
 with(out/(name+'.log')).open('xb')as log:
  child=subprocess.Popen(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,preexec_fn=core_zero)
  try:code=child.wait(timeout=min(cap,deadline-time.monotonic()));expired=False
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
 step={'name':name,'command':command,'pid':child.pid,'exit':code,'administrativeDeadline':expired,'seconds':time.monotonic()-start};steps.append(step);save('steps.json',steps)
 if code or expired:raise RuntimeError(name+' failed; stop and preserve the actual result')
 return step
before=snapshot();save('source-before.json',before);failure=None
try:
 for kind in ['events','reactions']:
  run('candidate-'+kind,[node,'--experimental-vm-modules',str(p/'scheduler-only-probe.mjs'),'candidate',kind,str(out/('candidate-'+kind+'.json'))]);c=json.loads((out/('candidate-'+kind+'.json')).read_text());assert not c.get('error')
  if kind=='events':n=json.loads((p/'private-owner-validation-r1/Native-event-producers.json').read_text());expected=n['rows'][0]['result']['result']['value'];checksum=n['rows'][0]['sourceSHA256']
  else:n=json.loads((p/'native-causal-r2/Native.json').read_text());expected=n['result']['result']['value'];checksum=n['sourceSHA256']
  assert c['rows'][0]['sourceSHA256']==checksum;actual=c['rows'][0]['result']['result']['value'];save(kind+'-comparison.json',{'Native':expected,'candidate':actual,'wholeObjectEqual':expected==actual,'actualCheckpointFlags':c.get('checkpointCalls')}) # The seven producer/lifetime rows remain diagnostic; mismatches are not filtered or claimed solved.
 run('candidate-timing',[node,'--experimental-vm-modules',str(p/'scheduler-only-probe.mjs'),'candidate','timing',str(out/'candidate-timing.json')]);n=json.loads((p/'timing-r1/Native.json').read_text());c=json.loads((out/'candidate-timing.json').read_text());assert n['templateSHA256']==c['templateSHA256'];comparisons=[]
 def project(v):return{'mode':v['mode'],'blockMS':v['blockMS'],'state':v['state'],'finishEvents':v['finishEvents'],'cancelEvents':v['cancelEvents'],'firstState':next(e['state']for e in v['events']if e['name']=='first-before'),'middleStates':[e['state']for e in v['events']if e['name']=='middle']}
 for nr,cr in zip(n['rows'],c['rows']):
  assert nr['expressionSHA256']==cr['sourceSHA256']
  for nv,cv in zip(nr['result']['result']['value'],cr['result']['result']['value']):comparisons.append({'Native':project(nv),'candidate':project(cv),'equal':project(nv)==project(cv)})
 save('timing-comparison.json',{'scope':'Complete raw clocks retained; causal projection declared explicitly','rows':comparisons});assert len(comparisons)==6 and all(v['equal']for v in comparisons),'Measured Native timing/state mismatch'
 for name,count in [('animations',12),('window-lifecycle-timers',12),('animations-allocation',2),('animation-task-owner',2)]:
  env=os.environ.copy()
  if name=='animations-allocation':env['ANIMATION_CONTEXT_EVIDENCE']=str(out/'actual-animation-context.json')
  if name=='window-lifecycle-timers':env['RED_PANDA_WINDOW_TASK_PROOF']=str(out/'actual-window-context.json')
  if name=='animation-task-owner':env['ANIMATION_WATCHDOG_EVIDENCE']=str(out/'watchdog')
  step=run(name,[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/'+name+'.test.js'],cwd=s,env=env,cap=40);text=(out/(name+'.log')).read_text();find=lambda label:int(re.findall(r'\b'+label+r' (\d+)',text)[-1]);step.update({'expected':count,'actual':find('tests'),'pass':find('pass'),'fail':find('fail')});save('steps.json',steps);assert step['actual']==step['pass']==count and step['fail']==0
 # Preserve one raw event-watchdog observation on the same exact graph.
 run('raw-event-watchdog',[node,'--experimental-vm-modules',str(s/'test/fixtures/animation-task-watchdog.mjs')],cwd=s,cap=7)
except Exception as error:failure={'name':type(error).__name__,'message':str(error)}
after=snapshot();save('source-after.json',after);status={'steps':steps,'failure':failure,'sourceUnchanged':before==after,'guardInputs':len(before),'seconds':time.monotonic()-began,'expectedTests':28,'actualTests':sum(v.get('actual',0)for v in steps),'pass':sum(v.get('pass',0)for v in steps),'RootApplied':False};save('status.json',status);print(json.dumps(status));raise SystemExit(0 if not failure and before==after and status['actualTests']==status['pass']==28 else 1)
