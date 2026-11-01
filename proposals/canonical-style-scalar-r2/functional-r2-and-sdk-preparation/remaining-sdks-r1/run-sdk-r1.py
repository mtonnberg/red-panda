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

parser=argparse.ArgumentParser();parser.add_argument('--execute-after-parent-review',action='store_true');parser.add_argument('--sdk',required=True,choices=['24.19','26.13']);args=parser.parse_args();require(args.execute_after_parent_review,'Explicit Parent runtime lease required for this single SDK')
D=Path(__file__).parent;B=Path('/workspace/shared/source31-canonical-scalar-r1');R2=D.parent;BASE=R2/'candidate';planPath=D/'plan-sdk-r1.json';PLAN_SHA='544815d5a52b47f964ca39ff3bed22e4a1ba541af02a25b023fce022b4c4d253';require(sha(planPath)==PLAN_SHA,'Reviewed plan differs');plan=load(planPath);spec=plan['SDKs'][args.sdk];sourcePath=Path(plan['sourceMap']['path']);externalPath=Path(plan['externalMap']['path']);priorPath=D/'contracts/prior-proof-r1.json';harnessPath=D/'contracts/source-harness-r1.json';require(sha(sourcePath)==plan['sourceMap']['SHA256']and sha(externalPath)==plan['externalMap']['SHA256']and sha(priorPath)==plan['priorProofMapSHA256']and sha(harnessPath)==plan['harnessMapSHA256'],'Frozen maps differ');source=load(sourcePath);external=load(externalPath);prior=load(priorPath);harness=load(harnessPath);selfSHA=sha(__file__);node=Path(spec['node']);require(sha(node)==spec['nodeSHA256'],'Actual selected stock SDK differs');scopes=source['engineScopes']
def guards():
 require(sha(__file__)==selfSHA and sha(planPath)==PLAN_SHA,'Controller/plan drift');require(sha(sourcePath)==plan['sourceMap']['SHA256']and sha(externalPath)==plan['externalMap']['SHA256']and sha(priorPath)==plan['priorProofMapSHA256']and sha(harnessPath)==plan['harnessMapSHA256'],'Map drift');counts={'external':verify(external),'priorProof':verify(prior),'sourceHarness':verify(harness)}
 for label,base,key in [('Root',ROOT,'RootInstalled654'),('R1',B/'candidate','R1Candidate655'),('R2',BASE,'R2Candidate655')]:
  table={str(base/n):h for n,h in source[key].items()};counts[label]=verify(table);require(inventory(base,scopes)==set(table),'Source inventory drift '+label)
  if label!='Root':counts[label+'Oracles']=verify({str(base/n):h for n,h in source['oracles'].items()})
 require(sha(R2/'handoff-r2/functional-with-corrected-tests.patch')==plan['combinedPatchSHA256']and sha(R2/'handoff-r2/receipt.json')==plan['handoffReceiptSHA256'],'Handoff drift');require(sha(spec['launcher'])==spec['launcherSHA256']and sha(spec['runtimeAddon'])==spec['runtimeAddonSHA256']and sha(node)==spec['nodeSHA256'],'Selected executable/artifact drift');require(len(source['native18'])==18 and sha(ROOT/'native/runtime.cc')==CPP95==source['CPP95'],'Native95 drift')
 for n,h in source['native18'].items():require(sha(ROOT/n)==sha(B/'candidate'/n)==sha(BASE/n)==h,'Native18 drift '+n)
 return counts
def listeners(ports):
 result=[]
 for kind in ['tcp','tcp6']:
  for text in(Path('/proc/net')/kind).read_text().splitlines()[1:]:
   f=text.split();port=int(f[1].split(':')[1],16)
   if f[3]=='0A'and port in ports:result.append({'kind':kind,'port':port,'inode':f[9]})
 return result
if args.sdk=='26.13':
 previous=load(D/'run-sdk-24.19/status.json');require(previous['state']=='PASS_SINGLE_CORRECTED_SDK'and previous['sdk']=='24.19'and previous['controllerSHA256']==selfSHA and previous['planSHA256']==PLAN_SHA,'Prior separately leased24.19 success required')
 require(previous['candidateSourceResult']['status']=='passed'and[(c['actualTAP']['pass'],c['actualTAP']['fail'])for c in previous['commands']if'actualTAP'in c]==[(5,0),(30,0)],'Prior SDK complete assertions missing')
