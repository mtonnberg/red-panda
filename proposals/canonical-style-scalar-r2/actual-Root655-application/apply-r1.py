#!/usr/bin/env python3
"""STATIC skeleton; execution requires separate Parent review. Never controls a service."""
from pathlib import Path
import argparse,hashlib,json,os
D=Path(__file__).parent;ROOT=Path('/workspace/red-panda');sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def need(ok,message):
 if not ok:raise RuntimeError(message)
def load(p):return json.loads(Path(p).read_text())
def write(p,value):Path(p).write_text(json.dumps(value,indent=2)+'\n')
def proc(pid):
 try:
  text=(Path('/proc')/str(pid)/'stat').read_text();f=text[text.rfind(')')+2:].split();return{'pid':pid,'state':f[0],'startTicks':int(f[19])}
 except(FileNotFoundError,ProcessLookupError):return None
ap=argparse.ArgumentParser();ap.add_argument('--action',choices=['preflight','apply','rollback'],required=True);ap.add_argument('--execute-after-parent-review',action='store_true');a=ap.parse_args();need(a.execute_after_parent_review,'Explicit separate Parent review required');planPath=D/'application-plan-r1.json';need(sha(planPath)=='a84a8849cd8aa4e8796ba125eca0724b1157d58e3a57746b36226aea3748fd4d','Application plan drift');plan=load(planPath)
for key in['sourceMap','externalMap','handoffReceipt','combinedPatch']:need(sha(plan[key]['path'])==plan[key]['SHA256'],'Immutable input drift '+key)
s=load(plan['sourceMap']['path']);leaves=plan['leafMap'];service=plan['service'];before=s['RootInstalled654'];after=s['R2Candidate655'];journalPath=D/'journal.json';selfSHA=sha(__file__)
def verify(values):
 for n,h in values.items():need((ROOT/n).is_file()and sha(ROOT/n)==h,'Root source drift '+n)
 actual=set()
 for scope in s['engineScopes']:
  p=ROOT/scope
  for q in(p.rglob('*')if p.is_dir()else[p]):
   need(not q.is_symlink(),'Unexpected protected symlink '+str(q))
   if q.is_file():actual.add(str(q.relative_to(ROOT)))
 need(actual==set(values),'Root source inventory drift')
 need(len(s['native18'])==18 and sha(ROOT/'native/runtime.cc')==s['CPP95']==plan['CPP95'],'Native source drift')
 for n,h in s['native18'].items():need(sha(ROOT/n)==h,'Native artifact drift '+n)
def prerequisites():
 for label,p in plan['SDKPrerequisites'].items():
  need(sha(p)==plan['SDKStatusSHA256'][label],'Actual SDK status drift '+label);closed=plan['SDKClosure'][label];need(sha(closed['path'])==closed['SHA256'],'Actual SDK closure drift '+label)
  for record in load(closed['path'])['identities']:
   now=proc(record['recorded']['pid']);need(not now or now['startTicks']!=record['recorded']['startTicks'],'Prior owned SDK process still alive '+label)
  v=load(p);need(v['state']=='PASS_SINGLE_CORRECTED_SDK'and v['sdk']==label and v['controllerSHA256']==plan['SDKControllerSHA256']and v['planSHA256']==plan['SDKPlanSHA256'],'SDK prerequisite not an actual reviewed positive '+label)
  need(v['candidateSourceResult']['status']=='passed'and[(c['actualTAP']['pass'],c['actualTAP']['fail'])for c in v['commands']if'actualTAP'in c]==[(5,0),(30,0)],'SDK prerequisite incomplete '+label)
 for n,h in load(plan['externalMap']['path']).items():need(Path(n).is_file()and sha(n)==h,'External drift '+n)
 for n,v in leaves.items():need(sha(D/'payload'/n)==v['after'],'Payload drift '+n)
def deadService():
 p=proc(service['pid']);need(not p or p['startTicks']!=service['startTicks'],'Exact existing service still alive; Parent must independently close it before source mutation')
