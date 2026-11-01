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

parser=argparse.ArgumentParser();parser.add_argument('--execute-after-parent-review',action='store_true');args=parser.parse_args();require(args.execute_after_parent_review,'Explicit Parent runtime lease required')
D=Path(__file__).parent.parent;planPath=D/'plan-r1.json';PLAN_SHA='e282f64c504d43c76a1c88aafee6c790bfd2bee633a6df4b337e27b5a972222f';require(sha(planPath)==PLAN_SHA,'Reviewed plan differs');plan=load(planPath);sourcePath=D/'contracts/source-r1.json';externalPath=D/'contracts/external-r1.json';require(sha(sourcePath)==plan['sourceMapSHA256']and sha(externalPath)==plan['externalMapSHA256'],'Frozen maps differ');source=load(sourcePath);external=load(externalPath);selfSHA=sha(__file__);node=Path(plan['stockNode']['path']);require(sha(node)==NODE_SHA==plan['stockNode']['SHA256'],'Actual stock24 required');scopes=source['engineScopes']
def guards():
 require(sha(__file__)==selfSHA and sha(planPath)==PLAN_SHA,'Controller/plan drift');require(sha(sourcePath)==plan['sourceMapSHA256']and sha(externalPath)==plan['externalMapSHA256'],'Map drift');counts={'external':verify(external)}
 for label,base,key in [('Root',ROOT,'RootInstalled654'),('current654',D/'current654','current654'),('candidate',D/'candidate','candidate655')]:
  table={str(base/n):h for n,h in source[key].items()};counts[label]=verify(table);require(inventory(base,scopes)==set(table),'Source inventory drift '+label)
  if label!='Root':counts[label+'Oracles']=verify({str(base/n):h for n,h in source['oracles'].items()})
 for label in ['harness','fixtures']:
  table={str(D/label/n):h for n,h in source[label].items()};counts[label]=verify(table);require({str(p)for p in(D/label).rglob('*')if p.is_file()and'node_modules'not in p.parts}==set(table),'Input inventory drift '+label)
 require(sha(D/'evidence/functional-r1.patch')==plan['patchSHA256'],'Patch drift')
 for label,h in plan['launcherSHA256'].items():require(sha(D/(label+'-browser'))==h,'Launcher drift')
 require(len(source['native18'])==18 and sha(ROOT/'native/runtime.cc')==CPP95==source['CPP95'],'Native95 drift')
 for n,h in source['native18'].items():require(sha(ROOT/n)==sha(D/'current654'/n)==sha(D/'candidate'/n)==h,'Native18 drift '+n)
 return counts
def listeners(ports):
 result=[]
 for kind in ['tcp','tcp6']:
  for text in(Path('/proc/net')/kind).read_text().splitlines()[1:]:
   f=text.split();port=int(f[1].split(':')[1],16)
   if f[3]=='0A'and port in ports:result.append({'kind':kind,'port':port,'inode':f[9]})
 return result
