"""Export the private composition without treating it as accepted runtime code."""
from pathlib import Path
import difflib
import hashlib
import json
import subprocess

root = Path('/workspace/red-panda')
candidate = Path('/workspace/shared/red-panda-phase22-preparation')
output = root / 'proposals/phase22-integration/current-composed'
base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
assert base == '9df839235be651d9408d3eea2b3ee7c3286ab914', base
assert not subprocess.check_output(['git', 'diff', '--name-only', 'HEAD'], cwd=root)
folders = ['src', 'test', 'automation/src', 'automation/test']
paths = set()
for folder in folders:
    paths.update(str(p.relative_to(candidate)) for p in (candidate / folder).rglob('*')
                 if p.is_file() and '__pycache__' not in p.parts)
tracked = subprocess.check_output(['git', 'ls-files', '-z', *folders], cwd=root).decode().split('\0')
paths.update(p for p in tracked if p)
leaves, chunks = [], []
for name in sorted(paths):
    old = (root / name).read_bytes() if (root / name).is_file() else None
    new = (candidate / name).read_bytes() if (candidate / name).is_file() else None
    if old == new:
        continue
    leaves.append({'path': name,
                   'beforeSHA256': hashlib.sha256(old).hexdigest() if old is not None else None,
                   'afterSHA256': hashlib.sha256(new).hexdigest() if new is not None else None})
    for line in difflib.unified_diff((old or b'').decode().splitlines(keepends=True),
                                     (new or b'').decode().splitlines(keepends=True),
                                     fromfile='a/' + name if old is not None else '/dev/null',
                                     tofile='b/' + name if new is not None else '/dev/null'):
        chunks.append(line if line.endswith('\n') else line + '\n\\ No newline at end of file\n')
patch = ''.join(chunks).encode()
output.mkdir(exist_ok=True)
(output / 'integration.patch').write_bytes(patch)
manifest = {'baseCommit': base,
            'status': 'PRIVATE PREPARATION; acceptance runs and Root application remain separate',
            'candidate': str(candidate), 'patchSHA256': hashlib.sha256(patch).hexdigest(),
            'leaves': leaves}
(output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
check = subprocess.run(['git', 'apply', '--check', str(output / 'integration.patch')], cwd=root,
                       capture_output=True, text=True)
print(json.dumps({'leaves': len(leaves), 'patchSHA256': manifest['patchSHA256'],
                  'applyCheckExit': check.returncode, 'stderr': check.stderr}))
raise SystemExit(check.returncode)
