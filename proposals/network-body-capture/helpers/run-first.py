from pathlib import Path
import hashlib,json,os,signal,subprocess,time
root=Path(__file__).resolve().parent.parent
node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node')
e=root/'evidence';start=time.monotonic();seconds=60;reserve=5
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def guard():
 result={}
 for top in ['src','test','scripts','bin','helpers','native','node_modules']:
  for p in (root/top).rglob('*'):
   if p.is_file()and'__pycache__'not in p.parts:result[str(p.relative_to(root))]=sha(p)
 for name in ['package.json','package-lock.json']:result[name]=sha(root/name)
 result['node']=sha(node);return result
before=guard();(e/'first-before.json').write_text(json.dumps(before,indent=2)+'\n')
commands=[['--check','src/network-capture.js'],['--check','test/network-body-capture.test.js'],['--experimental-vm-modules','--test','--test-concurrency=1','test/network-body-capture.test.js'],['--experimental-vm-modules','--test','--test-concurrency=1','--test-name-pattern=plain-text and JSON responses','test/browser.test.js']]
runs=[]
for i,args in enumerate(commands):
 remaining=seconds-(time.monotonic()-start)-reserve
 if remaining<=0:runs.append({'notStarted':'No outer allowance remains'});break
 with(e/f'first-{i}.stdout').open('xb')as stdout,(e/f'first-{i}.stderr').open('xb')as stderr:
  begin=time.monotonic();p=subprocess.Popen([str(node),*args],cwd=root,stdout=stdout,stderr=stderr,start_new_session=True)
  row={'command':[str(node),*args],'ownedProcessGroup':p.pid,'outerRemainingSeconds':remaining}
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
  row['seconds']=time.monotonic()-begin;runs.append(row);print(json.dumps(row),flush=True)
  if row['exit']!=0:break
after=guard();(e/'first-after.json').write_text(json.dumps(after,indent=2)+'\n')
status={'runs':runs,'adminSeconds':seconds,'seconds':time.monotonic()-start,'stable':before==after,'inputs':len(before),'boundary':'Owned isolated929 draft only. Fresh process groups, exact existing per-test/API budgets,6new tests and1existing plaintext test. No full suite/Native success inferred.'}
(e/'first-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
raise SystemExit(0 if before==after and len(runs)==len(commands)and all(r['exit']==0 for r in runs)else 1)
