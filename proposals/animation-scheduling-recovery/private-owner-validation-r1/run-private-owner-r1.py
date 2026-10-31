# UNRUN until Parent grants a quiet slot. No source/budget/oracle mutation.
import pathlib,json,hashlib,subprocess,time,signal,os,re
root=pathlib.Path('/workspace/red-panda');packet=pathlib.Path(__file__).resolve().parent;source=pathlib.Path('/workspace/shared/animation-private-owner-20261031');node='/workspace/shared/rea-tools/node_modules/node/bin/node';out=packet/'private-owner-validation-r1';out.mkdir(exist_ok=False);began=time.monotonic();deadline=began+90;sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();save=lambda name,value:(out/name).write_text(json.dumps(value,indent=2)+'\n')
base=json.loads((packet/'private-owner-static-r1/base-source.json').read_text());candidate=json.loads((packet/'private-owner-static-r1/candidate-source.json').read_text());deps=json.loads((root/'proposals/phase23-first-gate-dacebc/dependencies.json').read_text());native=json.loads((root/'proposals/phase23-first-gate-dacebc/native18.json').read_text());steps=[]
def snapshot():
 values={}
 for label,folder,items in [('Root',root,base),('candidate',source,candidate),('dependencies',root,deps),('RootNative18',root,native),('candidateNative18',source,native)]:
  for name,expected in items.items():actual=sha(folder/name);assert actual==expected,(label,name);values[label+'/'+name]=actual
 for f in [pathlib.Path(node),pathlib.Path(__file__),packet/'private-owner-probe.mjs',packet/'timing-expression.js',packet/'event-order-expression.js',packet/'timing-r1/Native.json']:values[str(f)]=sha(f)
 return values
def run(name,command,cwd=root,env=None,cap=20):
 start=time.monotonic()
 with(out/(name+'.log')).open('xb')as log:
  child=subprocess.Popen(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=child.wait(timeout=min(cap,deadline-time.monotonic()));expired=False
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
 step={'name':name,'command':command,'pid':child.pid,'exit':code,'administrativeDeadline':expired,'seconds':time.monotonic()-start};steps.append(step);save('steps.json',steps)
 if code or expired:raise RuntimeError(name+' failed; original result preserved')
 return step
before=snapshot();save('source-before.json',before);failure=None
try:
 for engine in ['Native','candidate']:run(engine+'-event-producers',[node,'--experimental-vm-modules',str(packet/'private-owner-probe.mjs'),engine,'events',str(out/(engine+'-event-producers.json'))])
 n=json.loads((out/'Native-event-producers.json').read_text());c=json.loads((out/'candidate-event-producers.json').read_text());assert not n.get('error')and not c.get('error');assert n['templateSHA256']==c['templateSHA256'];actual=n['rows'][0]['result']['result']['value'];value=c['rows'][0]['result']['result']['value'];save('event-producer-comparison.json',{'Native':actual,'candidate':value,'wholeObjectEqual':actual==value});assert actual==value,'Actual Native producer/microtask mismatch'
 run('candidate-timing',[node,'--experimental-vm-modules',str(packet/'private-owner-probe.mjs'),'candidate','timing',str(out/'candidate-timing.json')])
 n=json.loads((packet/'timing-r1/Native.json').read_text());c=json.loads((out/'candidate-timing.json').read_text());assert n['templateSHA256']==c['templateSHA256'];comparisons=[]
 def project(value):
  return{'mode':value['mode'],'blockMS':value['blockMS'],'state':value['state'],'finishEvents':value['finishEvents'],'cancelEvents':value['cancelEvents'],'firstState':next(e['state']for e in value['events']if e['name']=='first-before'),'middleStates':[e['state']for e in value['events']if e['name']=='middle']}
 for nr,cr in zip(n['rows'],c['rows']):
  assert nr['expressionSHA256']==cr['sourceSHA256']
  for nv,cv in zip(nr['result']['result']['value'],cr['result']['result']['value']):comparisons.append({'Native':project(nv),'candidate':project(cv),'equal':project(nv)==project(cv)})
 save('timing-comparison.json',{'scope':'Full raw clocks retained, semantic causal projection declared explicitly','rows':comparisons});assert len(comparisons)==6 and all(row['equal']for row in comparisons),'Actual blocked timing/state mismatch'
 for name,count in [('animations',12),('window-lifecycle-timers',12),('animations-allocation',2),('animation-task-owner',2)]:
  env=os.environ.copy()
  if name=='animations-allocation':env['ANIMATION_CONTEXT_EVIDENCE']=str(out/'actual-animation-context.json')
  if name=='window-lifecycle-timers':env['RED_PANDA_WINDOW_TASK_PROOF']=str(out/'actual-window-context.json')
  step=run(name,[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/'+name+'.test.js'],cwd=source,env=env,cap=40);text=(out/(name+'.log')).read_text();find=lambda label:int(re.findall(r'\b'+label+r' (\d+)',text)[-1]);step.update({'expected':count,'actual':find('tests'),'pass':find('pass'),'fail':find('fail')});save('steps.json',steps);assert step['actual']==step['pass']==count and step['fail']==0
except Exception as error:failure={'name':type(error).__name__,'message':str(error)}
after=snapshot();save('source-after.json',after);status={'steps':steps,'failure':failure,'sourceUnchanged':before==after,'guardInputs':len(before),'seconds':time.monotonic()-began,'expectedTests':28,'actualTests':sum(s.get('actual',0)for s in steps),'pass':sum(s.get('pass',0)for s in steps),'RootApplied':False};save('status.json',status);print(json.dumps(status))
raise SystemExit(0 if not failure and before==after and status['actualTests']==status['pass']==28 else 1)
