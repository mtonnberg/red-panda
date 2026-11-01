#!/usr/bin/env python3
"""Reusable frozen-spec skeleton. No default candidate; no JS until explicit run."""
from pathlib import Path
import argparse,hashlib,json,os,re,resource,signal,subprocess,time

P=Path(__file__).parent;ROOT=Path('/workspace/red-panda');SERVICE=878425
NODE_SHA='e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb'
CPP95='95bba30f4013139999dc9b843b45bdb5ddc1802145431fc6386bddc85975cd36'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def require(ok,message):
 if not ok:raise RuntimeError(message)
def load(path):return json.loads(Path(path).read_text())
def readmap(descriptor):
 path=Path(descriptor['path']);require(sha(path)==descriptor['SHA256'],'Map descriptor drift: '+str(path));value=load(path)
 for part in descriptor.get('keyPath',[]):value=value[part]
 require(isinstance(value,dict)and value and all(isinstance(k,str)and isinstance(v,str)and re.fullmatch('[0-9a-f]{64}',v)for k,v in value.items()),'Expected explicit nonempty full-SHA map')
 base=Path(descriptor['base']);return {str(base/name):value for name,value in value.items()}
def verify(table):
 bad=[n for n,h in table.items()if not Path(n).is_file()or sha(n)!=h]
 require(not bad,'Frozen input mismatch: '+str(bad));return len(table)
def inventory(base,scopes):
 paths=set()
 for name in scopes:
  path=base/name;require(path.exists(),'Inventory scope missing '+str(path));require(not path.is_symlink(),'Inventory scope itself must be physical: '+str(path))
  if path.is_dir():
   for file in path.rglob('*'):
    require(not file.is_symlink(),'Unfrozen symlink inside guarded source scope: '+str(file))
    if file.is_file():paths.add(str(file))
  else:paths.add(str(path))
 return paths
def proc(pid,required=False):
 try:
  text=(Path('/proc')/str(pid)/'stat').read_text();f=text[text.rfind(')')+2:].split();return {'pid':int(pid),'state':f[0],'parent':int(f[1]),'pgrp':int(f[2]),'sid':int(f[3]),'startTicks':int(f[19])}
 except(FileNotFoundError,ProcessLookupError):return None
 except(OSError,ValueError,IndexError)as error:
  if required:raise RuntimeError('Cannot verify owned process identity: '+str(pid))from error
  return None
def track(child,owned):
 rows=[]
 for file in Path('/proc').iterdir():
  if file.name.isdecimal()and(row:=proc(file.name)):rows.append(row)
 changed=True
 while changed:
  changed=False;parents={pid for(pid,start),record in owned.items()if(current:=proc(pid,True))and current['startTicks']==start}
  for row in rows:
   if row['pgrp']==child.pid or row['sid']==child.pid or row['parent']in parents:
    require(row['pid']!=SERVICE,'Excluded production service entered job ownership; refuse signalling')
    key=(row['pid'],row['startTicks'])
    if key not in owned:owned[key]=row;changed=True
 live=[]
 for(pid,start),record in owned.items():
  now=proc(pid,True)
  if now and now['startTicks']==start:live.append(now)
 return live
def cleanup(child,owned):
 before=track(child,owned)
 for sig,seconds in [(signal.SIGTERM,2),(signal.SIGKILL,3)]:
  for row in track(child,owned):
   require(row['pid']!=SERVICE,'Never signal excluded main service')
   if row['state']!='Z':
    now=proc(row['pid'],True)
    if now and now['startTicks']==row['startTicks']:
     try:os.kill(row['pid'],sig)
     except ProcessLookupError:pass
  end=time.monotonic()+seconds
  while time.monotonic()<end and any(r['state']!='Z'for r in track(child,owned)):time.sleep(.02)
  if not any(r['state']!='Z'for r in track(child,owned)):break
 child.wait(timeout=3);after=track(child,owned);return {'before':before,'observed':list(owned.values()),'after':after,'liveRemaining':[r for r in after if r['state']!='Z']}

