import pathlib,json,tempfile,shutil,hashlib,difflib
r=pathlib.Path('/workspace/red-panda');a=r/'proposals/http-header-precedence';info=json.loads((a/'working.json').read_text());w=pathlib.Path(info['snapshot']);b=pathlib.Path(info['base']);f=pathlib.Path(tempfile.mkdtemp(prefix='red-panda-http-headers-final-'));shutil.copytree(w,f,dirs_exist_ok=True,symlinks=True)
t=(a/'tests.mjs').read_text();start=t.index('const{snapshot}=');end=t.index('\nasync function fixture',start);t=t[:start]+"const{Browser,until}=await import('../src/browser.js');"+t[end:];(f/'test/http-headers.test.js').write_text(t)
patch=[];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
for rel in ['src/browser.js','test/browser.test.js','test/http-headers.test.js']:
 old=(b/rel).read_text()if(b/rel).exists()else'';new=(f/rel).read_text();out=a/'overlay'/rel;out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f/rel,out);patch.extend(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+rel if(b/rel).exists()else'/dev/null',tofile='b/'+rel))
(a/'headers.patch').write_text(''.join(patch));source={p.relative_to(f).as_posix():sha(p)for folder in ['src','bin','native','test','scripts','docs/reference','proposals']for p in sorted((f/folder).rglob('*'))if p.is_file()and not p.is_symlink()};base=json.loads((a/'base.json').read_text());assert all(sha(r/k)==v for k,v in base['sharedDependencySHA256'].items());(a/'frozen.json').write_text(json.dumps({'snapshot':str(f),'baseManifestSHA256':sha(a/'base.json'),'sourceSHA256':source,'sharedDependencySHA256':base['sharedDependencySHA256'],'patchSHA256':sha(a/'headers.patch')},indent=2)+'\n')
for name,node in [('frozen-launch.sh','/workspace/shared/rea-tools/node_modules/.bin/node'),('frozen-node26-launch.sh','/workspace/shared/node26/node_modules/.bin/node')]:
 p=a/name;p.write_text('#!/bin/sh\nexec '+node+' --experimental-vm-modules '+str(f)+'/bin/red-panda.js "$@"\n');p.chmod(0o755)
print(f,flush=True)
