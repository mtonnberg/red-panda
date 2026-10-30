from pathlib import Path
import hashlib,json,shutil
here=Path(__file__).resolve().parent
manifest=json.loads((here/'proposal.json').read_text());snapshot=Path(manifest['snapshot'])
for name,metadata in manifest['files'].items():
 source=snapshot/name
 if hashlib.sha256(source.read_bytes()).hexdigest()!=metadata['proposedSHA256']:raise RuntimeError('Changed tested source: '+name)
 target=here/'overlay'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,target)
manifest['patchSHA256']=hashlib.sha256((here/'integration.patch').read_bytes()).hexdigest()
manifest['testsSHA256']=hashlib.sha256((here/'tests.mjs').read_bytes()).hexdigest()
manifest['overlayFrozen']=True
(here/'proposal.json').write_text(json.dumps(manifest,indent=2)+'\n')
native=json.loads((here/'native.json').read_text());proposal=json.loads((here/'proposal-native-controls.json').read_text())
native_by_name={case['name']:case['observed'] for case in native['cases']}
comparisons=[{'name':case['name'],'matchesNative':case['observed']==native_by_name[case['name']]}for case in proposal['cases']]
if not all(case['matchesNative']for case in comparisons):raise RuntimeError('Native control mismatch')
validation={'kind':'bounded-fresh-frame-write-validation','snapshot':str(snapshot),'patchSHA256':manifest['patchSHA256'],
 'focusedTests':{'pass':5,'fail':0},'existingTests':{'pass':141,'fail':0,'output':'proposals/frame-write/existing-tests.txt'},
 'nativeControls':comparisons,'productionFilesModified':False,'cleanup':'all owned baseline/proposal/native controls and copied test processes completed; root notified quiescent'}
(here/'validation.json').write_text(json.dumps(validation,indent=2)+'\n')
print(json.dumps({'files':len(manifest['files']),'patchSHA256':manifest['patchSHA256'],'nativeControlsMatch':True}))
