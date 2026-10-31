"""Freeze the actual Root runtime delta independently of private preparation."""
from pathlib import Path
import difflib, hashlib, io, json, subprocess, tarfile
root = Path(__file__).resolve().parents[2]
base = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
assert base == '9df839235be651d9408d3eea2b3ee7c3286ab914', base
folders = ['src', 'test', 'bin', 'automation/src', 'automation/test']
archive = subprocess.check_output(['git', 'archive', base, *folders], cwd=root)
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    old = {item.name: tar.extractfile(item).read() for item in tar if item.isfile()}
new = {str(p.relative_to(root)): p.read_bytes() for folder in folders
       for p in (root / folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts}
leaves, chunks = [], []
sha = lambda data: hashlib.sha256(data).hexdigest() if data is not None else None
for name in sorted(old.keys() | new.keys()):
    before, after = old.get(name), new.get(name)
    if before == after:
        continue
    leaves.append({'path': name, 'beforeSHA256': sha(before), 'afterSHA256': sha(after)})
    for line in difflib.unified_diff((before or b'').decode().splitlines(keepends=True),
                                    (after or b'').decode().splitlines(keepends=True),
                                    fromfile='a/' + name if before is not None else '/dev/null',
                                    tofile='b/' + name if after is not None else '/dev/null'):
        chunks.append(line if line.endswith('\n') else line + '\n\\ No newline at end of file\n')
patch = ''.join(chunks).encode()
out = root / 'proposals/phase22-integration/final-root'
out.mkdir(exist_ok=False)
(out / 'integration.patch').write_bytes(patch)
manifest = {'baseCommit': base, 'scope': 'Actual Root source/test/bin/PureScript delta; validation epochs remain separately identified',
            'patchSHA256': sha(patch), 'leaves': leaves}
(out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
result = subprocess.run(['git', 'apply', '--reverse', '--check', str(out / 'integration.patch')], cwd=root, capture_output=True, text=True)
print(json.dumps({'leaves': len(leaves), 'patchSHA256': sha(patch), 'reverseCheckExit': result.returncode, 'stderr': result.stderr}))
raise SystemExit(result.returncode)
