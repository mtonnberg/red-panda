import subprocess, pathlib, time, json, hashlib, os
p = pathlib.Path(__file__).resolve().parent
candidate = pathlib.Path('/workspace/shared/computed-style-context-phase22-20261031')
baseline = pathlib.Path('/workspace/shared/computed-style-context-phase22-baseline-20261031')
node = '/workspace/shared/rea-tools/node_modules/node/bin/node'
out = p / 'focused-matrix-r1'
out.mkdir(exist_ok=False)
started = time.monotonic()
deadline = started + 15
steps = []
def snapshot():
    result = {}
    for label, root in [('candidate', candidate), ('baseline', baseline)]:
        for folder in ['src', 'test', 'native', 'bin', 'scripts', 'oracle']:
            for file in sorted((root / folder).rglob('*')):
                if file.is_file():
                    result[label + '/' + str(file.relative_to(root))] = hashlib.sha256(file.read_bytes()).hexdigest()
    for file in [p / 'run-focused-matrix.py', p / 'candidate-matrix.mjs', *p.glob('*-expression.js'), p.parent / 'programmatic-namespace/interface-expression.js']:
        result[str(file)] = hashlib.sha256(file.read_bytes()).hexdigest()
    return result
before = snapshot()
(out / 'source-before.json').write_text(json.dumps(before, indent=2) + '\n')
for name, cwd, command in [
    ('four-focused', candidate, [node, '--experimental-vm-modules', '--test', '--test-concurrency=1', 'test/computed-style-defaults.test.js']),
    ('before', baseline, [node, '--experimental-vm-modules', str(p / 'candidate-matrix.mjs'), str(baseline), str(out / 'before.json')]),
    ('after', candidate, [node, '--experimental-vm-modules', str(p / 'candidate-matrix.mjs'), str(candidate), str(out / 'after.json')]),
]:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        steps.append({'name': name, 'notRun': '15s aggregate diagnostic deadline'})
        break
    begin = time.monotonic()
    with (out / (name + '.log')).open('xb') as log:
        child = subprocess.Popen(command, cwd=cwd, stdout=log, stderr=subprocess.STDOUT)
        try:
            code = child.wait(timeout=remaining)
            status = {'exit': code}
        except subprocess.TimeoutExpired:
            child.kill()
            child.wait()
            status = {'deadline': True, 'exit': child.returncode}
    steps.append({'name': name, 'command': command, 'seconds': time.monotonic() - begin, **status})
    (out / 'status-partial.json').write_text(json.dumps(steps, indent=2) + '\n')
after = snapshot()
(out / 'source-after.json').write_text(json.dumps(after, indent=2) + '\n')
status = {'steps': steps, 'elapsedSeconds': time.monotonic() - started, 'diagnosticBudgetSeconds': 15, 'sourceUnchanged': before == after, 'inputs': len(before), 'changed': [name for name in before.keys() | after.keys() if before.get(name) != after.get(name)]}
(out / 'status.json').write_text(json.dumps(status, indent=2) + '\n')
print(json.dumps(status))
raise SystemExit(0 if len(steps) == 3 and all(step.get('exit') == 0 for step in steps) and before == after else 1)
