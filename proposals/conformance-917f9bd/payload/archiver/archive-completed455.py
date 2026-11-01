#!/usr/bin/env python3
"""Prepared only. Parent reviews/runs after the actual455 process completes."""
from pathlib import Path
from collections import Counter
import argparse,gzip,hashlib,io,json,math,os,shutil,socket,sys,tarfile
P=Path('/workspace/shared/registration455-root645-plan-r2');ROOT=Path('/workspace/red-panda')
DEST=ROOT/'proposals/conformance-917f9bd';COMMIT='917f9bdd1192d917de9c5caf4c54ca90619daf20'
SHA_NODE='e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def unique(pairs):
 out={}
 for k,v in pairs:
  if k in out:raise ValueError('Duplicate JSON key: '+k)
  out[k]=v
 return out
def invalid_constant(value):raise ValueError('Invalid JSON numeric constant: '+value)
def load(p):return json.loads(Path(p).read_text(),object_pairs_hook=unique,parse_constant=invalid_constant)
def require(ok,message):
 if not ok:raise RuntimeError(message)
def identity(pid):
 try:
  text=(Path('/proc')/str(pid)/'stat').read_text();f=text[text.rfind(')')+2:].split();return {'pid':int(pid),'startTicks':int(f[19]),'state':f[0]}
 except FileNotFoundError:return None
def ports():
 result=[]
 for port in [9582,9584]:
  with socket.socket()as s:s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('0.0.0.0',port));s.listen(1)
  result.append({'port':port,'bindListenClose':True})
 return result
parser=argparse.ArgumentParser();parser.add_argument('--epoch',default='adapted455-root645-r2');parser.add_argument('--execute-after-root-review',action='store_true');parser.add_argument('--execution-exit-receipt',type=Path);a=parser.parse_args()
require(a.execute_after_root_review,'No archive execution before explicit Parent review/completion grant.')
require(a.epoch=='adapted455-root645-r2','This version binds only the actual declared R2 epoch.')
run=P/'runs'/a.epoch;matrix=load(run/'matrix.json');registration=load(P/'maps/registration-map.json');frozen=load(P/'candidate-frozen.json');plan=load(P/'plan.json');adapter=load(P/'harness/adapter.json')
require(matrix.get('complete')is True and matrix.get('completedRows')==455 and matrix.get('plannedRows')==455 and matrix.get('remainingUnrun')==0,'Actual455 is not complete; refuse partial output directory or complete claim.')
require(not matrix.get('stopReason')and not matrix.get('finalGuardFailure')and not matrix.get('ownedPortReleaseFailure'),'Actual controller stopped or a final guard/port failed.')
require(len(matrix['results'])==len(registration['fixtures'])==455 and len(registration['profiles'])==8,'Actual row/profile population mismatch.')
require(len(frozen['graphSHA256'])==18088 and len(frozen['root645SHA256'])==645 and len(frozen['pinnedContractSourceSHA256'])==165 and len(frozen['nativeArtifacts'])==18,'Actual frozen input population differs from approved R2.')
require(frozen['productionCommit']==matrix['productionCommit']==plan['productionCommit']==COMMIT,'Wrong production epoch.')
require(frozen['node']['SHA256']==SHA_NODE and sha(frozen['node']['path'])==SHA_NODE and matrix['nodeVersion']=='v24.22.1','Production must use the measured independent stock24 executable, not the unaccepted provider.')
require(sha(P/'maps/registration-map.json')==frozen['registrationMapSHA256']==matrix['registrationMapSHA256']==plan['registrationMapSHA256'],'Registration order authority changed.')
require(matrix['runnerEligibilityAdapter']==adapter and adapter['publicUserAgentOverride']is False and adapter['publicClientHintsOverride']is False,'Actual adapter/branding disclosure changed.')
require(matrix['sourceLoadBudgetMs']==2000 and matrix['settleMs']==0 and matrix['concurrency']==1 and matrix['runnerGlobalArgs']==['--ws-max-concurrent','50'],'Actual original run contract changed.')
before=load(run/'before.json');after=load(run/'after.json')
for name,receipt in [('before',before),('after',after)]:
 require(receipt['graphUnchanged']is True and receipt['contractsUnchanged']is True and receipt['extraControlUnchanged']is True,name+' guard reports drift')
 require(receipt['graph']==frozen['graphSHA256'] and receipt['contracts']==frozen['pinnedContractSourceSHA256'],name+' complete graph/contract tables differ')
