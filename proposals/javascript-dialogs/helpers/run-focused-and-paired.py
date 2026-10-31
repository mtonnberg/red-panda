import hashlib
import json
from pathlib import Path
import re
import subprocess
import time

root = Path(__file__).resolve().parents[1]
steps = []
sdks = [
    ('24.19.0', '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),
    ('24.22.1', '/workspace/shared/rea-tools/node_modules/node/bin/node'),
    ('26.13.0', '/workspace/shared/node26/node_modules/node/bin/node'),
]
guarded = {}
for folder in ['src', 'test', 'native', 'bin', 'scripts', 'helpers']:
    for file in sorted((root / folder).rglob('*')):
        if file.is_file():
            guarded[str(file.relative_to(root))] = hashlib.sha256(file.read_bytes()).hexdigest()
(root / 'evidence/final-owned-before.json').write_text(json.dumps(guarded, indent=2) + '\n')

def run(label, command, timeout, expected_cases=None):
    start = time.monotonic()
    log = root / 'evidence' / (label + '.log')
    with log.open('x') as output:
        completed = subprocess.run(command, cwd=root, stdout=output, stderr=subprocess.STDOUT, timeout=timeout)
    step = {'label': label, 'command': command, 'exitCode': completed.returncode, 'seconds': time.monotonic()-start, 'log': str(log.relative_to(root))}
    if expected_cases is not None:
        raw = log.read_text()
        for field in ['tests', 'pass', 'fail']:
            match = re.search(r'\b' + field + r' (\d+)', raw)
            step[field] = int(match[1]) if match else None
        step['expectedCases'] = expected_cases
    steps.append(step)
    (root / 'evidence/final-controller-status.json').write_text(json.dumps(steps, indent=2) + '\n')
    print(json.dumps(step), flush=True)
    if completed.returncode:
        raise SystemExit(completed.returncode)
    if expected_cases is not None and (step['tests'], step['pass'], step['fail']) != (expected_cases, expected_cases, 0):
        raise SystemExit('Actual case count differs from declared narrow scope')

try:
    for sdk, node in sdks:
        run('final-focused4-node'+sdk, [node, '--experimental-vm-modules', '--test', '--test-concurrency=1', 'test/javascript-dialogs.test.js'], 35, 4)
    node = sdks[1][1]
    for profile, timeout in [('core', 20), ('lifetime', 25), ('authority', 15)]:
        output = 'evidence/final-candidate-'+profile+'24.json'
        run('final-paired-'+profile, [node, '--experimental-vm-modules', 'helpers/paired-dialog-controls.mjs', 'candidate', profile, output], timeout)
finally:
    after = {name: hashlib.sha256((root/name).read_bytes()).hexdigest() for name in guarded}
    changes = [name for name in guarded if guarded[name] != after[name]]
    (root / 'evidence/final-owned-after.json').write_text(json.dumps({'files': after, 'changes': changes}, indent=2) + '\n')
    if changes:
        raise SystemExit('Owned consumed source changed during validation: ' + repr(changes))
