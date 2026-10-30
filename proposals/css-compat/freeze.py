import json, pathlib, shutil, tempfile, hashlib, difflib
root=pathlib.Path('/workspace/red-panda'); area=root/'proposals/css-compat'; current=json.loads((area/'proposal.json').read_text()); base=pathlib.Path(current['base']); working=pathlib.Path(current['snapshot']); frozen=pathlib.Path(tempfile.mkdtemp(prefix='red-panda-css-phase1-'))
for name in ['src','bin','native']:shutil.copytree(working/name,frozen/name,symlinks=True)
for name in ['package.json','package-lock.json']:shutil.copy2(working/name,frozen/name)
(frozen/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
changed=[];patch=[]
for proposed in sorted((frozen/'src').glob('*.js')):
 rel=proposed.relative_to(frozen).as_posix(); original=base/rel; old=original.read_text() if original.exists() else ''; new=proposed.read_text()
 if old==new:continue
 changed.append(rel);target=area/'overlay'/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(proposed,target)
 patch.extend(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+rel if original.exists() else '/dev/null',tofile='b/'+rel))
tests=(area/'tests.mjs').read_text();tests=tests.replace("import {readFile} from 'node:fs/promises';\n",'');tests=tests.replace("const {snapshot}=JSON.parse(await readFile(new URL('./proposal.json',import.meta.url)));\nconst load=name=>import(snapshot+'/src/'+name+'.js');","const load=name=>import('../src/'+name+'.js');")
(area/'overlay/test').mkdir(parents=True,exist_ok=True);(area/'overlay/test/css-compat.test.js').write_text(tests)
patch.extend(difflib.unified_diff([],tests.splitlines(True),fromfile='/dev/null',tofile='b/test/css-compat.test.js'))
(area/'phase1.patch').write_text(''.join(patch))
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest={p.relative_to(frozen).as_posix():sha(p) for folder in ['src','bin','native'] for p in sorted((frozen/folder).rglob('*')) if p.is_file() and not p.is_symlink()};manifest.update({name:sha(frozen/name) for name in ['package.json','package-lock.json']})
(area/'phase1.json').write_text(json.dumps({'snapshot':str(frozen),'base':str(base),'changedSourceFiles':changed,'sourceManifest':manifest,'patchSHA256':sha(area/'phase1.patch')},indent=2)+'\n')
(area/'proposal.json').write_text(json.dumps({'base':str(base),'snapshot':str(frozen),'scope':'Frozen CSS phase1 independent proposal. Broader layout remains separate.'},indent=2)+'\n')
(area/'launch.sh').write_text('#!/bin/sh\nexec /workspace/shared/rea-tools/node_modules/.bin/node --experimental-vm-modules '+str(frozen)+'/bin/red-panda.js "$@"\n')
print(frozen);print('\n'.join(changed))
