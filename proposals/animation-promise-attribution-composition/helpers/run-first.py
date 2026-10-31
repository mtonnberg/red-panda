from pathlib import Path
import hashlib,json,os,signal,subprocess,time,re,resource
root=Path(__file__).resolve().parent.parent;e=root/'evidence';out=e/'first-r1';out.mkdir(exist_ok=False)
node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');native=Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux');source=Path('/workspace/red-panda/proposals/animation-scheduling-recovery');start=time.monotonic();admin=100;reserve=5
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
references={'events':source/'private-owner-validation-r1/Native-event-producers.json','reactions':source/'native-causal-r2/Native.json','timing':source/'timing-r1/Native.json'}
def guard():
 values={}
 for top in ['src','test','oracle','scripts','bin','helpers','native','node_modules']:
  for p in(root/top).rglob('*'):
   if p.is_file()and'__pycache__'not in p.parts:values[str(p.relative_to(root))]=sha(p)
 for p in(root/'original-r3/test').rglob('*'):
  if p.is_file():values[str(p.relative_to(root))]=sha(p)
 for n in ['package.json','package-lock.json']:values[n]=sha(root/n)
 for label,p in references.items():values['Native-reference/'+label]=sha(p)
 values['sdk/24.22.1']=sha(node);values['unusedNativeBinaryIdentity']=sha(native);return values
signal.signal(signal.SIGTERM,lambda *_:(_ for _ in()).throw(InterruptedError('Controller interrupted')))
def no_core():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
steps=[]
def run(label,args,cwd=root,extra=None,cap=25):
 remaining=admin-(time.monotonic()-start)-reserve
 if remaining<=0:raise RuntimeError('No admin allowance remains')
 env=dict(os.environ)
 prior=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]))
 for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[prior,'127.0.0.1,localhost,::1,[::1],0.0.0.0']))
 if extra:env.update(extra)
 begin=time.monotonic();command=[str(node),'--experimental-vm-modules',*args]
 with(out/(label+'.stdout')).open('xb')as stdout,(out/(label+'.stderr')).open('xb')as stderr:
  child=subprocess.Popen(command,cwd=cwd,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=no_core)
  row={'label':label,'command':command,'cwd':str(cwd),'ownedProcessGroup':child.pid,'watchdogSeconds':min(cap,remaining)}
  try:row['exit']=child.wait(timeout=row['watchdogSeconds'])
  except BaseException as error:
   row['controllerError']=repr(error)
   for sig in [signal.SIGTERM,signal.SIGKILL]:
    try:os.killpg(child.pid,sig)
    except ProcessLookupError:pass
    if sig==signal.SIGTERM:
     try:child.wait(timeout=.25)
     except subprocess.TimeoutExpired:pass
   row['exit']=child.wait()
  try:os.killpg(child.pid,0);row['groupGone']=False
  except ProcessLookupError:row['groupGone']=True
  if not row['groupGone']:
   for sig in [signal.SIGTERM,signal.SIGKILL]:
    try:os.killpg(child.pid,sig)
    except ProcessLookupError:pass
  row['seconds']=time.monotonic()-begin;steps.append(row)
  (out/'steps.json').write_text(json.dumps(steps,indent=2)+'\n');print(json.dumps(row),flush=True)
  if row.get('controllerError')or not row['groupGone']:raise RuntimeError(label+' watchdog/cleanup failure')
 return row

def logs(label):return(out/(label+'.stdout')).read_text()+(out/(label+'.stderr')).read_text()
def must_zero(row):
 if row['exit']!=0:raise RuntimeError(row['label']+' failed; preserve before any correction')
def reports(label):
 values=[]
 for line in(out/(label+'.stdout')).read_text().splitlines():
  try:values.append(json.loads(line))
  except json.JSONDecodeError:pass
 return values
