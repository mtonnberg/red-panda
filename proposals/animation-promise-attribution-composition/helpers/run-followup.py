from pathlib import Path
import hashlib,json,os,signal,subprocess,time,re,resource
root=Path(__file__).resolve().parent.parent;out=root/'evidence/followup-r1';out.mkdir(exist_ok=False);start=time.monotonic();admin=240;reserve=8
sdks=[('24.22.1',Path('/workspace/shared/rea-tools/node_modules/node/bin/node')),('24.19.0',Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node')),('26.13.0',Path('/workspace/shared/node26/node_modules/node/bin/node'))]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def guard():
 values={}
 for top in ['src','test','oracle','scripts','bin','helpers','native','node_modules']:
  for p in(root/top).rglob('*'):
   if p.is_file()and'__pycache__'not in p.parts:values[str(p.relative_to(root))]=sha(p)
 for n in ['package.json','package-lock.json']:values[n]=sha(root/n)
 for version,node in sdks:values['sdk/'+version]=sha(node)
 values['firstStageStatus']=sha(root/'handoff/first-r1/evidence/first-r1/status.json');return values
signal.signal(signal.SIGTERM,lambda *_:(_ for _ in()).throw(InterruptedError('Controller interrupted')))
def no_core():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
before=guard();(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n');steps=[];failure=None
try:
 for version,node in sdks:
  # Node24.22 reviewed4 are already proven in firstStage, so run only original28.
  files=['animations','window-lifecycle-timers','animations-allocation','animation-task-owner']+([]if version=='24.22.1'else['animation-checkpoint-composition'])
  expected=28 if version=='24.22.1'else 32
  remaining=admin-(time.monotonic()-start)-reserve
  if remaining<=0:raise RuntimeError('No admin allowance remains')
  command=[str(node),'--experimental-vm-modules','--test','--test-concurrency=1',*['test/'+f+'.test.js'for f in files]]
  env=dict(os.environ,ANIMATION_CONTEXT_EVIDENCE=str(out/('allocation-'+version+'.json')),RED_PANDA_WINDOW_TASK_PROOF=str(out/('window-'+version+'.json')),ANIMATION_WATCHDOG_EVIDENCE=str(out/('watchdog-'+version)),ANIMATION_COMPOSITION_FLAGS=str(out/('flags-'+version+'.json')))
  prior=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]))
  for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[prior,'127.0.0.1,localhost,::1,[::1],0.0.0.0']))
  begin=time.monotonic()
  with(out/(version+'.stdout')).open('xb')as stdout,(out/(version+'.stderr')).open('xb')as stderr:
   child=subprocess.Popen(command,cwd=root,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=no_core);row={'sdk':version,'command':command,'ownedProcessGroup':child.pid,'watchdogSeconds':min(75,remaining),'expected':expected}
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
   text=(out/(version+'.stdout')).read_text()+(out/(version+'.stderr')).read_text()
   counts={key:re.findall(r'\b'+key+r' (\d+)',text)for key in ['tests','pass','fail']}
   row['counts']={key:int(values[-1])if values else None for key,values in counts.items()}
   (out/'steps.json').write_text(json.dumps(steps,indent=2)+'\n');print(json.dumps(row),flush=True)
   if row['exit']or row.get('controllerError')or not row['groupGone']or row['counts']!={'tests':expected,'pass':expected,'fail':0}:raise RuntimeError(version+' failed; stop/preserve before correction')
except BaseException as error:failure={'type':type(error).__name__,'message':str(error)}
after=guard();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'steps':steps,'failure':failure,'stable':before==after,'inputs':len(before),'seconds':time.monotonic()-start,'adminSeconds':admin,'actualExpectedNext':92,'positiveCombinedWithPriorFour':96,'boundary':'Same isolated92a6+R2+R3 source/budgets. Original28 on24.22;32 on each remaining SDK. No Native7/Node24reviewed4/originalRejected4/external-negative rerun. Canonicalproxy/CA/env preserved; only loopback bypass aliases and evidence paths appended. No Root edits/builds/full acceptance.'}
(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if failure is None and before==after and len(steps)==3 else 1)