require(matrix['afterGraphUnchanged']is True and matrix['afterContractsUnchanged']is True and matrix['extraControlUnchanged']is True,'Final matrix flags differ.')
require(before['extraControlSHA256']==after['extraControlSHA256'] and len(after['extraControlSHA256'])==6,'Extra control authority changed.')
for path,value in frozen['graphSHA256'].items():require(sha(path)==value,'Current final graph drift: '+path)
source=Path(registration['sourceRoot'])
for path,value in frozen['pinnedContractSourceSHA256'].items():require(sha(source/path)==value,'Current pinned contract drift: '+path)
for path,value in after['extraControlSHA256'].items():require(sha(path)==value,'Current extra control drift: '+path)
for path,value in frozen['root645SHA256'].items():require(sha(ROOT/path)==value,'Actual production Root645 drift: '+path)
profiles={p['id']:p for p in registration['profiles']};counts=Counter();byprofile={};owned={};selected={};nonpasses=[]
def select(path,destination):
 path=Path(path);require(path.is_file()and not path.is_symlink(),'Missing/nonregular explicit archive input: '+str(path));require(destination not in selected,'Duplicate archive destination: '+destination)
 require(not path.read_bytes().startswith(b'\x7fELF')and path.suffix not in ['.node','.h','.hpp','.so','.a'],'Excluded binary/header input: '+str(path));selected[destination]={'source':str(path),'SHA256':sha(path),'bytes':path.stat().st_size}
for index,(fixture,row)in enumerate(zip(registration['fixtures'],matrix['results'])):
 require(row['index']==index and row['path']==fixture['path']and row['fixtureSHA256']==fixture['sha256'],'Row order/fixture identity mismatch '+str(index))
 profile=profiles[fixture['profile']];require(row['profile']==profile,'Actual profile mismatch '+fixture['path'])
 stem=f'{index:03d}-'+fixture['path'].replace('/','__');report=run/'reports'/(stem+'.json');raw=load(report)
 require(len(raw['results'])==1 and raw['results'][0]==row['result'],'Untruncated report differs from matrix result '+stem)
 result=row['result'];status=row['rawStatus'];require(status in ['passed','failed','timeout','unobserved','runnerError']and result['status']==status,'Unknown or inconsistent result status '+stem)
 require(result['path']==fixture['path']and result['sha256']==fixture['sha256']and result['sourceProfile']['id']==profile['id'],'Raw fixture/profile identity mismatch '+stem)
 config=result['configuration'];contract=result.get('sourceLoadContract')or{}
 require(config['fixtureBrowserArgs']==profile['nativeResourceAndFeatureArgs']and config['runnerGlobalArgs']==['--ws-max-concurrent','50'],'Actual source/browser arguments drift '+stem)
 require(config['fixtureBudgetMs']==profile['sourceTimeoutMs']and config['budgetKind']=='source-registration-load-then-assert','Actual assertion budget changed '+stem)
 require(contract.get('loadBudgetMs')==2000 and contract.get('assertionBudgetMs')==profile['sourceTimeoutMs'],'Actual load/assertion contract differs '+stem)
 require(result.get('phase')!='browser-setup'and result.get('executionPhase')!='automation-setup','Actual setup failure cannot be called a complete census '+stem)
 require(raw['binary']['sha256']==frozen['launcher']['SHA256']and raw['sourceHarnessSHA256']==adapter['adaptedSHA256']and raw['originalSourceHarnessSHA256']==adapter['originalSHA256'],'Actual launcher/adapter identity differs '+stem)
 require(raw['harnessSourceUnchanged']is False and raw['fixtureAssertionSourcesUnchanged']is True and raw['runnerEligibilityAdaptation']==adapter,'Eligibility/assertion disclosure differs '+stem)
 require(raw['publicUserAgentOverrideApplied']is False and raw['publicClientHintsOverrideApplied']is False and raw['settleDelayMs']==0,'Public branding or settle policy differs '+stem)
 require(row['integrity']and all(v is not False for v in row['integrity'].values())and row['reportError']is None,'Actual report integrity/error failure '+stem)
 ctl=row['controller'];cleanup=ctl['ownedCleanup'];require(ctl['administrativeDeadlineMs']==profile['sourceTimeoutMs']+2000+15000,'Actual per-row resource ceiling differs '+stem)
 require(isinstance(row['durationMs'],(int,float))and not isinstance(row['durationMs'],bool)and math.isfinite(row['durationMs'])and row['durationMs']>=0,'Invalid actual duration '+stem)
 require(not ctl['deadlineHit']and ctl['exitCode']in [0,1]and cleanup['liveRemaining']==[],'Resource/exit/cleanup failure '+stem)
 verified=status=='passed'and ctl['exitCode']==0
 require(row['verifiedAdaptedHarnessPass']is verified,'Verified-pass computation differs '+stem)
 if verified:require(result['harnessObserved']is True and result['nativeHarnessBranch']is True and result['nonzeroObservationsEnforced']is True and contract['loadBarrier']['observed']is True and contract['assertionStartedAfterLoad']is True,'Unobserved/preload result promoted '+stem)
 for record in [ctl['identity'],*cleanup['observed'],*cleanup['after']]:
  key=(int(record['pid']),int(record['startTicks']));owned[key]=record
  now=identity(key[0]);require(now is None or now['startTicks']!=key[1]or now['state']=='Z','Actual owned process still live: '+str(key))
 counts[status]+=1;group=byprofile.setdefault(profile['id'],{'selected':0,'statuses':Counter()});group['selected']+=1;group['statuses'][status]+=1
 if not verified:nonpasses.append({'index':index,'path':fixture['path'],'rawStatus':status,'executionPhase':result.get('executionPhase'),'harnessObserved':result.get('harnessObserved'),'tags':row['tags'],'error':result.get('error'),'originalObservationCount':result.get('observationCount'),'brandingPolicyNote':row['brandingPolicyNote']})
 select(report,'run/reports/'+report.name)
 for suffix in ['stdout','stderr']:select(run/'logs'/(stem+'.'+suffix),'run/logs/'+stem+'.'+suffix)
