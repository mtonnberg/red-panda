from pathlib import Path
import argparse,json,hashlib,subprocess,time,signal,os,socket
r=Path(__file__).resolve().parent;p=argparse.ArgumentParser();p.add_argument('--epoch',required=True);p.add_argument('--overall-resource-seconds',type=float,default=3600);a=p.parse_args();assert a.epoch and all(c.isalnum()or c in '-_'for c in a.epoch);assert a.overall_resource_seconds>=60
manifest=json.loads((r/'candidate-frozen.json').read_text());plan=json.loads((r/'plan.json').read_text());map=json.loads((r/'maps/registration-map.json').read_text());adapter=json.loads((r/'harness/adapter.json').read_text());assert len(map['fixtures'])==455 and len(map['profiles'])==8;out=r/'runs'/a.epoch;out.mkdir(parents=True,exist_ok=False);(out/'reports').mkdir();(out/'logs').mkdir();node=manifest['node']['path'];candidate=r/'candidate';source=Path(map['sourceRoot']);fixture_root=r/'fixtures/adapted';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();started=time.monotonic();stopping=False;current=None
# Source/API/heap/VM budgets reside in the unmodified application and original
# registration profile. Only this separately reported resource watchdog is ours.
def stop(signum,_frame):
 global stopping
 stopping=True;print(json.dumps({'stopRequested':signum,'action':'finish/checkpoint owned current row; no automatic replay'}),flush=True)
for value in [signal.SIGINT,signal.SIGTERM]:signal.signal(value,stop)
extraControlFiles=[Path(__file__),r/'census-controller-stop-policy.json',r/'candidate-frozen.json'];extraControlExpected={str(p):sha(p)for p in extraControlFiles}
def verify():
 graph={name:sha(Path(name))for name in manifest['graphSHA256']};contracts={name:sha(source/name)for name in manifest['pinnedContractSourceSHA256']};return{'graph':graph,'contracts':contracts,'graphUnchanged':graph==manifest['graphSHA256'],'contractsUnchanged':contracts==manifest['pinnedContractSourceSHA256'],'extraControlSHA256':{str(p):sha(p)for p in extraControlFiles},'extraControlUnchanged':all(sha(p)==extraControlExpected[str(p)]for p in extraControlFiles)}
def probe_ports():
 rows=[]
 for port in [9582,9584]:
  with socket.socket()as s:s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('0.0.0.0',port));s.listen(1);rows.append({'port':port,'bindListenClose':True})
 return rows
before=verify();(out/'before.json').write_text(json.dumps(before,indent=2)+'\n');assert before['graphUnchanged']and before['contractsUnchanged']and before['extraControlUnchanged'],'Frozen graph drift; no runtime measurement allowed';ports=probe_ports();env=dict(os.environ,NODE_USE_ENV_PROXY='1');env['PATH']=str(Path(node).parent)+':'+env.get('PATH','');prior=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]));aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[prior,aliases]))for key in ['NO_PROXY','no_proxy']});version=subprocess.run([node,'--version'],capture_output=True,text=True,env=env,check=True,timeout=5).stdout.strip();assert version=='v24.22.1',version
matrix={'schemaVersion':1,'scope':'Adapted455 external conformance with actual RedPanda branding; not unchanged strict Native fullPASS','productionCommit':manifest['productionCommit'],'historicalCandidateNotRewritten':plan['historicalCandidate'],'registrationMapSHA256':manifest['registrationMapSHA256'],'runnerEligibilityAdapter':adapter,'runnerGlobalArgs':plan['runnerGlobalArgs'],'sourceLoadBudgetMs':2000,'settleMs':0,'nodeVersion':version,'canonicalPortsBefore':ports,'concurrency':1,'plannedRows':455,'completedRows':0,'verifiedAdaptedHarnessPasses':0,'rawCounts':{'passed':0,'failed':0,'timeout':0,'unobserved':0,'runnerError':0},'results':[],'complete':False,'stopReason':None,'controllerPolicy':'v2: preserve ordinary assertion/source-budget nonpasses; stop actual setup/guard/administrative-resource failure','strictUnchangedNativePasses':'NOT MEASURED; external eligibility adapter disclosed'}
def checkpoint():
 temp=out/'matrix.partial.json';temp.write_text(json.dumps(matrix,indent=2)+'\n');temp.replace(out/'matrix.json')
