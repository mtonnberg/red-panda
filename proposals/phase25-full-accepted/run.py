"""Run a new, immutable integration epoch; never rewrite earlier outcomes."""
from pathlib import Path
import hashlib
import json
import os
import resource
import shutil
import signal
import subprocess
import sys
import time

root = Path('/workspace/red-panda')
out = root / '.cache/validation' / sys.argv[1]
out.mkdir(exist_ok=False)
native = Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux')
node = Path('/workspace/shared/rea-tools/node_modules/node/bin/node')
assert os.path.samefile(shutil.which('node'), node), 'Use the declared Node 24.22.1 executable'

def save(name, value):
    (out / name).write_text(json.dumps(value, indent=2) + '\n')

def snapshot():
    folders = ['src', 'test', 'native', 'bin', 'scripts', 'helpers',
               'node_modules', 'automation/src', 'automation/test', 'automation/.spago/p', 'oracle',
               'docs/reference', '.cache/lightpanda-reference/browser-948d773786/src/browser/tests']
    paths = {p for name in folders for p in (root / name).rglob('*')
             if p.is_file() and '__pycache__' not in p.parts and '.git' not in p.parts}
    paths.update(root / name for name in ['package.json', 'package-lock.json',
                                        'automation/spago.yaml', 'automation/spago.lock',
                                        'automation/package-set.json', 'automation/package-set-provenance.json'])
    result = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in sorted(paths)}
    result['external:Native'] = hashlib.sha256(native.read_bytes()).hexdigest()
    result['external:Node'] = hashlib.sha256(node.read_bytes()).hexdigest()
    result['controller:' + str(Path(__file__).resolve())] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    assert result['external:Native'] == '9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f'
    return result

def resources():
    result = {}
    for name in ['cpu.max', 'cpu.stat', 'memory.current', 'pids.current']:
        p = Path('/sys/fs/cgroup') / name
        try:
            result[name] = p.read_text()
        except OSError as error:
            result[name] = {'unavailable': str(error)}
    return result

before = snapshot()
save('inputs-before.json', before)
save('environment.json', {
    'node': subprocess.check_output(['node', '--version'], text=True).strip(),
    'sourceNote': 'Snapshot binds this epoch; earlier failed epochs remain unchanged.',
    'actualBudgets': 'Original test/API/assertion/heap deadlines unchanged.',
    'outerCaps': 'Administrative process cleanup limits only.',
    'NODE_USE_ENV_PROXY': os.environ.get('NODE_USE_ENV_PROXY'),
    'NO_PROXY': os.environ.get('NO_PROXY'),
})
steps = [
    ('protocol', ['npm', 'run', 'test:protocol'], 1800),
    ('purescript', ['npm', 'run', 'test:puppeteer'], 180),
    ('reference', ['npm', 'run', 'test:reference', '--', str(native)], 180),
    ('syntax', ['npm', 'run', 'check'], 180),
    ('strict', ['npm', 'run', 'build:automation', '--', '--strict', '--pedantic-packages'], 180),
]
status = []
def disable_core_dumps():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

try:
    for name, command, cap in steps:
        started = time.monotonic()
        item = {'name': name, 'command': command, 'resourcesBefore': resources()}
        with (out / (name + '.log')).open('xb') as log:
            child = subprocess.Popen(command, cwd=root, stdout=log,
                                     stderr=subprocess.STDOUT, start_new_session=True,
                                     preexec_fn=disable_core_dumps)
            item['pid'] = child.pid
            try:
                item['exit'] = child.wait(timeout=cap)
                item['administrativeDeadline'] = False
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                item['exit'] = child.wait()
                item['administrativeDeadline'] = True
        item.update(seconds=time.monotonic() - started, resourcesAfter=resources())
        status.append(item)
        save('status.json', status)
        print(json.dumps({k: item[k] for k in ['name', 'exit', 'seconds', 'administrativeDeadline']}), flush=True)
        assert snapshot() == before, 'Guarded input changed during validation'
finally:
    after = snapshot()
    save('inputs-after.json', after)
    save('source-stable.json', {'unchanged': before == after, 'inputs': len(before),
                              'changed': sorted(k for k in before.keys() | after.keys()
                                                if before.get(k) != after.get(k))})

raise SystemExit(0 if len(status) == len(steps) and before == after and
                 all(s['exit'] == 0 and not s['administrativeDeadline'] for s in status) else 1)