require(len(list((run/'reports').iterdir()))==455 and len(list((run/'logs').iterdir()))==910,'Unexpected missing/extra raw report/log files.')
require({k:counts[k]for k in matrix['rawCounts']}==matrix['rawCounts']and sum(counts.values())==455,'Raw aggregate totals differ.')
require(sum(r['verifiedAdaptedHarnessPass']for r in matrix['results'])==matrix['verifiedAdaptedHarnessPasses'],'Verified aggregate differs.')
for pid,p in profiles.items():require(byprofile[pid]['selected']==p['fixtureCount'],'Profile population differs '+pid)
require(matrix['canonicalPortsAfter']==[{'port':9582,'bindListenClose':True},{'port':9584,'bindListenClose':True}],'Actual final canonical-port receipt missing.')
fresh_ports=ports()
# The actual controller must be gone; never stop it or finish its cleanup here.
for path in Path('/proc').iterdir():
 if not path.name.isdecimal():continue
 try:argv=(path/'cmdline').read_bytes().split(b'\0')
 except(FileNotFoundError,PermissionError,ProcessLookupError):continue
 require(os.fsencode(str(P/'run-census-stop-setup.py'))not in argv,'Actual census controller still running; archive waits for Parent completion.')
stdout=P/'execution-r1/controller.stdout';stderr=P/'execution-r1/controller.stderr';messages=[json.loads(line)for line in stdout.read_text().splitlines()if line.strip()];progress=[m for m in messages if'completed'in m]
require(len(progress)==455 and [m['completed']for m in progress]==list(range(1,456)),'Actual controller stdout lacks all455 ordered checkpoints.')
for m,row in zip(progress,matrix['results']):require(m['path']==row['path']and m['rawStatus']==row['rawStatus']and m['verifiedAdaptedPass']==row['verifiedAdaptedHarnessPass'],'Controller checkpoint differs from row')
require(messages[-1].get('complete')is True and messages[-1].get('completedRows')==455 and messages[-1].get('rawCounts')==matrix['rawCounts']and messages[-1].get('graphUnchanged')is True and messages[-1].get('contractsUnchanged')is True,'Missing actual final complete stdout receipt.')
require('Traceback (most recent call last)'not in stderr.read_text(),'Actual controller stderr contains traceback; retain separately, no completion promotion.')
for n in ['matrix.json','before.json','after.json']:select(run/n,'run/'+n)
for n in ['controller.stdout','controller.stderr']:select(P/'execution-r1'/n,'execution-r1/'+n)
if a.execution_exit_receipt:
 exit_receipt=load(a.execution_exit_receipt);require(exit_receipt.get('exitCode',exit_receipt.get('exit'))==0,'Parent actual exit receipt is nonzero');select(a.execution_exit_receipt,'execution-r1/parent-actual-exit-receipt.json')