parser=argparse.ArgumentParser();parser.add_argument('--execute-after-parent-review',action='store_true');args=parser.parse_args();require(args.execute_after_parent_review,'Explicit Parent runtime lease required: static preparation is not execution authorization')
D=Path(__file__).parent.parent;planPath=D/'plan-r1.json';require(sha(planPath)=='3bcffe4837e1da1b14f4da5fd9ff29f6b118e06b973a03c8e4e282dd697b9623','Reviewed plan differs');plan=load(planPath);sourcePath=D/'contracts/source-r1.json';externalPath=D/'contracts/external-r1.json';require(sha(sourcePath)==plan['sourceMapSHA256']and sha(externalPath)==plan['externalMapSHA256'],'Source/dependency map differs');source=load(sourcePath);external=load(externalPath);selfSHA=sha(__file__);node=Path(plan['stockNode']['path']);require(plan['stockNode']['SHA256']==NODE_SHA and sha(node)==NODE_SHA,'Actual stock24 required');scopes=source['engineScopes']
def guards():
 require(sha(__file__)==selfSHA and sha(planPath)=='3bcffe4837e1da1b14f4da5fd9ff29f6b118e06b973a03c8e4e282dd697b9623','Controller/plan drift');require(sha(sourcePath)==plan['sourceMapSHA256']and sha(externalPath)==plan['externalMapSHA256'],'Map drift');counts={'external':verify(external)}
 for label,base,key in [('Root',ROOT,'RootInstalled654'),('uninstrumented',D/'uninstrumented654','uninstrumented654'),('diagnostic',D/'diagnostic','diagnostic655')]:
  table={str(base/n):v for n,v in source[key].items()};counts[label]=verify(table);require(inventory(base,scopes)==set(table),'Actual source inventory drift '+label)
 table={str(D/'harness'/n):v['after']for n,v in source['harness'].items()};counts['harness']=verify(table);actual={str(p)for p in(D/'harness').rglob('*')if p.is_file()and'node_modules'not in p.parts};require(actual==set(table),'Harness inventory drift')
 table={str(D/'fixtures'/n):v for n,v in source['fixtures'].items()};counts['fixtures']=verify(table);require({str(p)for p in(D/'fixtures').rglob('*')if p.is_file()}==set(table),'Selected fixture/support inventory drift')
 require(sha(D/'diagnostic-browser')==plan['launcherSHA256'],'Launcher drift');require(sha(D/'evidence/instrumentation-engine-r1.patch')==plan['enginePatchSHA256']and sha(D/'evidence/instrumentation-harness-r1.patch')==plan['harnessPatchSHA256'],'Instrumentation patch drift');require(len(source['native18'])==18 and sha(ROOT/'native/runtime.cc')==CPP95==source['CPP95'],'Native95 source drift')
 for n,v in source['native18'].items():require(sha(ROOT/n)==sha(D/'diagnostic'/n)==sha(D/'uninstrumented654'/n)==v,'Native18 drift '+n)
 return counts
def listeners(ports):
 result=[]
 for kind in ['tcp','tcp6']:
  for text in(Path('/proc/net')/kind).read_text().splitlines()[1:]:
   f=text.split();port=int(f[1].split(':')[1],16)
   if f[3]=='0A'and port in ports:result.append({'kind':kind,'port':port,'inode':f[9]})
 return result
require(proc(SERVICE,True)['startTicks']==11224137,'Excluded actual main changed; freeze a new derivative');guards();out=D/'run-diagnostic-r1';require(not out.exists(),'Fresh output required');require(not listeners({9582,9584}),'Canonical port listener already exists; never stop an unrelated listener');out.mkdir();traces=out/'traces';traces.mkdir();started=time.monotonic();status={'state':'RUNNING_DIAGNOSTIC_ONLY','commands':[],'aggregateSeconds':90,'rowAdminSeconds':19,'source2000FreshAssertion2000Unchanged':True,'RootFullAcceptanceNotClaimed':True,'mainBefore':proc(SERVICE),'controllerSHA256':selfSHA,'planSHA256':sha(planPath),'sourceSHA256':sha(sourcePath),'canonicalPortCheckBefore':[]};child=None;owned={}
def run(label,command,limit):
 global child,owned
 guards();owned={};env=os.environ.copy();require(env.get('NODE_OPTIONS','')=='','Unexpected inherited Node options');env['RED_PANDA_STYLE_DIAGNOSTIC_DIR']=str(traces);env['NODE_USE_ENV_PROXY']='1';env['RED_PANDA_RUNTIME_ADDON']=str(D/'diagnostic/native/build/linux-x64/node-24.22.1/runtime.node');env.pop('RED_PANDA_COLLECTIONS_ADDON',None);env.pop('RED_PANDA_HEAP_ADDON',None)
 for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[env.get(key,''),'0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]']))
 row={'label':label,'command':command,'commandAdminSeconds':limit};status['commands'].append(row)
 with(out/(label+'.stdout')).open('xb')as stdout,(out/(label+'.stderr')).open('xb')as stderr:
  def limits():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
  child=subprocess.Popen(command,cwd=D,env=env,stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=limits);initial=proc(child.pid,True);require(initial and initial['pgrp']==child.pid and initial['sid']==child.pid,'Actual owned group missing');owned[(initial['pid'],initial['startTicks'])]=initial;row['initialIdentity']=initial;begin=time.monotonic()
  while child.poll()is None:
   track(child,owned)
   if time.monotonic()-begin>=limit or time.monotonic()-started>=90:row['deadlineHit']=True;break
   time.sleep(.025)
  row['liveAfterExitBeforeCleanup']=[r for r in track(child,owned)if r['state']!='Z']if child.poll()is not None else None;row['cleanup']=cleanup(child,owned);row['exit']=child.returncode
 require(not row.get('deadlineHit')and not row['cleanup']['liveRemaining']and not row['liveAfterExitBeforeCleanup'],'Actual deadline/owned lifetime failure')
 if label.startswith('syntax-'):require(row['exit']==0,'Actual syntax failure; source row remains UNRUN')
 else:require(row['exit']in[0,1],'Actual setup/controller exit; no invented Source result')
 row['guardCounts']=guards();child=None;return row
