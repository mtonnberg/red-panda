from pathlib import Path
import argparse,json,hashlib,subprocess,time,signal,os
r=Path(__file__).resolve().parent;parser=argparse.ArgumentParser();parser.add_argument('target',choices=['root','ece']);parser.add_argument('epoch');parser.add_argument('--resource-seconds',type=float,default=140);a=parser.parse_args();assert a.epoch and all(c.isalnum()or c in '-_'for c in a.epoch);assert 20<=a.resource_seconds<=360
out=r/'runs'/a.epoch;out.mkdir(parents=True,exist_ok=False);root=Path('/workspace/red-panda');ece=Path('/workspace/shared/phase25-failure-baseline-ece1');directory=root if a.target=='root'else ece;node='/workspace/shared/rea-tools/node_modules/node/bin/node';contract=json.loads((r/'original-inputs-9228.json').read_text());baseline=json.loads((ece/'baseline-manifest.json').read_text());paths={str(root/p)if p!='external:Native'else'/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux':value for p,value in contract.items()}
if a.target=='ece':paths.update({str(ece/p):value for p,value in baseline['files'].items()})
for p in [r/'run-whole.py',r/'original-inputs-9228.json',r/'preparation.json',r/'diagnostic-observer.mjs',r/a.target/'whole-cli-options.test.mjs',r/a.target/'fixtures/cli-native-writer.json',Path(node)]:paths[str(p)]=None
# Preserve inherited TLS/proxy variables; only the declared canonical Node/PATH
# and loopback bypass union are added. No TLS validation override is introduced.
env=dict(os.environ,NODE_USE_ENV_PROXY='1');env['PATH']=str(Path(node).parent)+':'+env.get('PATH','');aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';previous=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]));env.update({k:','.join(filter(None,[previous,aliases]))for k in ['NO_PROXY','no_proxy']});trace=out/'events.jsonl';trace.touch(exist_ok=False);env.update(RED_PANDA_DIAGNOSTIC_ROOT=str(directory),RED_PANDA_DIAGNOSTIC_OUTPUT=str(trace))
selected=['PATH','NODE_OPTIONS','NODE_USE_ENV_PROXY','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','NODE_EXTRA_CA_CERTS','NODE_USE_SYSTEM_CA','SSL_CERT_FILE','SSL_CERT_DIR','NODE_TLS_REJECT_UNAUTHORIZED'];environment={k:{'present':k in env,'sha256':hashlib.sha256(env[k].encode()).hexdigest()if k in env else None}for k in selected}
for key in ['NODE_EXTRA_CA_CERTS','SSL_CERT_FILE']:
 p=Path(env[key])if env.get(key)else None
 if p and p.is_file():paths[str(p)]=None
start=time.monotonic();clockTicks=os.sysconf('SC_CLK_TCK');pageBytes=os.sysconf('SC_PAGE_SIZE')
def snap():return{p:hashlib.sha256(Path(p).read_bytes()).hexdigest()for p in sorted(paths)}
def stat(pid):
 try:
  text=Path('/proc/'+str(pid)+'/stat').read_text();tail=text[text.rfind(')')+2:].split();return{'pid':int(pid),'raw':text,'state':tail[0],'ppid':int(tail[1]),'pgid':int(tail[2]),'startTimeTicks':tail[19],'cpuTicks':int(tail[11])+int(tail[12]),'rssPages':int(tail[21])}
 except(OSError,IndexError,ValueError)as error:return{'pid':int(pid),'error':str(error)}
def tree(pid):
 rows=[];todo=[(pid,0)];seen=set()
 while todo and len(rows)<128:
  current,depth=todo.pop(0)
  if current in seen:continue
  seen.add(current);value=stat(current);value['depth']=depth;rows.append(value)
  if'error'not in value and depth<10:
   try:todo.extend((int(child),depth+1)for child in Path('/proc/'+str(current)+'/task/'+str(current)+'/children').read_text().split())
   except OSError:pass
 return rows