def restore(n,v):
 target=ROOT/n
 if v['before']is None:
  if target.exists():need(sha(target)==v['after'],'Refuse to remove unrelated new leaf '+n);target.unlink()
 else:
  backup=D/'backups'/n;need(sha(backup)==v['before'],'Actual backup missing/drift '+n)
  if target.exists():need(sha(target)in[v['before'],v['after']],'Refuse to overwrite unrelated source '+n)
  temporary=target.with_name(target.name+'.scalar-rollback-tmp');need(not temporary.exists(),'Temporary rollback collision');temporary.write_bytes(backup.read_bytes());os.replace(temporary,target)
if a.action=='preflight':
 verify(before);prerequisites();p=proc(service['pid']);need(p and p['startTicks']==service['startTicks'],'Expected actual service identity changed');need(not(D/'preflight.json').exists(),'Fresh preflight required');write(D/'preflight.json',{'state':'ACTUAL_PREFLIGHT_ONLY','service':p,'planSHA256':sha(planPath),'controllerSHA256':selfSHA,'RootInputs':len(before),'RootEdited':False});print('Preflight only; Parent still owns exact service stop and separate apply review.')
elif a.action=='apply':
 need(not journalPath.exists(),'Fresh application journal required');pre=load(D/'preflight.json');need(pre['state']=='ACTUAL_PREFLIGHT_ONLY'and pre['planSHA256']==sha(planPath)and pre['controllerSHA256']==selfSHA,'Actual matching preflight required');verify(before);prerequisites();deadService();need(not(ROOT/plan['newLeafMustPreviouslyBeAbsent']).exists(),'New test already exists');need(not(D/'backups').exists(),'Actual backup directory must be fresh')
 journal={'state':'APPLYING','planSHA256':sha(planPath),'controllerSHA256':selfSHA,'serviceBeforeMutation':proc(service['pid']),'steps':[]};write(journalPath,journal)
 try:
  for n in plan['requiredBackups']:
   q=D/'backups'/n;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes((ROOT/n).read_bytes());need(sha(q)==leaves[n]['before'],'Actual old-file backup differs '+n)
  journal['actualBackups']={n:sha(D/'backups'/n)for n in plan['requiredBackups']};write(journalPath,journal)
  for n,v in leaves.items():
   target=ROOT/n;temporary=target.with_name(target.name+'.scalar-apply-tmp');need(not temporary.exists(),'Temporary apply collision');temporary.write_bytes((D/'payload'/n).read_bytes());os.replace(temporary,target);need(sha(target)==v['after'],'Applied leaf differs');journal['steps'].append({'path':n,'after':sha(target)});write(journalPath,journal)
  verify(after);journal['state']='APPLIED_SOURCE_ONLY_VALIDATION_UNRUN';journal['RootInputsAfter']=len(after);write(journalPath,journal)
 except Exception as error:
  journal['failure']=str(error);journal['rollbackSteps']=[]
  try:
   for n,v in reversed(list(leaves.items())):
    restore(n,v);journal['rollbackSteps'].append(n);write(journalPath,journal)
   verify(before);journal['state']='FAILED_APPLY_ROLLED_BACK'
  except Exception as rollbackError:journal['state']='ROLLBACK_INCOMPLETE';journal['rollbackFailure']=str(rollbackError)
  write(journalPath,journal);raise
else:
 journal=load(journalPath);need(journal['state']=='APPLIED_SOURCE_ONLY_VALIDATION_UNRUN','Only this actual applied journal can roll back');need(journal['planSHA256']==sha(planPath),'Journal plan differs');verify(after);deadService();journal['rollbackSteps']=[]
 for n,v in reversed(list(leaves.items())):restore(n,v);journal['rollbackSteps'].append(n);write(journalPath,journal)
 verify(before);journal['state']='ROLLED_BACK_SOURCE_ONLY';write(journalPath,journal)
