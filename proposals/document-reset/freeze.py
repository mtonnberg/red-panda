"""Freeze the already tested proposal sources without rebuilding/rebasing."""
import hashlib
import json
from pathlib import Path
import shutil

HERE = Path(__file__).resolve().parent
manifest_path = HERE / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
snapshot = Path(manifest['snapshot'])
for name, metadata in manifest['files'].items():
    source = snapshot / name
    if hashlib.sha256(source.read_bytes()).hexdigest() != metadata['proposedSHA256']:
        raise RuntimeError(f'Tested source changed: {name}')
    target = HERE / 'overlay' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
manifest['integrationPatchSHA256'] = hashlib.sha256((HERE / 'integration.patch').read_bytes()).hexdigest()
manifest['testsSHA256'] = hashlib.sha256((HERE / 'tests.mjs').read_bytes()).hexdigest()
manifest['overlayFrozen'] = True
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
if (HERE / 'existing-tests.log').exists():
    shutil.copy2(HERE / 'existing-tests.log', HERE / 'existing-tests.txt')
print(json.dumps({'frozenFiles': len(manifest['files']), 'patchSHA256': manifest['integrationPatchSHA256']}))
