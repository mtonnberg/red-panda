#!/usr/bin/env python3
"""Reviewed static draft only. Parent executes after accepted82+2 and lease."""
from pathlib import Path
import argparse,hashlib,json,os,shutil,signal,tempfile,time
P=Path(__file__).parent;ROOT=Path('/workspace/red-panda')
EXPECTED_PLAN='3d2a79e20d3d9585c7838241e7ee0e8446a8ac7292435868d6a1ee8ca03648ac'
EXPECTED_SOURCE='e0583a66df8c3697f98904719338a6e2d3fb9a903de59bf8c6ca9bbd287f608f'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def process(pid):
 p=Path('/proc')/str(pid)
 try:
  s=(p/'stat').read_text();f=s[s.rfind(')')+2:].split()
  return {'pid':pid,'startTicks':f[19],'state':f[0],'cwd':str((p/'cwd').resolve()),'cmdline':(p/'cmdline').read_bytes().replace(b'\0',b' ').decode().strip(),'uid':p.stat().st_uid}
 except FileNotFoundError:return None
def check_path(path):
 assert path.is_relative_to(ROOT)
 for p in [path,*path.parents]:
  if p==ROOT.parent:break
  if p.is_symlink():raise RuntimeError('Unexpected symlink: '+str(p))
def exact_root():
 result={str(f.relative_to(ROOT)):sha(f)for folder in ['src','test','native','bin','scripts']for f in sorted((ROOT/folder).rglob('*'))if f.is_file()}
 result.update({n:sha(ROOT/n)for n in ['package.json','package-lock.json']});return result
args=argparse.ArgumentParser();args.add_argument('--backup-directory',required=True);args.add_argument('--execute-reviewed-application',action='store_true');args.add_argument('--stop-exact-owned-service',action='store_true');opt=args.parse_args()
if not opt.execute_reviewed_application:raise SystemExit('Static helper refuses execution without explicit Parent application flag.')
assert sha(P/'root-application-static-plan.json')==EXPECTED_PLAN
assert sha(P/'handoff/manifest.json')==EXPECTED_SOURCE
plan=json.loads((P/'root-application-static-plan.json').read_text());rows=plan['exact57Targets'];assert len(rows)==57
receipt=json.loads(Path(plan['requiredReceipt']).read_text());assert receipt['state']==plan['requiredReceiptState'] and receipt['changedRoot']==[] and receipt['candidateStableCount']==647
assert receipt['expectedTests']==82 and receipt['expectedInteractionCases']==2
assert receipt['stages'][-2]['summary']=={'tests':82,'pass':82,'fail':0,'cancelled':0,'skipped':0,'todo':0}
assert receipt['stages'][-1]['summary']=={'tests':2,'pass':2,'fail':0,'cancelled':0,'skipped':0,'todo':0}
assert all(x['exit']==0 and not x.get('deadlineExpired') and not x['remainingLiveOwned']for x in receipt['stages'])
for n,h in json.loads((P/'first-composition-gate-r1/frozen-packet.json').read_text()).items():assert sha(P/n)==h,n
for n,h in json.loads((P/'first-composition-gate-r1/candidate647.json').read_text()).items():assert sha(Path('/workspace/shared/feature-composition-2342-final82-runtime-r1')/n)==h,n
before=json.loads((P/'Root2342-before.json').read_text());assert len(before)==615 and exact_root()==before
for row in rows:
 n=row['path'];target=ROOT/n;check_path(target);assert sha(row['source'])==row['afterSHA256']
 assert (sha(target)if target.exists()else None)==row['beforeSHA256'],n
 if target.exists():assert target.stat().st_uid==os.geteuid() and target.stat().st_gid==os.getegid(),n
backup=Path(opt.backup_directory).absolute();assert backup.is_relative_to(Path('/workspace/shared')) and not backup.exists() and not backup.is_relative_to(P)
service=plan['oldOwnedService'];current=process(service['pid'])
if current:
 if current['startTicks']!=service['startTicks'] or current['cwd']!=str(ROOT)or current['cmdline']!=service['expectedCommand']or current['uid']!=os.geteuid():raise RuntimeError('Owned service identity mismatch; no process signalled or files replaced.')
 if not opt.stop_exact_owned_service:raise RuntimeError('Exact owned service still alive; Parent must stop it or explicitly use --stop-exact-owned-service.')
 os.kill(current['pid'],signal.SIGTERM);deadline=time.monotonic()+3
 while time.monotonic()<deadline and process(current['pid'])is not None:time.sleep(.02)
 if process(current['pid'])is not None:raise RuntimeError('Owned service did not fully exit; no files replaced. Parent must reap/stop using its owned handle.')
assert process(service['pid'])is None and exact_root()==before
backup.mkdir();journal={'state':'BACKING_UP','RootBefore':before,'sourceManifest':EXPECTED_SOURCE,'serviceAbsentBeforeAnyReplacement':True,'targets':rows,'committed':[],'modes':{}}
def save():
 tmp=backup/'journal.tmp';tmp.write_text(json.dumps(journal,indent=2)+'\n');os.replace(tmp,backup/'journal.json')
def atomic_bytes(target,data,mode):
 target.parent.mkdir(parents=True,exist_ok=True);fd,name=tempfile.mkstemp(prefix='.red-panda-stage-',dir=target.parent)
 try:
  with os.fdopen(fd,'wb')as output:output.write(data);output.flush();os.fchmod(output.fileno(),mode);os.fsync(output.fileno())
  os.replace(name,target)
  parent=os.open(target.parent,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(parent)
  finally:os.close(parent)
 finally:
  if os.path.exists(name):os.unlink(name)
for row in rows:
 target=ROOT/row['path'];mode=(target.stat().st_mode&0o777)if target.exists()else int(row['mode'],8);journal['modes'][row['path']]=mode
 if target.exists():dest=backup/'before'/row['path'];dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(target,dest);assert sha(dest)==row['beforeSHA256']
save();journal['state']='REPLACING';save()
try:
 for row in rows:
  assert process(service['pid'])is None,'Owned service reappeared before replacement'
  target=ROOT/row['path'];check_path(target);assert (sha(target)if target.exists()else None)==row['beforeSHA256']
  atomic_bytes(target,Path(row['source']).read_bytes(),journal['modes'][row['path']]);journal['committed'].append(row['path']);save()
 assert all(sha(ROOT/r['path'])==r['afterSHA256']for r in rows)
 expected=dict(before)
 for row in rows:
  if row['path'].split('/')[0]in ['src','test','native','bin','scripts']:expected[row['path']]=row['afterSHA256']
 assert exact_root()==expected
 journal['state']='APPLIED_EXACT57_FULL_ROOT_VALIDATION_STILL_UNRUN';journal['RootAfter']=expected;save()
except BaseException as error:
 journal['failure']=str(error);journal['state']='ROLLING_BACK';save()
 for row in reversed(rows):
  target=ROOT/row['path'];actual=sha(target)if target.exists()else None
  if actual==row['beforeSHA256']:continue
  if actual!=row['afterSHA256']:raise RuntimeError('Unexpected changed target; preserve user work and inspect backup: '+str(target))from error
  if row['beforeSHA256']is None:target.unlink()
  else:atomic_bytes(target,(backup/'before'/row['path']).read_bytes(),journal['modes'][row['path']])
 journal['state']='ROLLED_BACK';save();assert exact_root()==before;raise
print(backup/'journal.json')