try:
 for index,file in enumerate(plan['syntaxFiles'],1):run('syntax-'+str(index),[str(node),'--check',file],7)
 row=run('source31',plan['rowCommand'],19);report=load(out/'report.json');require(len(report['results'])==1 and report['counts']['selected']==1,'Actual selected Source report missing');r=report['results'][0];status['actualSourceResult']=r;status['sourceCounts']=report['counts'];require(r['path']=='css/external_stylesheet.html'and r['sha256']==plan['selectedFixtureSHA256'],'Original Source fixture drift');require(r['sourceProfile']['id']=='b036c0edf592'and r['sourceProfile']['resources']==['stylesheet']and r['sourceProfile']['sourceTimeoutMs']==2000,'Original Source profile changed');require(r['sourceLoadContract']['loadBudgetMs']==2000 and r['sourceLoadContract']['assertionBudgetMs']==2000 and r['settleDelayMs']==0,'Original source budgets changed');require(report['sourceHarnessSHA256']==plan['adaptedHarnessSHA256']and not report['publicUserAgentOverrideApplied']and not report['publicClientHintsOverrideApplied']and report['target']['product'].startswith('RedPanda/'),'Adapter/actual product identity changed');require(row['exit']==(0 if r['status']=='passed'else 1),'Source nonpass exit/result mismatch')
 traceFiles=sorted(traces.glob('trace-*.ndjson'));require(traceFiles,'Actual diagnostic trace missing');summary=[];clockKinds=set()
 for file in traceFiles:
  require(file.stat().st_size<=1048576,'Trace byte bound exceeded');events=[json.loads(s)for s in file.read_text().splitlines()];require(events and len(events)<=3000 and events[0]['kind']=='logger-start','Trace startup/event bound missing');last=-1;spans={};lastSequence=0
  for event in events:
   require(event['schema']=='host-style-clock/v1'and event['sequence']==lastSequence+1,'Trace schema/sequence gap');lastSequence=event['sequence'];now=int(event['monotonicNS']);require(now>=last,'Host monotonic order failed');last=now
   if event['kind']=='enter':spans[event['span']]=event
   elif event['kind']=='leave':require(event['span']in spans,'Trace invented/unmatched span exit');spans.pop(event['span'])
   clockKinds.add(event.get('name',event['kind']))
  summary.append({'file':str(file.relative_to(out)),'SHA256':sha(file),'events':len(events),'bytes':file.stat().st_size,'pid':events[0]['pid'],'threadId':events[0]['threadId'],'openSpansAtObservedEnd':list(spans.values()),'processExitObservationPresent':any(e['kind']=='process-exit-observation'for e in events)})
 status['traceSummary']=summary;status['actualTraceNames']=sorted(clockKinds);raw='\n'.join(p.read_text()for p in[out/'source31.stdout',out/'source31.stderr']);require('STYLE_DIAGNOSTIC_WRITER_FAILED'not in raw and 'STYLE_DIAGNOSTIC_WRITER_FAILED'not in r.get('ownedBrowser',{}).get('stderr',''),'Diagnostic writer failed/bounded out; measurement invalid')
 require('driver.sourceLoadStart'in clockKinds and ('driver.loadBarrierMissing'in clockKinds or 'driver.loadBarrierObserved'in clockKinds),'Actual source barrier trace absent');require(any(v['pid']==r['ownedBrowser']['pid']for v in summary),'Actual browser trace absent');status['state']='DIAGNOSTIC_COMPLETE_SOURCE_PASS_INSTRUMENTED_ONLY'if r['status']=='passed'else'DIAGNOSTIC_COMPLETE_SOURCE_NONPASS';status['functionalPatchOrUninstrumentedAcceptanceClaimed']=False
except Exception as error:status['state']='FAILED_OR_INCOMPLETE_DIAGNOSTIC';status['failure']={'type':type(error).__name__,'message':str(error)}
finally:
 if child:
  try:status['exceptionalCleanup']=cleanup(child,owned)
  except Exception as error:status['state']='OWNED_CLEANUP_FAILURE';status['cleanupFailure']=str(error)
 status['secondsIncludingCleanup']=time.monotonic()-started;status['mainAfter']=proc(SERVICE);ports={9582,9584}
 if'report'in locals():ports.update(int(v)for v in re.findall(r'listening on 127\.0\.0\.1:(\d+)',r.get('ownedBrowser',{}).get('stderr','')))
 status['checkedPorts']=sorted(ports);status['listenersAfter']=listeners(ports)
 try:
  status['guardCounts']=guards();require(not status['listenersAfter'],'Owned fixture/server port still listening');require(status['mainBefore']==status['mainAfter'],'Excluded main identity changed')
 except Exception as error:status['state']='GUARD_OR_CLOSURE_FAILURE';status['guardFailure']=str(error)
 (out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status,indent=2),flush=True)
if status['state']!='DIAGNOSTIC_COMPLETE_SOURCE_PASS_INSTRUMENTED_ONLY':raise SystemExit(1)
