from pathlib import Path
import argparse,subprocess,tarfile,io,json,hashlib,shutil,shlex,os
r=Path(__file__).resolve().parent;parser=argparse.ArgumentParser();parser.add_argument('--ref',required=True);a=parser.parse_args();root=Path('/workspace/red-panda');candidate=r/'candidate';assert not candidate.exists(),'Never mutate an already frozen candidate';commit=subprocess.run(['git','-C',str(root),'rev-parse',a.ref+'^{commit}'],check=True,capture_output=True,text=True).stdout.strip();plan=json.loads((r/'plan.json').read_text());node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
# The external driver contract stays explicitly separate from app source. If a
# future production checkpoint changes these helpers, request a new named plan.
for name,expected in plan['helperSourceSHA256'].items():
 current=subprocess.run(['git','-C',str(root),'show',commit+':'+name],check=True,capture_output=True).stdout
 assert hashlib.sha256(current).hexdigest()==expected,('Production helper drift requires separate reviewed adaptation',name)
paths=['src','bin','scripts','test','native','package.json','package-lock.json'];archive=subprocess.run(['git','-C',str(root),'archive',commit,*paths],check=True,capture_output=True).stdout;candidate.mkdir()
with tarfile.open(fileobj=io.BytesIO(archive),mode='r:')as tar:tar.extractall(candidate,filter='data')
# Copy real native artifacts only when both compiled source and actual binary
# match the original build manifest; never rebuild or relabel an old artifact.
artifacts={}
for manifest in sorted((root/'native/build').rglob('*.node.json')):
 data=json.loads(manifest.read_text());binary=manifest.with_suffix('');stem=binary.name.removesuffix('.node');source={'runtime':'runtime.cc','heap-query':'heap-query.cc','collections':'collections.cc'}.get(stem);assert source,stem
 assert sha(candidate/'native'/source)==data['sourceSHA256'],('Native source does not match selected production commit',source)
 assert sha(binary)==data['binarySHA256'],('Native binary differs from actual manifest',str(binary))
 for file in [binary,manifest]:
  relative=file.relative_to(root);target=candidate/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,target);artifacts[str(relative)]=sha(target)
assert len(artifacts)==18,('Expected all3 matching SDK artifact sets',len(artifacts))
shutil.copytree(root/'node_modules',candidate/'node_modules',symlinks=False,ignore=shutil.ignore_patterns('.git'))
launcher=candidate/'red-panda-launcher';launcher.write_text('#!/bin/sh\nexec '+shlex.quote(str(node))+' --experimental-vm-modules '+shlex.quote(str(candidate/'bin/red-panda.js'))+' "$@"\n');launcher.chmod(0o755);(candidate/'.source-commit').write_text(commit+'\n');(r/'harness/node_modules').symlink_to(candidate/'node_modules',target_is_directory=True)
branding={}
for name in ['src/browser.js','src/navigator.js','package.json']:
 file=candidate/name;branding[name]={'SHA256':sha(file),'sourceLines':[{'line':index+1,'text':line}for index,line in enumerate(file.read_text().splitlines())if('this.userAgent = browser.options.userAgent'in line or "brand: 'RedPanda'"in line or '"version"'in line)]}
(r/'controls/current-production-branding-source.json').write_text(json.dumps({'kind':'STATIC selected exact production source, not runtime observation','productionCommit':commit,'sources':branding,'publicUAOverrideAppliedByRunner':False},indent=2)+'\n')
# Exact graph below includes every copy, helper, external fixture/support byte,
# registration/configuration source, actual addon and Node executable consumed.
files=[p for directory in [candidate,r/'harness',r/'fixtures',r/'maps',r/'controls']for p in directory.rglob('*')if p.is_file()];files.extend([r/'plan.json',r/'prepare-plan.py',r/'freeze-candidate.py',r/'run-census.py',node]);graph={str(p):sha(p)for p in sorted(set(files))};source_root=Path(json.loads((r/'maps/registration-map.json').read_text())['sourceRoot']);map=json.loads((r/'maps/registration-map.json').read_text());pinned={name:sha(source_root/name)for name in sorted(set(map['sourceSHA256'])|{'src/browser/Runner.zig'})}
for name,expected in map['sourceSHA256'].items():assert pinned[name]==expected,(name,'Pinned contract drift')
manifest={'schemaVersion':1,'snapshotKind':'Immutable no-Git production export plus separate disclosed external harness','productionCommit':commit,'productionRefRequested':a.ref,'productionAppByteAuthority':'git archive src/bin/scripts/test/native/package from selected exact commit; only real matching ignored native artifacts/dependencies copied separately','node':{'path':str(node),'SHA256':sha(node),'versionExpected':'24.22.1; actualversion runtime verification required'},'launcher':{'path':str(launcher),'SHA256':sha(launcher)},'nativeArtifacts':artifacts,'dependencyPackaging':'actual installed runtime bytes copied; .git metadata deliberately omitted, no new Git root','graphSHA256':graph,'pinnedContractSourceSHA256':pinned,'registrationMapSHA256':sha(r/'maps/registration-map.json'),'publicBranding':'Actual production UA/client hints; no override or forged platform value','plannedRows':455,'concurrency':1,'runtimeStatus':'UNRUN; freeze only reads/copies/hashes files; no Node/network/build'};(r/'candidate-frozen.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'productionCommit':commit,'graphInputs':len(graph),'artifacts':len(artifacts),'runtimeStatus':'UNRUN'}))