require(proc(SERVICE,True)['startTicks']==11224137,'Excluded main identity changed; require derivative');guards();out=D/'run-gate-r1';require(not out.exists(),'Fresh output required');require(not listeners({9582,9584}),'Unrelated canonical listener: never stop it');out.mkdir();started=time.monotonic();status={'state':'RUNNING','commands':[],'aggregateSeconds':90,'sourceLimits':plan['sourceLimits'],'mainBefore':proc(SERVICE),'controllerSHA256':selfSHA,'planSHA256':sha(planPath),'sourceSHA256':sha(sourcePath)};child=None;owned={};ports={9582,9584}
def run(label,command,limit,cwd,base):
 global child,owned
 guards();owned={};env=os.environ.copy();require(env.get('NODE_OPTIONS','')=='','Unexpected Node options');require('RED_PANDA_STYLE_DIAGNOSTIC_DIR'not in env,'Instrumentation forbidden');env['NODE_USE_ENV_PROXY']='1';env['RED_PANDA_RUNTIME_ADDON']=str(base/'native/build/linux-x64/node-24.22.1/runtime.node');env.pop('RED_PANDA_COLLECTIONS_ADDON',None);env.pop('RED_PANDA_HEAP_ADDON',None)
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
 require(not listeners({9582,9584}),'Canonical port occupied before row');row=run(label+'-source31',plan['sourceCommands'][label],19,D,D/label);require(row['exit']in[0,1],'Source setup/transport failure');report=load(out/(label+'-source31.json'));require(len(report['results'])==1 and report['counts']['selected']==1,'Selected Source missing');r=report['results'][0]
 require(r['path']=='css/external_stylesheet.html'and r['sha256']==plan['selectedFixtureSHA256'],'Fixture drift');require(r['sourceProfile']['id']=='b036c0edf592'and r['sourceProfile']['resources']==['stylesheet']and r['sourceProfile']['sourceTimeoutMs']==2000,'Source profile drift');require(r['sourceLoadContract']['loadBudgetMs']==2000 and r['sourceLoadContract']['assertionBudgetMs']==2000 and r['settleDelayMs']==0,'Source budget drift');require(report['sourceHarnessSHA256']==plan['adaptedHarnessSHA256']and not report['publicUserAgentOverrideApplied']and not report['publicClientHintsOverrideApplied']and report['target']['product'].startswith('RedPanda/'),'Actual UA/adapter drift');require(row['exit']==(0 if r['status']=='passed'else 1),'Exit/source result mismatch')
 ports.update(int(v)for v in re.findall(r'listening on 127\.0\.0\.1:(\d+)',r.get('ownedBrowser',{}).get('stderr','')));require(not listeners(ports),'Row owned ports remain');status[label+'SourceResult']=r;status[label+'SourceCounts']=report['counts'];require(r['status']in['passed','timeout','failed'],'Setup/error Source classification requires review')
 if label=='candidate':require(r['status']=='passed','Corrected Source31 nonpass; no later controls executed')
 return r

def tests(label,spec):
 command=[str(node),'--experimental-vm-modules','--test','--test-reporter=tap','--test-concurrency=1',*spec['files']];row=run(label,command,spec['commandAdminSeconds'],D/'candidate',D/'candidate');text=(out/(label+'.stdout')).read_text();totals={key:int(value)for key,value in re.findall(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$',text,re.M)};row['actualTAP']=totals;require(row['exit']==0 and totals.get('tests')==totals.get('pass')==spec['expectedPass']and all(totals.get(k)==0 for k in ['fail','cancelled','skipped','todo']),'Actual TAP/exit mismatch')
try:
 for i,file in enumerate(plan['syntaxFiles'],1):require(run('syntax-'+str(i),[str(node),'--check',file],7,D,D/'candidate')['exit']==0,'Actual syntax failure')
 sourceRow('current654');sourceRow('candidate');tests('new5',plan['newTests']);tests('existing30',plan['existingTests']);status['state']='PASS_BOUNDED_SCALAR_PROGRAM_GATE'
except Exception as error:status['state']='FAILED_OR_INCOMPLETE';status['failure']={'type':type(error).__name__,'message':str(error)}
finally:
 if child:
  try:status['exceptionalCleanup']=cleanup(child,owned)
  except Exception as error:status['state']='OWNED_CLEANUP_FAILURE';status['cleanupFailure']=str(error)
 status['secondsIncludingCleanup']=time.monotonic()-started;status['mainAfter']=proc(SERVICE);status['checkedPorts']=sorted(ports);status['listenersAfter']=listeners(ports)
 try:status['guardCounts']=guards();require(not status['listenersAfter'],'Owned port remains');require(status['mainBefore']==status['mainAfter'],'Excluded main changed')
 except Exception as error:status['state']='GUARD_OR_CLOSURE_FAILURE';status['guardFailure']=str(error)
 (out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status,indent=2),flush=True)
if status['state']!='PASS_BOUNDED_SCALAR_PROGRAM_GATE':raise SystemExit(1)
