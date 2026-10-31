from pathlib import Path
import difflib,hashlib,json,subprocess
p=Path(__file__).parent;r=p.parent.parent;s=Path('/workspace/shared/sanitizer-20261031');sha=lambda b:hashlib.sha256(b).hexdigest();files=['src/sanitizer-policy.js','src/sanitizer-config.js','src/sanitizer.js','src/shadow.js','src/browser.js','src/world-sessions.js','test/sanitizer.test.js'];patch=[];records={}
for rel in files:
 source=s/rel;original=r/rel;before=original.read_text() if original.exists() else '';after=source.read_text();dest=p/'leaves'/rel;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(after)
 patch.extend(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+rel if original.exists() else '/dev/null',tofile='b/'+rel))
 records[rel]={'baseSHA256':sha(before.encode()) if original.exists() else None,'finalSHA256':sha(after.encode()),'leaf':str(dest.relative_to(p))}
artifact=p/'integration-current.patch';artifact.write_text(''.join(patch))
manifest={'root':str(r),'scratch':str(s),'rootCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=r,text=True).strip(),'patchSHA256':sha(artifact.read_bytes()),'files':records,'nativeOrDependencyChanges':False}
(p/'integration-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');print(manifest['patchSHA256'])