fixed=['readiness.json','plan.json','candidate-frozen.json','static-inventory.sha256','census-controller-stop-policy.json','run-census-stop-setup.py','freeze-candidate.py','orchestration.py','README.md','harness/adapter.json','harness/package.json','fixtures/original/testing.js','fixtures/adapted/testing.js']
for n in fixed:select(P/n,'prepared-packet/'+n)
for folder in ['controls','maps','history-r1','historical','reference/production-full','reference/provider-negative','reference/compatibility-inventory','harness/scripts','harness/test','original-helper/scripts','original-helper/test']:
 for path in sorted((P/folder).iterdir()):require(path.is_file(),'Unexpected directory in explicit metadata-only group '+str(path));select(path,'prepared-packet/'+folder+'/'+path.name)
for n in ['reference/epoch-pins.json','reference/application-journal.json','reference/historical-d41-summary.json','reference/historical-d41-README.md']:select(P/n,'prepared-packet/'+n)
require(sha(P/'fixtures/original/testing.js')==adapter['originalSHA256']and sha(P/'fixtures/adapted/testing.js')==adapter['adaptedSHA256'],'Actual eligibility sources drift.')
select(Path(__file__),'archiver/'+Path(__file__).name)
historical=ROOT/'proposals/conformance-d41/receipt/run';old=load(historical/'matrix.json');oldsummary=load(historical/'summary.json');require(oldsummary['fullRows']==455 and oldsummary['verifiedAdaptedPasses']==402 and oldsummary['observedAssertionFailures']==50 and oldsummary['sourceLoadTimeouts']==3,'Historical authoritative epoch changed; do not rewrite it.')
require(old['registrationMapSHA256']==matrix['registrationMapSHA256']and len(old['results'])==455,'Historical row comparison not comparable.')
changes=[]
for previous,current in zip(old['results'],matrix['results']):
 require((previous['index'],previous['path'],previous['fixtureSHA256'],previous['profile']['id'])==(current['index'],current['path'],current['fixtureSHA256'],current['profile']['id']),'Historical row identity differs; no paired change list.')
 if(previous['rawStatus'],previous['verifiedAdaptedHarnessPass'])!=(current['rawStatus'],current['verifiedAdaptedHarnessPass']):changes.append({'index':current['index'],'path':current['path'],'previousRawStatus':previous['rawStatus'],'currentRawStatus':current['rawStatus'],'previousVerifiedAdaptedPass':previous['verifiedAdaptedHarnessPass'],'currentVerifiedAdaptedPass':current['verifiedAdaptedHarnessPass']})
require(not DEST.exists(),'Destination exists; preserve previous archive and use a reviewed derivative.')
# All completeness/integrity/lifetime checks above happen before creating output.
DEST.mkdir();payload=DEST/'payload';payload.mkdir();inventory={}
for name,record in selected.items():
 require('..'not in Path(name).parts and not Path(name).is_absolute(),'Unsafe archive member')
 require(sha(record['source'])==record['SHA256'],'Input changed before copy: '+record['source']);target=payload/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(record['source'],target);require(sha(target)==record['SHA256'],'Copy SHA mismatch');inventory['payload/'+name]=record