before=snap();(out/'before.json').write_text(json.dumps(before,indent=2)+'\n');diverged=[p for p in paths if paths[p]is not None and before[p]!=paths[p]];command=[node,'--experimental-vm-modules','--test','--test-concurrency=1',str(r/a.target/'whole-cli-options.test.mjs')];status={'target':a.target,'command':command,'testsSelected':10,'originalChildDeadlineMs':12000,'resourceSeconds':a.resource_seconds,'RootOriginalKeys':len(contract),'ECEKeys':len(baseline['files'])if a.target=='ece'else 0,'inputs':len(before),'divergedFromOriginalContract':diverged,'environmentFingerprints':environment,'TLSInheritedUnchanged':True,'clockTicksPerSecond':clockTicks,'pageBytes':pageBytes};child=None;ownedTree=[];guardFailure=False
try:
 if diverged:raise RuntimeError('Source contract changed before launch; no app child started')
 with(out/'test.log').open('xb')as log,(out/'controller-process-tree.jsonl').open('x')as progress:
  child=subprocess.Popen(command,cwd=directory,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);status.update(controllerChildPID=child.pid,controllerChildIdentity=stat(child.pid));deadline=time.monotonic()+a.resource_seconds
  while child.poll()is None:
   ownedTree=tree(child.pid);progress.write(json.dumps({'elapsed':time.monotonic()-start,'nodes':ownedTree})+'\n');progress.flush()
   if time.monotonic()>=deadline:guardFailure=True;raise TimeoutError('Administrative resource guard; original app child12s deadlines unchanged')
   time.sleep(.5)
  status['exit']=child.wait();status['ownedProcessTreeAtExit']=tree(child.pid)
except BaseException as error:
 status['controllerFailure']={'type':type(error).__name__,'message':str(error)}
 if child is not None:
  ownedTree=tree(child.pid);status['ownedTreeBeforeAdministrativeCleanup']=ownedTree
  try:os.killpg(child.pid,signal.SIGTERM)
  except ProcessLookupError:pass
  try:child.wait(timeout=.3)
  except subprocess.TimeoutExpired:
   try:os.killpg(child.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   child.wait()
  status['exitAfterCleanup']=child.returncode
finally:
 # Even a failed whole-file run retains raw append-only observations and guards.
 after=snap();(out/'after.json').write_text(json.dumps(after,indent=2)+'\n');events=[];parseErrors=[]
 for index,line in enumerate(trace.read_text().splitlines()):
  try:events.append(json.loads(line))
  except ValueError as error:parseErrors.append({'line':index+1,'error':str(error)})
 spawns=[e for e in events if e.get('event')=='spawn'];exits=[e for e in events if e.get('event')=='childExit'];status.update(unchanged=before==after,changed=[p for p in before if before[p]!=after[p]],elapsedSeconds=time.monotonic()-start,childSpawns=len(spawns),childExitRecords=len(exits),original12sKills=[e for e in events if e.get('event')=='original12sSIGKILL'],traceParseErrors=parseErrors,administrativeResourceGuardHit=guardFailure)
 leftovers=[]
 for event in spawns:
  pid=event.get('pid');old=event.get('identity')or{};now=stat(pid)if pid else{}
  if old.get('startTimeTicks')and now.get('startTimeTicks')==old['startTimeTicks']and now.get('state')!='Z':leftovers.append(now)
 status['unexpectedLiveOwnedCLIChildren']=leftovers
 if leftovers:
  status['cleanupFailure']='Unexpected live exact-identity owned CLI child; physical cleanup performed; no further trial authorized'
  for entry in leftovers:
   current=stat(entry['pid'])
   if current.get('startTimeTicks')==entry.get('startTimeTicks'):
    try:os.kill(entry['pid'],signal.SIGTERM)
    except ProcessLookupError:pass
  time.sleep(.2)
  for entry in leftovers:
   current=stat(entry['pid'])
   if current.get('startTimeTicks')==entry.get('startTimeTicks')and current.get('state')!='Z':
    try:os.kill(entry['pid'],signal.SIGKILL)
    except ProcessLookupError:pass
  status['ownedCLIChildrenAfterCleanup']=[stat(entry['pid'])for entry in leftovers]
 (out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps({k:status.get(k)for k in ['target','testsSelected','exit','controllerFailure','inputs','unchanged','divergedFromOriginalContract','childSpawns','childExitRecords','original12sKills','administrativeResourceGuardHit','unexpectedLiveOwnedCLIChildren','elapsedSeconds']}),flush=True)
