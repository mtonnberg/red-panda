import pathlib,json,shutil,tempfile,hashlib,difflib
r=pathlib.Path('/workspace/red-panda');a=r/'proposals/css-layout';info=json.loads((a/'proposal.json').read_text());base=pathlib.Path(info['base']);working=pathlib.Path(info['snapshot']);f=pathlib.Path(tempfile.mkdtemp(prefix='red-panda-flow-frozen-'))
for n in ['src','bin','native','test']:shutil.copytree(working/n,f/n,symlinks=True)
for n in ['package.json','package-lock.json']:shutil.copy2(working/n,f/n)
(f/'node_modules').symlink_to(r/'node_modules',target_is_directory=True);(f/'docs').mkdir();(f/'docs/reference').symlink_to(r/'docs/reference',target_is_directory=True)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();changed=[];patch=[]
for path in sorted((f/'src').glob('*.js')):
 rel=path.relative_to(f).as_posix();old=base/rel;before=old.read_text()if old.exists()else'';after=path.read_text()
 if before==after:continue
 changed.append(rel);out=a/'overlay'/rel;out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,out)
 patch.extend(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+rel if old.exists()else'/dev/null',tofile='b/'+rel))
test=(a/'tests.mjs').read_text();test=test.replace("import{readFile}from'node:fs/promises';", "import{readFile}from'node:fs/promises';")
start=test.index("const{snapshot}=");end=test.index("const[{installStyles}",start);test=test[:start]+"const load=name=>import('../src/'+name+'.js');"+test[end:]
test=test.replace("new URL('./'+source,import.meta.url)","new URL('../proposals/css-layout/'+source,import.meta.url)").replace("new URL('./'+evidence,import.meta.url)","new URL('../proposals/css-layout/'+evidence,import.meta.url)")
(a/'overlay/test').mkdir(parents=True,exist_ok=True);(a/'overlay/test/flow-layout.test.js').write_text(test);patch.extend(difflib.unified_diff([],test.splitlines(True),fromfile='/dev/null',tofile='b/test/flow-layout.test.js'));(a/'phase2.patch').write_text(''.join(patch))
source={p.relative_to(f).as_posix():sha(p)for folder in ['src','bin','native','test']for p in sorted((f/folder).rglob('*'))if p.is_file()and not p.is_symlink()};source.update({n:sha(f/n)for n in ['package.json','package-lock.json']})
deps={p.relative_to(r).as_posix():sha(p)for folder in ['jsdom/lib','cssstyle/lib','rrweb-cssom/lib','nwsapi/src','symbol-tree/lib']for p in sorted((r/'node_modules'/folder).rglob('*.js'))}
(a/'frozen.json').write_text(json.dumps({'base':str(base),'snapshot':str(f),'changedSourceFiles':changed,'sourceManifest':source,'sharedDependencyManifest':deps,'patchSHA256':sha(a/'phase2.patch'),'note':'Shared dependency source closure digests must remain unchanged throughout validation. Source and both native helpers are physical independent copies.'},indent=2)+'\n')
(a/'proposal.json').write_text(json.dumps({'base':str(base),'snapshot':str(f)},indent=2)+'\n');(a/'launch.sh').write_text('#!/bin/sh\nexec /workspace/shared/rea-tools/node_modules/.bin/node --experimental-vm-modules '+str(f)+'/bin/red-panda.js "$@"\n');print(f);print('\n'.join(changed))