before=guard();(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n');failure=None
try:
 # Same finite source and original10s/15s budgets, genuine actual V8 forwarding.
 for kind in ['events','reactions','timing']:
  row=run('finite-'+kind,['helpers/finite-probe.mjs','candidate',kind,str(out/(kind+'.json'))],cap=20);must_zero(row)
  c=json.loads((out/(kind+'.json')).read_text());n=json.loads(references[kind].read_text());assert not c.get('error')
  if kind=='events':expected=n['rows'][0]['result']['result']['value'];actual=c['rows'][0]['result']['result']['value'];assert c['rows'][0]['sourceSHA256']==n['rows'][0]['sourceSHA256'];comparison={'Native':expected,'candidate':actual,'wholeObjectEqual':expected==actual,'objects':3};assert expected==actual
  elif kind=='reactions':expected=n['result']['result']['value'];actual=c['rows'][0]['result']['result']['value'];assert c['rows'][0]['sourceSHA256']==n['sourceSHA256'];comparison={'Native':expected,'candidate':actual,'wholeObjectEqual':expected==actual,'objects':4};assert expected==actual
  else:
   def project(v):return{'mode':v['mode'],'blockMS':v['blockMS'],'state':v['state'],'finishEvents':v['finishEvents'],'cancelEvents':v['cancelEvents'],'firstState':next(x['state']for x in v['events']if x['name']=='first-before'),'middleStates':[x['state']for x in v['events']if x['name']=='middle']}
   assert c['templateSHA256']==n['templateSHA256'];rows=[]
   for a,b in zip(n['rows'],c['rows']):
    assert a['expressionSHA256']==b['sourceSHA256']
    for x,y in zip(a['result']['result']['value'],b['result']['result']['value']):rows.append({'Native':project(x),'candidate':project(y),'equal':project(x)==project(y)})
   comparison={'scope':'Original declared causal projection only; raw clocks retained','rows':rows};assert len(rows)==6 and all(x['equal']for x in rows)
  (out/(kind+'-comparison.json')).write_text(json.dumps(comparison,indent=2)+'\n')
 # Original R3 assertions/budgets with only explicit accepted teardown restoration.
 row=run('cleanup-variant-four',['--test','--test-concurrency=1','test/animation-checkpoint-composition.test.js'],extra={'ANIMATION_WATCHDOG_EVIDENCE':str(out/'original-watchdog'),'ANIMATION_COMPOSITION_FLAGS':str(out/'actual-flags.json')},cap=40);must_zero(row)
 text=logs(row['label']);counts={key:int(re.findall(r'\b'+key+r' (\d+)',text)[-1])for key in ['tests','pass','fail']};row['counts']=counts;assert counts=={'tests':4,'pass':4,'fail':0}
 # Separate instrumented children prove the actual Promise/context and flags.
 for phase in ['event','promise']:
  label='owned-'+phase;row=run(label,['test/fixtures/animation-checkpoint-watchdog.mjs',phase],cap=7);must_zero(row)
  report=next(v for v in reversed(reports(label))if v.get('phase')==phase and'futureOrder'in v)
  assert report['entered']and report['recovered']and report['disposed']and report['effectiveTimeout']==200 and report['futureOrder']==['promise','event']
  assert any(call.get('result',{}).get('ran')for call in report['actualCheckpointCalls'])
  if phase=='promise':assert report['promiseOwnership']=={'before':{'genuine':True,'VM':True,'Host':False},'after':{'VM':True,'Host':False}}
 # Deliberate real embedding init hooks. Never disabled; failure remains raw.
 for kind,phase in [('external-init','event'),('external-init','promise'),('legacy-host','promise')]:
  preload='helpers/external-init-hook.mjs'if kind=='external-init'else'helpers/legacy-host-installer.mjs';label=kind+'-'+phase
  row=run(label,['--import',str(root/preload),'test/fixtures/animation-checkpoint-watchdog.mjs',phase],cap=7)
  if phase=='event':must_zero(row);row['classification']='Finite/init-hook event interruption control actually recovered'
  else:
   text=logs(label);assert row['exit']==1 and'async hook stack has become corrupted'in text
   assert any(v.get('marker')=='armed'for v in reports(label));row['classification']='Observed unsupported init-hook Promise interruption; fatal outcome retained, not ordinary-runtime acceptance'
 # Exact immutable original4 remains a separate diagnostic, including its known
 # post-proof poisoned-teardown gap. Never convert arbitrary failures to passes.
 row=run('original-r3-four',['--test','--test-concurrency=1','test/animation-task-owner.test.js'],cwd=root/'original-r3',cap=40)
 text=logs(row['label']);row['classification']='Exact original R3 diagnostic; raw exit/assertions/late activity retained'
 if row['exit']!=0:
  assert'authored timer replacement'in text and'async hook stack has become corrupted'not in text
  row['classification']='Exact original R3 rejected by retained authored-timer teardown; not promoted to passing original tests'
except BaseException as error:failure={'type':type(error).__name__,'message':str(error)}
after=guard();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');(out/'steps.json').write_text(json.dumps(steps,indent=2)+'\n')
status={'steps':steps,'failure':failure,'stable':before==after,'inputs':len(before),'seconds':time.monotonic()-start,'adminSeconds':admin,'positiveTestsExpected':4,'baseline28':'Not repeated in this first-stage command; queued only after first-stage evidence/review','boundary':'Independent92a6+exactR2+R3 animation leaf. Native7 whole objects/timing6 projections and raw flags; original budgets/real200ms/infinite reactions. External/legacy init hooks remain enabled and unsupported. No Root edit/build/full-runtime claim.'}
(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if failure is None and before==after else 1)