def terminate(child):
 try:os.killpg(child.pid,signal.SIGTERM)
 except ProcessLookupError:pass
 try:child.wait(timeout=2)
 except subprocess.TimeoutExpired:
  try:os.killpg(child.pid,signal.SIGKILL)
  except ProcessLookupError:pass
  child.wait()
checkpoint()
try:
 for index,fixture in enumerate(map['fixtures']):
  if stopping or time.monotonic()-started>=a.overall_resource_seconds:break
  profile=next(p for p in map['profiles']if p['id']==fixture['profile']);stem=f'{index:03d}-'+fixture['path'].replace('/','__');report=out/'reports'/(stem+'.json');command=[node,str(r/'harness/scripts/conformance.mjs'),'--root',str(fixture_root),'--binary',str(candidate/'red-panda-launcher'),'--isolate','--fixture-profile','upstream','--source-load-contract','--websocket-port','9584','--registration-map',str(r/'maps/registration-map.json'),'--runner-global-arg=--ws-max-concurrent','--runner-global-arg=50','--port','9582','--test',fixture['path'],'--report',str(report)];rowstart=time.monotonic();resource_ms=profile['sourceTimeoutMs']+2000+15000;deadline_hit=False
  with(out/'logs'/(stem+'.stdout')).open('xb')as stdout,(out/'logs'/(stem+'.stderr')).open('xb')as stderr:
   current=subprocess.Popen(command,cwd=candidate,env=env,stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,start_new_session=True)
   try:current.wait(timeout=min(resource_ms/1000,max(.001,a.overall_resource_seconds-(time.monotonic()-started))))
   except subprocess.TimeoutExpired:deadline_hit=True;terminate(current)
  raw=None;report_error=None
  try:raw=json.loads(report.read_text())
  except(Exception)as error:report_error=str(error)
  result=raw.get('results',[None])[0]if raw and len(raw.get('results',[]))==1 else None;status=result.get('status','runnerError')if result else'runnerError';integrity={}
  if result:
   config=result.get('configuration',{});load=result.get('sourceLoadContract')or{};integrity={'singleResult':len(raw['results'])==1,'fixtureSHA256':result.get('sha256')==fixture['sha256'],'profileId':(result.get('sourceProfile')or{}).get('id')==profile['id'],'exactProfileArgs':config.get('fixtureBrowserArgs')==profile['nativeResourceAndFeatureArgs'],'global50':config.get('runnerGlobalArgs')==['--ws-max-concurrent','50'],'sourceAssertionBudget':config.get('fixtureBudgetMs')==profile['sourceTimeoutMs']and config.get('budgetKind')=='source-registration-load-then-assert','sourceLoadBudget':(load.get('loadBudgetMs')==2000 and load.get('assertionBudgetMs')==profile['sourceTimeoutMs'])if result.get('phase')!='browser-setup'else None,'actualLauncher':(raw.get('binary')or{}).get('sha256')==manifest['launcher']['SHA256'],'actualServedHarness':raw.get('sourceHarnessSHA256')==adapter['adaptedSHA256'],'originalHarnessDisclosed':raw.get('originalSourceHarnessSHA256')==adapter['originalSHA256']and raw.get('harnessSourceUnchanged')is False,'noPublicUAOverride':raw.get('publicUserAgentOverrideApplied')is False and raw.get('publicClientHintsOverrideApplied')is False,'zeroSettle':raw.get('settleDelayMs')==0,'loadBeforeAnyPass':status!='passed'or(bool((load.get('loadBarrier')or{}).get('observed'))and load.get('assertionStartedAfterLoad')is True),'realNonzeroNativePolicyPass':status!='passed'or(result.get('harnessObserved')is True and result.get('nativeHarnessBranch')is True and result.get('nonzeroObservationsEnforced')is True)}
  verified=status=='passed'and not deadline_hit and bool(integrity)and all(value is not False for value in integrity.values());tags=[]
  if deadline_hit:tags.append('owned-resource-watchdog; not a source assertion result/crash inference')
  if not result:tags.append('report-unavailable-or-invalid')
  elif result.get('phase')=='browser-setup':tags.append('browser-setup-failure')
  elif status=='timeout':tags.append('source-load-timeout'if result.get('executionPhase')=='source-load'else'actual-timeout')
  elif status=='failed':tags.append('observed-assertion-failure'if result.get('harnessObserved')else'failure-before-harness-observation')
  elif status=='unobserved':tags.append('actual-unobserved')
  if integrity and not all(value is not False for value in integrity.values()):tags.append('report-integrity-gap; never promoted to verified pass')
  branding={'policy':'Keep actual RedPanda UA/clientHints; no exemption or status promotion','literalExpectationsRemainUnchanged':True,'laterUnexecutedAssertionsVerified':False}if fixture['path']=='navigator/navigator.html'else None
  row={'index':index,'path':fixture['path'],'fixtureSHA256':fixture['sha256'],'profile':profile,'rawStatus':status,'verifiedAdaptedHarnessPass':verified,'tags':tags,'brandingPolicyNote':branding,'durationMs':round((time.monotonic()-rowstart)*1000,3),'controller':{'pid':current.pid,'exitCode':current.returncode,'command':command,'administrativeDeadlineMs':resource_ms,'deadlineHit':deadline_hit},'reportError':report_error,'integrity':integrity,'result':result};matrix['results'].append(row);matrix['completedRows']+=1;matrix['rawCounts'][status]+=1;matrix['verifiedAdaptedHarnessPasses']+=int(verified);checkpoint();current=None
  reason=None
  if deadline_hit:reason='administrative-resource-watchdog'
  elif not result:reason='validation-report-unavailable-or-invalid'
  elif result.get('phase')=='browser-setup'or result.get('executionPhase')=='automation-setup':reason='browser-or-automation-setup-failure'
  elif integrity and any(value is False for value in integrity.values()):reason='source-report-integrity-guard-failure'
  elif not all(sha(p)==extraControlExpected[str(p)]for p in extraControlFiles):reason='controller-policy-or-manifest-guard-failure'
  if reason:
   matrix['stopReason']={'reason':reason,'row':index,'path':fixture['path'],'rawStatusPreserved':status};checkpoint();print(json.dumps({'stopped':matrix['stopReason'],'remainingUnrun':455-matrix['completedRows']}),flush=True);break
  if(index+1)%10==0 or status!='passed':print(json.dumps({'completed':index+1,'selected':455,'path':fixture['path'],'rawStatus':status,'verifiedAdaptedPass':verified,'counts':matrix['rawCounts']}),flush=True)
 matrix['complete']=matrix['completedRows']==455;matrix['remainingUnrun']=455-matrix['completedRows']
finally:
 if current is not None and current.poll()is None:terminate(current)
 after=verify();(out/'after.json').write_text(json.dumps(after,indent=2)+'\n');matrix['afterGraphUnchanged']=after['graphUnchanged'];matrix['afterContractsUnchanged']=after['contractsUnchanged'];matrix['wallSeconds']=round(time.monotonic()-started,3);matrix['extraControlUnchanged']=after['extraControlUnchanged']
 if not after['graphUnchanged']or not after['contractsUnchanged']or not after['extraControlUnchanged']:matrix['finalGuardFailure']=True
 try:matrix['canonicalPortsAfter']=probe_ports()
 except OSError as error:matrix['ownedPortReleaseFailure']={'type':type(error).__name__,'message':str(error)}
 checkpoint();print(json.dumps({'complete':matrix['complete'],'completedRows':matrix['completedRows'],'verifiedAdaptedHarnessPasses':matrix['verifiedAdaptedHarnessPasses'],'rawCounts':matrix['rawCounts'],'graphUnchanged':matrix['afterGraphUnchanged'],'contractsUnchanged':matrix['afterContractsUnchanged'],'seconds':matrix['wallSeconds']}),flush=True)
