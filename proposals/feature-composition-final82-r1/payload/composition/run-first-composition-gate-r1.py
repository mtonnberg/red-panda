#!/usr/bin/env python3
"""UNRUN frozen gate. Requires Parent's explicit exclusive runtime grant."""
from pathlib import Path
import hashlib,json,os,re,resource,signal,subprocess,time
P=Path(__file__).parent;G=P/'first-composition-gate-r1';C=Path('/workspace/shared/feature-composition-2342-final82-runtime-r1');ROOT=Path('/workspace/red-panda');NODE=Path('/workspace/shared/rea-tools/node_modules/node/bin/node')
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def verify(file,base):
 table=json.loads(file.read_text());bad=[n for n,h in table.items()if not(base/n).is_file()or sha(base/n)!=h]
 if bad:raise RuntimeError('Frozen input mismatch: '+str(bad))
 return len(table)
def rootmap():
 table={str(f.relative_to(ROOT)):sha(f)for folder in ['src','test','native','bin','scripts']for f in sorted((ROOT/folder).rglob('*'))if f.is_file()}
 table.update({n:sha(ROOT/n)for n in ['package.json','package-lock.json']});return table
def owned(group):
 rows=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdecimal():continue
  try:
   text=(p/'stat').read_text();fields=text[text.rfind(')')+2:].split()
   if int(fields[2])==group:rows.append({'pid':int(p.name),'state':fields[0]})
  except(OSError,ValueError,IndexError):pass
 return rows
