from pathlib import Path
import json,hashlib,difflib,subprocess,shutil
r=Path(__file__).resolve().parent.parent;e=r/'evidence';base=r/'base';candidate=r/'candidate'
sha=lambda b:hashlib.sha256(b).hexdigest()
checks=json.loads((e/'static-composition-checks.json').read_text())
paths=checks['existingChanged']+checks['newPaths']
prev={p:(base/p).read_bytes() for p in paths if (base/p).exists()}
steps=[]
for n,name in enumerate(['foundations','manual19','Document','manualDocument9'],1):
 patch=e/f'tranche-{n}-{name}.patch';stage=r/f'static-stage-{n}'
 assert not stage.exists(),stage
 stage.mkdir()
 for p,b in prev.items():
  q=stage/p;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b)
 # Cumulative patches apply to the unchanged base, not previous stages.
 cumulative=r/f'static-cumulative-{n}';cumulative.mkdir()
 for p in checks['existingChanged']:
  q=cumulative/p;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes((base/p).read_bytes())
 check=subprocess.run(['git','apply','--check',str(patch)],cwd=cumulative,text=True,capture_output=True)
 assert check.returncode==0,(patch,check.stderr)
 apply=subprocess.run(['git','apply',str(patch)],cwd=cumulative,text=True,capture_output=True)
 assert apply.returncode==0,(patch,apply.stderr)
 current={str(p.relative_to(cumulative)):p.read_bytes() for p in cumulative.rglob('*') if p.is_file()}
 inc=''
 changed=[]
 for p in sorted(set(prev)|set(current)):
  a,b=prev.get(p,b''),current.get(p,b'')
  if a==b:continue
  changed.append(p)
  inc+=''.join(difflib.unified_diff(a.decode().splitlines(keepends=True),b.decode().splitlines(keepends=True),fromfile='a/'+p if p in prev else '/dev/null',tofile='b/'+p))
 ip=e/f'incremental-{n}-{name}.patch';ip.write_text(inc)
 icheck=subprocess.run(['git','apply','--check',str(ip)],cwd=stage,text=True,capture_output=True)
 assert icheck.returncode==0,(ip,icheck.stderr)
 iapply=subprocess.run(['git','apply',str(ip)],cwd=stage,text=True,capture_output=True)
 assert iapply.returncode==0,(ip,iapply.stderr)
 actual={str(p.relative_to(stage)):p.read_bytes() for p in stage.rglob('*') if p.is_file()}
 assert actual==current,(n,actual.keys(),current.keys())
 steps.append({'stage':n,'name':name,'cumulativePatch':str(patch.relative_to(r)),'cumulativeSHA256':sha(patch.read_bytes()),'cumulativeCheckExit':check.returncode,'incrementalPatch':str(ip.relative_to(r)),'incrementalSHA256':sha(ip.read_bytes()),'incrementalCheckExit':icheck.returncode,'changedPathsFromPreviousStage':changed,'runtimeExecuted':False})
 prev=current
for p in paths:assert prev[p]==(candidate/p).read_bytes(),p
before=json.loads((e/'root-before.json').read_text());root=Path(before['root'])
current={p:sha((root/p).read_bytes()) if (root/p).is_file() else None for p in before['files']}
assert current==before['files'],'Root content changed from static copy epoch'
(e/'root-after-static.json').write_text(json.dumps({'root':str(root),'files':current,'count':len(current),'unchanged':True,'runtimeExecutedByThisAgent':False},indent=2)+'\n')
(e/'stage-checks.json').write_text(json.dumps({'runtimeExecuted':False,'stages':steps,'finalCandidateMatchesAll16ChangedPaths':True,'all1846CurrentRootFilesUnchanged':True},indent=2)+'\n')
print(json.dumps({'stages':[{'stage':x['stage'],'paths':len(x['changedPathsFromPreviousStage']),'incrementalSHA256':x['incrementalSHA256']} for x in steps],'RootUnchanged':len(current),'runtimeExecuted':False}))