require(proc(SERVICE,True)['startTicks']==11224137,'Excluded main changed; freeze derivative');guards();out=Path(spec['output']);require(not out.exists(),'Fresh output required');require(not listeners({9582,9584}),'Unrelated canonical listener: never stop it');out.mkdir();started=time.monotonic();status={'state':'RUNNING','sdk':args.sdk,'commands':[],'aggregateSeconds':90,'sourceLimits':plan['sourceLimits'],'mainBefore':proc(SERVICE),'controllerSHA256':selfSHA,'planSHA256':sha(planPath),'sourceSHA256':sha(sourcePath),'nodeSHA256':sha(node),'runtimeAddonSHA256':sha(spec['runtimeAddon'])};child=None;owned={};ports={9582,9584}
def run(label,command,limit,cwd,base):
 global child,owned
 guards();owned={};env=os.environ.copy();require(env.get('NODE_OPTIONS','')=='','Unexpected Node options');require('RED_PANDA_STYLE_DIAGNOSTIC_DIR'not in env,'Instrumentation forbidden');env['NODE_USE_ENV_PROXY']='1';env['RED_PANDA_RUNTIME_ADDON']=spec['runtimeAddon'];env.pop('RED_PANDA_COLLECTIONS_ADDON',None);env.pop('RED_PANDA_HEAP_ADDON',None)
 for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[env.get(key,''),'0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]']))
 row={'label':label,'command':command,'commandAdminSeconds':limit,'cwd':str(cwd)};status['commands'].append(row)
 with(out/(label+'.stdout')).open('xb')as stdout,(out/(label+'.stderr')).open('xb')as stderr:
  def limits():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
  child=subprocess.Popen(command,cwd=cwd,env=env,stdin=subprocess.DEVNULL,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=limits);initial=proc(child.pid,True);require(initial and initial['pgrp']==child.pid and initial['sid']==child.pid,'Owned group missing');owned[(initial['pid'],initial['startTicks'])]=initial;row['initialIdentity']=initial;begin=time.monotonic()
  while child.poll()is None:
   track(child,owned)
   if time.monotonic()-begin>=limit or time.monotonic()-started>=90:row['deadlineHit']=True;break
   time.sleep(.025)
  row['liveAfterExitBeforeCleanup']=[r for r in track(child,owned)if r['state']!='Z']if child.poll()is not None else None;row['cleanup']=cleanup(child,owned);row['exit']=child.returncode;row['secondsIncludingCleanup']=time.monotonic()-begin
 require(not row.get('deadlineHit')and not row['cleanup']['liveRemaining']and not row['liveAfterExitBeforeCleanup'],'Actual deadline/lifetime failure');row['guardCounts']=guards();child=None;return row

def sourceRow(label):
 require(not listeners({9582,9584}),'Canonical port occupied before row');row=run(label+'-source31',spec['sourceCommand'],19,D,BASE);require(row['exit']in[0,1],'Source setup/transport failure');report=load(out/(label+'-source31.json'));require(len(report['results'])==1 and report['counts']['selected']==1,'Selected Source missing');r=report['results'][0]
 require(r['path']=='css/external_stylesheet.html'and r['sha256']==plan['selectedFixtureSHA256'],'Fixture drift');require(r['sourceProfile']['id']=='b036c0edf592'and r['sourceProfile']['resources']==['stylesheet']and r['sourceProfile']['sourceTimeoutMs']==2000,'Source profile drift');require(r['sourceLoadContract']['loadBudgetMs']==2000 and r['sourceLoadContract']['assertionBudgetMs']==2000 and r['settleDelayMs']==0,'Source budget drift');require(report['sourceHarnessSHA256']==plan['adaptedHarnessSHA256']and not report['publicUserAgentOverrideApplied']and not report['publicClientHintsOverrideApplied']and report['target']['product'].startswith('RedPanda/'),'Actual UA/adapter drift');require(row['exit']==(0 if r['status']=='passed'else 1),'Exit/source result mismatch')
 ports.update(int(v)for v in re.findall(r'listening on 127\.0\.0\.1:(\d+)',r.get('ownedBrowser',{}).get('stderr','')));require(not listeners(ports),'Row owned ports remain');status[label+'SourceResult']=r;status[label+'SourceCounts']=report['counts'];require(r['status']in['passed','timeout','failed'],'Setup/error Source classification requires review')
 if label=='candidate':require(r['status']=='passed','Corrected Source31 nonpass; no later controls executed')
 return r

def tests(label,spec):
 command=[str(node),'--experimental-vm-modules','--test','--test-reporter=tap','--test-concurrency=1',*spec['files']];row=run(label,command,spec['commandAdminSeconds'],BASE,BASE);text=(out/(label+'.stdout')).read_text();totals={key:int(value)for key,value in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',text,re.M)};row['actualTAP']=totals;require(row['exit']==0 and totals.get('tests')==totals.get('pass')==spec['expectedPass']and all(totals.get(k)==0 for k in ['fail','cancelled','skipped','todo']),'Actual TAP/exit mismatch')
try:
 sourceRow('candidate');tests('new5',plan['newTests']);tests('existing30',plan['existingTests']);status['state']='PASS_SINGLE_CORRECTED_SDK'
except Exception as error:status['state']='FAILED_OR_INCOMPLETE';status['failure']={'type':type(error).__name__,'message':str(error)}
finally:
 if child:
  try:status['exceptionalCleanup']=cleanup(child,owned)
  except Exception as error:status['state']='OWNED_CLEANUP_FAILURE';status['cleanupFailure']=str(error)
 status['secondsIncludingCleanup']=time.monotonic()-started;status['mainAfter']=proc(SERVICE);status['checkedPorts']=sorted(ports);status['listenersAfter']=listeners(ports)
 try:status['guardCounts']=guards();require(not status['listenersAfter'],'Owned source port remains');require(status['mainBefore']==status['mainAfter'],'Excluded main changed')
 except Exception as error:status['state']='GUARD_OR_CLOSURE_FAILURE';status['guardFailure']=str(error)
 (out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status,indent=2),flush=True)
if status['state']!='PASS_SINGLE_CORRECTED_SDK':raise SystemExit(1)