summary={'productionCommit':COMMIT,'kind':'Actual adapted455 with real RedPanda branding; not strict unchanged Native fullPASS','fullRows':455,'verifiedAdaptedPasses':matrix['verifiedAdaptedHarnessPasses'],'rawCounts':dict(matrix['rawCounts']),'nonpassRows':len(nonpasses),'sourceLoadTimeouts':sum(r['rawStatus']=='timeout'and r['result'].get('executionPhase')=='source-load'for r in matrix['results']),'profiles':byprofile,'wallSeconds':matrix['wallSeconds'],'finalGuards':{'graph':len(frozen['graphSHA256']),'contracts':len(frozen['pinnedContractSourceSHA256']),'extraControls':len(after['extraControlSHA256']),'allUnchanged':True},'ownedIdentitiesObserved':len(owned),'ownedLiveRemaining':[],'canonicalPortsFreshReadback':fresh_ports,'originalReportsAndStdoutStderrCopiedWhole':True,'internalOriginalLimitsDisclosed':'Child stderr64KiB with stderrTruncated retained and request log10000; no claim internally bounded fields are uncapped','noRetriesOrChangedSourceBudgets':True,'noUAOrClientHintOverride':True,'noLaterUnexecutedAssertionClaims':True,'historical402_50_3':{'matrixPath':str(historical/'matrix.json'),'matrixSHA256':sha(historical/'matrix.json'),'summarySHA256':sha(historical/'summary.json'),'keptSeparate':True,'causalSubtractionClaimed':False},'experimentalProvider':'Negative provenance only, independent of actual stock24 census. Identity/collision positives do not erase45s proxy timeout or unrun stages.','fullProductionGate':'Separate2190JS/129PS/13Native+syntax/strict receipt; not inferred from adapted455.'}
generated={'summary.json':summary,'nonpasses.json':nonpasses,'paired-changed-outcomes.json':{'meaning':'Same registered identities, separate epochs; changed outcome pairs only, no causal subtraction or attribution.','rows':changes},'validation.json':{'actual455OrderAndAllRawReportsValidated':True,'currentGuardsAndOwnedLifetimesValidated':True,'freshPorts':fresh_ports,'controllerFinalCheckpointValidated':True,'actualParentExitReceiptProvided':a.execution_exit_receipt is not None,'selectedAllowlist':selected}}
for n,value in generated.items():(DEST/n).write_text(json.dumps(value,indent=2)+'\n')
for n in generated:inventory[n]={'source':'generated only after actual completion validation','SHA256':sha(DEST/n),'bytes':(DEST/n).stat().st_size}
archive=DEST/'actual455-evidence.tar.gz'
with archive.open('wb')as raw:
 with gzip.GzipFile(filename='',fileobj=raw,mode='wb',mtime=0)as gz:
  with tarfile.open(fileobj=gz,mode='w',format=tarfile.PAX_FORMAT)as tar:
   for name,record in sorted(inventory.items()):
    data=(DEST/name).read_bytes();info=tarfile.TarInfo(name);info.size=len(data);info.mode=0o644;info.mtime=0;info.uid=info.gid=0;info.uname=info.gname='';tar.addfile(info,io.BytesIO(data))
with tarfile.open(archive,'r:gz')as tar:
 require(len(tar.getmembers())==len(inventory),'Archive member count differs')
 for member in tar.getmembers():
  require(member.isfile()and member.name in inventory,'Unexpected archive member');data=tar.extractfile(member).read();record=inventory[member.name];require(len(data)==record['bytes']and hashlib.sha256(data).hexdigest()==record['SHA256'],'Archive readback mismatch '+member.name)
for record in selected.values():require(sha(record['source'])==record['SHA256'],'Original raw/control input changed while archiving')
(DEST/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
(DEST/'manifest.json').write_text(json.dumps({'state':'ACTUAL_COMPLETE455_VALIDATED_AND_ARCHIVED','summarySHA256':sha(DEST/'summary.json'),'inventorySHA256':sha(DEST/'inventory.json'),'archiveSHA256':sha(archive),'archiveBytes':archive.stat().st_size,'members':len(inventory),'everyMemberReadbackSHAAndSizeVerified':True,'excluded':['ELF/addons/headers','dependencies','full production application','whole fixture tree'],'sourceRootAndFrozenControlsChanged':False},indent=2)+'\n')
(DEST/'README.md').write_text('Actual '+str(summary['verifiedAdaptedPasses'])+'/455 verified adapted-harness passes; raw statuses '+json.dumps(summary['rawCounts'])+'. Every failed, timed-out and unobserved row is retained. This is not strict unchanged Native fullPASS.\n\nAll455 ordered registered rows, eight profiles, per-row original fixture SHA/browser/load/assertion/global contracts, launcher/eligibility/branding identities, full final graph/contracts/six extra controls, actual owned process identities and canonical port cleanup were validated before creating this archive. Untruncated existing report/log/controller files were copied whole. Original internally capped stderr fields keep their truncation flags.\n\nThe external eligibility-only adapter and unchanged original assertions are disclosed; real Red Panda UA/client hints remain. No later assertions skipped by a literal-brand failure are claimed verified. Independent experimental provider negatives stay negative. Historical402/50/3 and old R1UNRUN are separate; paired outcome changes make no causal subtraction claim. Production2190/129/13 is a separately captured receipt.\n\nNo ELF, header, dependency tree, whole app or whole fixture tree is archived. Every tar member was read back and verified by SHA256 and size.\n')
print(json.dumps({'archive':str(DEST),'manifestSHA256':sha(DEST/'manifest.json'),'tarSHA256':sha(archive),'bytes':archive.stat().st_size,'members':len(inventory),'actualTotals':summary['rawCounts'],'verifiedAdaptedPasses':summary['verifiedAdaptedPasses']}),flush=True)
