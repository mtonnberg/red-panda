# Rebase only the captured heap notification hunks onto a read-only Root snapshot.
from pathlib import Path
import json,hashlib,subprocess,tempfile,difflib,shutil
root=Path('/workspace/red-panda');proposal=root/'proposals/runtime-heap-worlds';metadata=json.loads((proposal/'integration-current-manifest.json').read_text());copy=Path(tempfile.mkdtemp(prefix='red-panda-heap-current-merge-'));baseline={}
for name in metadata['rootSourceSHA256']:
 value=(root/name).read_bytes();baseline[name]=value;p=copy/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(value)
if any((root/str(p.relative_to(proposal/'leaf'))).exists()for p in (proposal/'leaf').rglob('*')if p.is_file()):raise RuntimeError('Heap leaf already installed; audit with git apply --reverse --check instead of rebasing')
result=subprocess.run(['patch','--forward','--batch','-p1','-d',str(copy)],input=(proposal/'integration-current-58.patch').read_text(),capture_output=True,text=True)
(proposal/'latest-merge-log.txt').write_text(result.stdout+result.stderr)
if result.returncode:raise RuntimeError('Current Root anchors changed; inspect owned merge copy '+str(copy))
output=[]
for name,before in baseline.items():output.extend(difflib.unified_diff(before.decode().splitlines(True),(copy/name).read_text().splitlines(True),fromfile='a/'+name,tofile='b/'+name))
new=[]
for p in sorted((proposal/'leaf').rglob('*')):
 if not p.is_file():continue
 name=str(p.relative_to(proposal/'leaf'))
 if(root/name).exists():raise RuntimeError('New leaf already exists: '+name)
 q=copy/name;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(p.read_bytes());new.append(name);output.extend(difflib.unified_diff([],p.read_text().splitlines(True),fromfile='/dev/null',tofile='b/'+name))
artifact=proposal/'integration-current.patch';artifact.write_text(''.join(output));checked=subprocess.run(['git','apply','--check',str(artifact)],cwd=root,capture_output=True,text=True);(proposal/'integration-current-check.txt').write_text(checked.stdout+checked.stderr+'exitCode='+str(checked.returncode)+'\n')
if checked.returncode:raise RuntimeError(checked.stderr)
metadata.update(rootSourceSHA256={p:hashlib.sha256(b).hexdigest()for p,b in baseline.items()},mergeCopy=str(copy),newFiles=new,patchSHA256=hashlib.sha256(artifact.read_bytes()).hexdigest(),separateNewTargetDeltaSHA256=hashlib.sha256((proposal/'newtarget-precedence.patch').read_bytes()).hexdigest(),gitApplyCheckPassed=True)
(proposal/'integration-current-manifest.json').write_text(json.dumps(metadata,indent=2)+'\n');print(metadata['patchSHA256'])