verify(G/'candidate647.json',C);verify(P/'Root2342-before.json',ROOT);verify(G/'tools519.json',Path('/'));verify(G/'frozen-packet.json',P)
before=rootmap();assert before==json.loads((P/'Root2342-before.json').read_text())
plan=json.loads((G/'plan.json').read_text());out=G/'actual-r1';out.mkdir(exist_ok=False)
env=os.environ.copy();env['NODE_USE_ENV_PROXY']='1';env['SEMANTIC_REPORT']=str(out/'semantic-native20.json');env['RED_PANDA_RUNTIME_ADDON']=str(C/'native/build/linux-x64/node-24.22.1/runtime.node')
for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[env.get(key,''),'127.0.0.1,localhost,0.0.0.0']))
status={'state':'RUNNING','expectedTests':82,'expectedInteractionCases':2,'originalBudgetsUnchanged':True,'administrativeSeconds':180,'cleanupSeconds':3,'stages':[],'CPPSourceSHA256':sha(C/'native/runtime.cc'),'actualSelectedAddon':env['RED_PANDA_RUNTIME_ADDON'],'NodeBinarySHA256':sha(NODE)}
started=time.monotonic();child=None
try:
 commands=[('syntax-'+str(i),[str(NODE),'--check',n],10)for i,n in enumerate(plan['changedJS'])]
 commands.append(('new82',[str(NODE),'--experimental-vm-modules','--test','--test-concurrency=1','--test-reporter=tap',*plan['newFiles']],180))
 commands.append(('interaction2',[str(NODE),'--experimental-vm-modules','--test','--test-concurrency=1','--test-reporter=tap','/workspace/shared/feature-composition-interactions-final82-r1/interactions.test.mjs'],45))
 for label,command,cap in commands:
  remaining=180-(time.monotonic()-started)
  if remaining<=0:raise RuntimeError('Administrative ceiling exhausted before '+label)
  stage={'name':label,'command':command,'declaredCapSeconds':cap};status['stages'].append(stage);print(json.dumps({'starting':label}),flush=True)
  with(out/(label+'.stdout')).open('wb')as stdout,(out/(label+'.stderr')).open('wb')as stderr:
   def limits():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
   child=subprocess.Popen(command,cwd=C,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=limits);stage['pid']=child.pid;at=time.monotonic();deadline=at+min(cap,remaining);nextprogress=at+30
   while child.poll()is None and time.monotonic()<deadline:
    try:child.wait(timeout=min(1,max(.001,deadline-time.monotonic())))
    except subprocess.TimeoutExpired:pass
    if time.monotonic()>=nextprogress:print(json.dumps({'running':label,'seconds':time.monotonic()-at}),flush=True);nextprogress+=30
   if child.poll()is None:stage['deadlineExpired']=True;stage['ownedAtDeadline']=owned(child.pid);os.killpg(child.pid,signal.SIGKILL)
   stage['exit']=child.wait();stage['seconds']=time.monotonic()-at;stage['ownedBeforeCleanup']=[x for x in owned(child.pid)if x['state']!='Z']
   if stage['ownedBeforeCleanup']:
    os.killpg(child.pid,signal.SIGKILL);end=time.monotonic()+3
    while time.monotonic()<end and any(x['state']!='Z'for x in owned(child.pid)):time.sleep(.02)
   stage['remainingLiveOwned']=[x for x in owned(child.pid)if x['state']!='Z']
  print(json.dumps(stage),flush=True)
  if stage['exit']!=0 or stage.get('deadlineExpired')or stage['remainingLiveOwned']:raise RuntimeError('Actual stage failed: '+label)
  if label=='new82':
   text=(out/(label+'.stdout')).read_text();summary={k:int(re.search(r'^# '+k+r' (\d+)\s*$',text,re.M).group(1))for k in ['tests','pass','fail','cancelled','skipped','todo']};stage['summary']=summary
   assert summary=={'tests':82,'pass':82,'fail':0,'cancelled':0,'skipped':0,'todo':0},summary
   proofs=[json.loads(line.split('SEMANTIC_CREATION_PROOF ',1)[1])for line in text.splitlines()if'SEMANTIC_CREATION_PROOF 'in line];assert len(proofs)==3
   (out/'semantic-physical3.json').write_text(json.dumps(proofs,indent=2)+'\n');comparisons=json.loads((out/'semantic-native20.json').read_text());assert len(comparisons['comparisons'])==20
   assert all(r['actual']==r['expected']for r in comparisons['comparisons'])
   stage['semanticPhysicalObjects']=3;stage['semanticWholeNativeComparisons']=20
   stage['lateUncaughtActivity']=any(s in text for s in ['asynchronous activity after','triggered an unhandledRejection','generated asynchronous activity'])
   if stage['lateUncaughtActivity']:raise RuntimeError('Actual late asynchronous activity')
  if label=='interaction2':
   text=(out/(label+'.stdout')).read_text();summary={k:int(re.search(r'^# '+k+r' (\d+)\s*$',text,re.M).group(1))for k in ['tests','pass','fail','cancelled','skipped','todo']};stage['summary']=summary
   assert summary=={'tests':2,'pass':2,'fail':0,'cancelled':0,'skipped':0,'todo':0},summary
   stage['lateUncaughtActivity']=any(s in text for s in ['asynchronous activity after','triggered an unhandledRejection','generated asynchronous activity'])
   if stage['lateUncaughtActivity']:raise RuntimeError('Actual late interaction activity')
 status['state']='PASS_COMPOSED_FIRST82_AND_INTERACTION2_ONLY'
except Exception as error:status['state']='FAILED_OR_INCOMPLETE';status['failure']={'type':type(error).__name__,'message':str(error)}
finally:
 if child and child.poll()is None:os.killpg(child.pid,signal.SIGKILL);child.wait()
 after=rootmap();status['changedRoot']=[n for n in sorted(set(before)|set(after))if before.get(n)!=after.get(n)]
 for name,file,base in [('candidate',G/'candidate647.json',C),('tools',G/'tools519.json',Path('/')),('packet',G/'frozen-packet.json',P)]:
  try:status[name+'StableCount']=verify(file,base)
  except Exception as error:status[name+'GuardFailure']=str(error);status['state']='GUARD_FAILURE'
 status['RootInputs']=len(before);status['seconds']=time.monotonic()-started
 (out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status,indent=2),flush=True)
if status['state']!='PASS_COMPOSED_FIRST82_AND_INTERACTION2_ONLY'or status['changedRoot']:raise SystemExit(1)
