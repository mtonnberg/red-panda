"""Static copies only. Does not import JS, load addons, run tests or edit Root."""
from pathlib import Path
import hashlib,json,shutil,sys
P=Path(__file__).parent
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
if len(sys.argv)!=2:raise SystemExit('usage: python3 prepare-runtime-derivative.py NEW_OWNED_DIRECTORY')
target=Path(sys.argv[1]).absolute()
assert target.is_relative_to(Path('/workspace/shared')) and not target.exists()
manifest=json.loads((P/'handoff/manifest.json').read_text())
source=json.loads((P/'handoff/source-only-inputs.json').read_text())
assert all(sha(P/'source-only-candidate'/n)==v for n,v in source.items())
assert sha(P/'combined-runtime6-selection.json')==manifest['nativeSelectionSHA256']
selection=json.loads((P/'combined-runtime6-selection.json').read_text())
assert sha(P/'source-only-candidate/native/runtime.cc')==selection['requiredCPPSourceSHA256']
shutil.copytree(P/'source-only-candidate',target,symlinks=True)
records=[]
for record in selection['artifacts']:
 path=record['installTarget'];original=P/'selected-runtime-artifacts'/path
 assert sha(original)==record['sourceSHA256'] and not (target/path).exists()
 shutil.copy2(original,target/path)
 records.append({'path':path,'SHA256':sha(target/path),'selectedCPP':selection['requiredCPPSourceSHA256']})
assert len(records)==6
assert all(sha(target/n)==v for n,v in source.items())
(target/'static-runtime-selection.json').write_text(json.dumps({'state':'ACTUAL_BUILT_ARTIFACTS_COPIED_NOT_LOADED_COMPOSED_RUNTIME_UNRUN','sourceManifestSHA256':sha(P/'handoff/manifest.json'),'selectionSHA256':sha(P/'combined-runtime6-selection.json'),'copied6':records,'source631Unchanged':True},indent=2)+'\n')
print(target)
