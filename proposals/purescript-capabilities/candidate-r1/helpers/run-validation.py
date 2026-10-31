from pathlib import Path
import hashlib,json,os,re,signal,subprocess,time
root=Path(__file__).resolve().parent.parent;e=root/'evidence'
node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node')
start=time.monotonic();admin=180;reserve=8
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def guard():
 result={}
 for top in ['src','bin','scripts','test','automation/src','automation/test','helpers','native','node_modules']:
  for p in(root/top).rglob('*'):
   if p.is_file()and'__pycache__'not in p.parts:result[str(p.relative_to(root))]=sha(p)
 for p in(root/'automation/.spago/p').rglob('*'):
  if p.is_file()and'.git'not in p.parts:result[str(p.relative_to(root))]=sha(p)
 for n in ['package.json','package-lock.json','automation/spago.yaml','automation/spago.lock','automation/package-set.json','automation/package-set-provenance.json']:
  result[n]=sha(root/n)
 result['sdk/node24.22.1']=sha(node);return result
before=guard();(e/'validation-before.json').write_text(json.dumps(before,indent=2)+'\n')
commands=[('strict',[str(node),'scripts/automation.mjs','build','--strict','--pedantic-packages']),('purescript117',[str(node),'scripts/automation.mjs','test'])]
env=dict(os.environ,PATH=str(node.parent)+':'+str(root/'node_modules/.bin')+':'+os.environ['PATH'],XDG_CACHE_HOME=str(root/'.cache'),XDG_CONFIG_HOME=str(root/'.cache/config'),XDG_DATA_HOME=str(root/'.cache/data'))
prior=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]))
for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[prior,'127.0.0.1,localhost,::1,[::1],0.0.0.0']))
runs=[]
for label,command in commands:
 remaining=admin-(time.monotonic()-start)-reserve
 if remaining<=0:runs.append({'label':label,'unobserved':'No admin allowance remains'});break
 begin=time.monotonic()
 with(e/(label+'.stdout')).open('xb')as stdout,(e/(label+'.stderr')).open('xb')as stderr:
  p=subprocess.Popen(command,cwd=root,env=env,stdout=stdout,stderr=stderr,start_new_session=True)
  row={'label':label,'command':command,'ownedProcessGroup':p.pid,'watchdogSeconds':remaining}
  try:row['exit']=p.wait(timeout=remaining)
  except BaseException as error:
   row['controllerError']=repr(error)
   for sig in [signal.SIGTERM,signal.SIGKILL]:
    try:os.killpg(p.pid,sig)
    except ProcessLookupError:pass
    if sig==signal.SIGTERM:
     try:p.wait(timeout=.25)
     except subprocess.TimeoutExpired:pass
   row['exit']=p.wait()
  try:os.killpg(p.pid,0);leftover=True
  except ProcessLookupError:leftover=False
  row['groupGone']=not leftover
  if leftover:
   row['cleanup']='Owned child group remained after command; terminate and classify incomplete cleanup'
   for sig in [signal.SIGTERM,signal.SIGKILL]:
    try:os.killpg(p.pid,sig)
    except ProcessLookupError:pass
  row['seconds']=time.monotonic()-begin;runs.append(row);print(json.dumps(row),flush=True)
  if row['exit']!=0 or leftover:break
 if label=='purescript117':
  raw=(e/(label+'.stdout')).read_text();row['actualPassLines']=len(re.findall(r'^PASS ',raw,re.M));row['reported117']='PureScript Puppeteer integration: 117 checks passed'in raw
  if row['actualPassLines']!=117 or not row['reported117']:break
after=guard();(e/'validation-after.json').write_text(json.dumps(after,indent=2)+'\n')
status={'runs':runs,'stable':before==after,'inputs':len(before),'seconds':time.monotonic()-start,'adminSeconds':admin,'boundary':'Owned strict PureScript build and actual117 assertions only. Original100 retained, including their existing genuine queryObjects cases; no unrelated JS/Native suites or native rebuild. All authored source/dependency inputs guarded; generated own output/cache intentionally excluded. No Native browser parity claim or actual proof before execution.'}
(e/'validation-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
raise SystemExit(0 if before==after and len(runs)==2 and all(r.get('exit')==0 and r.get('groupGone')for r in runs)and runs[-1].get('actualPassLines')==117 and runs[-1].get('reported117')else 1)
