#!/usr/bin/env python3
"""Never called by validation; requires a later concrete reviewed final allowlist."""
from pathlib import Path
import argparse,hashlib,json,os,shutil
ROOT=Path('/workspace/red-panda');DEST=ROOT/'proposals/canonical-style-scalar-r2'
PREFIXES=[Path('/workspace/shared/source31-external-stylesheet-diagnostic-r1'),Path('/workspace/shared/source31-canonical-scalar-r1'),Path('/workspace/shared/source31-canonical-scalar-r2'),Path('/workspace/shared/source31-installed-workflow-r1'),ROOT/'.cache/validation/source31-canonical-scalar-environment']
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def need(ok,message):
 if not ok:raise RuntimeError(message)
def process(pid):
 try:
  t=(Path('/proc')/str(pid)/'stat').read_text();f=t[t.rfind(')')+2:].split();return{'pid':pid,'state':f[0],'startTicks':int(f[19])}
 except FileNotFoundError:return None
p=argparse.ArgumentParser();p.add_argument('--reviewed-allowlist',type=Path,required=True);p.add_argument('--expected-sha256',required=True);p.add_argument('--execute-after-parent-review',action='store_true');a=p.parse_args();need(a.execute_after_parent_review,'Separate archive review/authorization required');need(sha(a.reviewed_allowlist)==a.expected_sha256,'Reviewed final allowlist drift');plan=json.loads(a.reviewed_allowlist.read_text());need(plan['state']=='REVIEWED_AFTER_INSTALLED_FULL_AND_REMAINING_PASS','Static/active/unrun plans cannot build');need(plan['destination']==str(DEST),'Only the reviewed new proof prefix is permitted');need(not DEST.exists(),'Fresh archive prefix required')
for label,stages in [('fullJS',['protocol']),('remaining',['purescript','reference','syntax','strict'])]:
 r=plan['actualClosedWorkflows'][label];need(sha(r['path'])==r['SHA256'],'Actual closed status drift');v=json.loads(Path(r['path']).read_text());need(v['status']=='PASS'and v['inputsUnchanged']is True and v['acceptedSpecStable']is True,'Actual workflow not accepted');need([s['name']for s in v['stages']]==stages,'Incomplete actual stage set')
 for stage in v['stages']:
  need(stage['status']=='PASSED'and stage['exit']==0 and not stage.get('administrativeDeadline')and not stage.get('lateUncaughtActivity'),'Nonpass/incomplete/late activity cannot be archived as accepted')
  for row in stage['ownedObserved']:
   now=process(row['pid']);need(not now or now['startTicks']!=row['startTicks']or now['state']=='Z','Actual owned workflow remains live')
 if label=='fullJS':
  counts=v['stages'][0]['counts']['actualReporterSummary'];need(counts['tests']>0 and counts['pass']==counts['tests']and all(counts[k]==0 for k in['fail','cancelled','skipped','todo']),'Incomplete actual full JS counts')
rows=plan['files'];need(rows and len({r['destination']for r in rows})==len(rows),'Empty/duplicate destinations');verified=[]
for row in rows:
 source=Path(row['source']);rel=Path(row['destination']);need(source.is_file()and not source.is_symlink(),'Only explicit regular source files');need(any(source.is_relative_to(base)for base in PREFIXES),'Unapproved/unrelated/system source path');need(not rel.is_absolute()and'..'not in rel.parts and rel.parts,'Unsafe archive path');need('node_modules'not in source.parts and source.suffix not in['.node','.pyc']and'native/build'not in str(source),'Dependency/native payload excluded');need(source.read_bytes()[:4]!=b'\x7fELF','ELF payload excluded');need(source.stat().st_size==row['bytes']and sha(source)==row['SHA256'],'Actual allowed input changed');verified.append((source,rel,row))
# Every byte is validated before any destination mutation. No tests/services/git.
DEST.mkdir();copied=[]
try:
 for source,rel,row in verified:
  target=DEST/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target);need(sha(target)==row['SHA256']and sha(source)==row['SHA256'],'Copy/source drift');copied.append(row)
 manifest={'state':'EXACT_REVIEWED_BYTE_COPY_OF_CLOSED_EPOCHS','reviewedAllowlistSHA256':a.expected_sha256,'files':copied,'fileCount':len(copied),'bytes':sum(r['bytes']for r in copied),'oldEpochsRetained':True,'gitStaged':False,'published':False};(DEST/'archive-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'destination':str(DEST),'manifestSHA256':sha(DEST/'archive-manifest.json'),'files':len(copied),'bytes':manifest['bytes']}))
except Exception:
 # Preserve a visibly incomplete fresh proof directory; never pretend acceptance.
 (DEST/'INCOMPLETE.json').write_text(json.dumps({'state':'INCOMPLETE_ARCHIVE_COPY','copiedFiles':copied},indent=2)+'\n');raise
