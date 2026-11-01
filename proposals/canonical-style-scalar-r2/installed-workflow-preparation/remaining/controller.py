"""UNRUN template. Full installed-Root JS only after reviewed acceptance/integration."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import resource
import shutil
import signal
import subprocess
import time
from full_source_collection import collect

ROOT = Path('/workspace/red-panda')
HERE = Path(__file__).resolve().parent
ORIGINAL = ROOT / 'proposals/phase26-full-file-element-url/controller.py'
NODE = Path('/workspace/shared/rea-tools/node_modules/node/bin/node')
NATIVE = Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux')
RENDER = Path('/workspace/shared/red-panda-render')
RUNTIME_SOURCE = '95bba30f4013139999dc9b843b45bdb5ddc1802145431fc6386bddc85975cd36'
RUNTIMES = {
    '24.22.1': 'fb4a1e1cbb11c88d27135ec792ab898bc0ead45ecf3556a39ad5fad04418a33b',
    '24.19.0': '10f7c6b539974ad5632a763a7211c6d5743696f34dba885c068cb91c42409f71',
    '26.13.0': 'b8f038cb2f824b3622384002cd6cfad7826b2cee4f9738598e496beca79498e8',
}
STEPS = [
    ('purescript', ['npm', 'run', 'test:puppeteer'], 180),
    ('reference', ['npm', 'run', 'test:reference', '--', str(NATIVE)], 180),
    ('syntax', ['npm', 'run', 'check'], 180),
    ('strict', ['npm', 'run', 'build:automation', '--', '--strict', '--pedantic-packages'], 180),
]
EXCLUDED_SERVICE = None
EXCLUDED_SERVICE_AUTHORITY = None
NODE_SHA256 = 'e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb'

def sha(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()

def save(path, value):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)

def files(folder):
    return (p for p in folder.rglob('*') if p.is_file() and
            '__pycache__' not in p.parts and '.git' not in p.parts)

def environment():
    env = os.environ.copy()
    env['PATH'] = '/workspace/shared/red-panda-render/bin:/workspace/shared/rea-tools/node_modules/.bin:' + env.get('PATH', '')
    env['NPM_CONFIG_CACHE'] = '/workspace/shared/npm-cache'
    env['NODE_USE_ENV_PROXY'] = '1'
    bypass = ','.join(filter(None, [env.get('NO_PROXY'), env.get('no_proxy'),
        '0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]']))
    env['NO_PROXY'] = env['no_proxy'] = bypass
    return env

def snapshot(env):
    folders = ['src', 'test', 'native', 'bin', 'scripts', 'helpers', 'node_modules',
               'automation/src', 'automation/test', 'automation/.spago/p', 'oracle',
               'docs/reference', '.cache/lightpanda-reference/browser-948d773786/src/browser/tests']
    paths = {p for name in folders for p in files(ROOT / name)}
    paths.update(ROOT / name for name in ['package.json', 'package-lock.json',
        'automation/spago.yaml', 'automation/spago.lock', 'automation/package-set.json',
        'automation/package-set-provenance.json'])
    paths.update([NATIVE, NODE, ORIGINAL, Path(__file__).resolve(), HERE / 'plan.json'])
    paths.update(Path(path) for path in ACTIVE_ADDITIONAL_INPUTS)
    # External npm implementation and actual render dependency bytes, not generated outputs.
    npm = Path(shutil.which('npm', path=env['PATH'])).resolve()
    paths.update(files(npm.parent.parent))
    paths.update(files(RENDER / 'bin'))
    paths.update(files(RENDER / 'lib'))
    for key in ['NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE']:
        if env.get(key):
            paths.add(Path(env[key]))
    # Pin the actual executable behind render/python symlinks as well.
    paths.add((RENDER / 'bin/python3').resolve())
    return {str(p): {'sha256': sha(p), **({'target': str(p.resolve())} if p.is_symlink() else {})}
            for p in sorted(paths)}

def identity(pid):
    try:
        raw = (Path('/proc') / str(pid) / 'stat').read_text()
        fields = raw[raw.rfind(')') + 2:].split()
        return {'pid': int(pid), 'state': fields[0], 'parent': int(fields[1]),
                'pgrp': int(fields[2]), 'sid': int(fields[3]), 'startTicks': int(fields[19])}
    except (OSError, ValueError, IndexError):
        return None

def members(leader):
    if leader==EXCLUDED_SERVICE:raise RuntimeError('Production service cannot become full-JS owned leader')
    return [row for p in Path('/proc').iterdir() if p.name.isdigit() and
            (row := identity(p.name)) and (row['pgrp'] == leader or row['sid'] == leader)]

def live(rows):
    return [row for row in rows if row['state'] != 'Z']

def observed_remainder(leader, owned):
    actuals = {(row['pid'], row['startTicks']): row for row in members(leader)}
    for pid, start in owned:
        actual = identity(pid)
        if actual and actual['startTicks'] == start:
            actuals[(pid, start)] = actual
    return list(actuals.values())

def cleanup(leader, owned):
    # Only exact observed PID/start identities in this child's new group/session.
    for sig, cap in [(signal.SIGTERM, 3), (signal.SIGKILL, 3)]:
        for row in members(leader):
            owned[(row['pid'], row['startTicks'])] = row
        for (pid, start), prior in list(owned.items()):
            actual = identity(pid)
            if actual and actual['startTicks'] == start and actual['state'] != 'Z':
                try:
                    if pid==EXCLUDED_SERVICE:raise RuntimeError('Never signal frozen excluded production service identity')
                    os.kill(pid, sig)
                except ProcessLookupError:
                    pass
        end = time.monotonic() + cap
        while time.monotonic() < end:
            if not live(observed_remainder(leader, owned)):
                return observed_remainder(leader, owned)
            time.sleep(.05)
    return observed_remainder(leader, owned)

def resources():
    values = {}
    for name in ['cpu.max', 'cpu.stat', 'memory.current', 'pids.current']:
        try:
            values[name] = (Path('/sys/fs/cgroup') / name).read_text()
        except OSError as error:
            values[name] = {'unavailable': str(error)}
    return values

def observed_counts(name, log):
    text = log.read_text(errors='replace')
    if name == 'protocol':
        values = {}
        for key in ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']:
            matches = re.findall(r'(?m)^[ℹ#] ' + key + r' (\d+)\s*$', text)
            if matches:
                values[key] = int(matches[-1])
        return {'actualReporterSummary': values, 'rawLogAuthoritative': True}
    if name == 'purescript':
        lines = [line for line in text.splitlines() if re.search(r'\b\d+ checks passed\b', line)]
        return {'actualPassLines': len(re.findall(r'(?m)^PASS ', text)),
                'actualCheckSummaryLines': lines, 'rawLogAuthoritative': True}
    if name == 'reference':
        return {'actualPassLines': len(re.findall(r'(?m)^PASS ', text)), 'rawLogAuthoritative': True}
    return {'rawLogAuthoritative': True}

def no_core():
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

def interrupted(number, frame):
    raise KeyboardInterrupt('Administrative signal ' + str(number))

ACTIVE_ADDITIONAL_INPUTS = set()
PROTOCOL_SCRIPT = 'node --experimental-vm-modules --test --test-concurrency=1 test/*.test.js'
REQUIRED_RECEIPTS = {'scalar-stock24-source','scalar-stock24-controls','scalar-sdk24.19','scalar-sdk26.13','installed-root'}

def test_files():
    return sorted(str(path.relative_to(ROOT))for path in (ROOT/'test').glob('*.test.js')if path.is_file())

def descriptor_inputs(descriptor):
    path=Path(descriptor['path']);assert sha(path)==descriptor['SHA256'],'Pinned map changed: '+str(path)
    value=json.loads(path.read_text())
    for key in descriptor.get('keyPath',[]):value=value[key]
    assert isinstance(value,dict)and value,'Nonempty explicit additional/contract map required'
    result={str(path):descriptor['SHA256']}
    for name,cell in value.items():
        expected=cell if isinstance(cell,str)else cell['sha256']
        assert re.fullmatch('[0-9a-f]{64}',expected)
        target=Path(descriptor['base'])/name;assert target.is_file()and sha(target)==expected,'Additional/contract drift: '+str(target)
        if isinstance(cell,dict)and 'target'in cell:assert str(target.resolve())==cell['target']
        result[str(target)]=expected
    return result

def verify_receipts(records):
    assert {r['label']for r in records}==REQUIRED_RECEIPTS and len(records)==5,'All five actual prerequisites required'
    for record in records:
        path=Path(record['path']);assert sha(path)==record['SHA256'],'Actual prerequisite receipt drift'
        value=json.loads(path.read_text())
        for key in record['stateKeyPath']:value=value[key]
        assert value==record['acceptedState']and isinstance(value,str)
        assert value.startswith(('PASS','ACCEPTED','APPLIED')),'A truthful separate positive receipt is required; do not rewrite original bool/negative status'

def configure_excluded_service(spec):
    global EXCLUDED_SERVICE, EXCLUDED_SERVICE_AUTHORITY
    record=spec['excludedService'];pid=record['pid'];start=int(record['startTicks'])
    assert isinstance(pid,int)and pid>1 and start>0 and isinstance(record['argv'],list)and record['argv']
    assert record['launcherCwd']==str(ROOT),'Recorded launcher cwd must be the actual Root authority'
    receipt=record['launchReceipt'];path=Path(receipt['path']);assert sha(path)==receipt['SHA256'],'Frozen service launch receipt changed'
    data=json.loads(path.read_text());values={}
    for name in ['pid','startTicks','argv','cwd']:
        value=data
        for key in receipt['keyPaths'][name]:value=value[key]
        values[name]=value
    assert int(values['pid'])==pid and int(values['startTicks'])==start and values['argv']==record['argv']and values['cwd']==record['launcherCwd'],'Service record differs from exact owned launch authority'
    actual=identity(pid);assert actual and actual['startTicks']==start and actual['state']!='Z','Frozen excluded service identity is not the actual live process'
    argv=[item.decode()for item in(Path('/proc')/str(pid)/'cmdline').read_bytes().split(b'\0')if item]
    assert argv==record['argv'],'Actual service argv differs from frozen launch authority'
    EXCLUDED_SERVICE=pid
    EXCLUDED_SERVICE_AUTHORITY={'pid':pid,'startTicks':start,'argv':argv,'launcherCwd':record['launcherCwd'],'launchReceiptSHA256':receipt['SHA256'],'procCwdRead':'not attempted; only the pinned owned launcher receipt supplies cwd authority'}
    return path

def configure_additional(spec):
    global ACTIVE_ADDITIONAL_INPUTS
    values={}
    fullReceipt=verify_full_js(spec['actualInstalledFullJS']);values[str(fullReceipt)]=sha(fullReceipt)
    serviceReceipt=configure_excluded_service(spec);values[str(serviceReceipt)]=sha(serviceReceipt)
    for name in ['sourceContracts','additionalCurrentInputs','installedGraph']:
        current=descriptor_inputs(spec[name])
        if name=='installedGraph':
            assert spec[name]['base']==str(ROOT)
            assert all(Path(path).is_relative_to(ROOT)for path in current if path!=spec[name]['path']),'Wrong installed Root map authority'
        values.update(current)
    ACTIVE_ADDITIONAL_INPUTS=set(values)
    return values

def verify_full_js(receipt):
    path=Path(receipt['path']);assert sha(path)==receipt['SHA256'],'Actual installed full-JS receipt changed'
    value=json.loads(path.read_text());assert value['status']=='PASS'and value['inputsUnchanged']is True and value['acceptedSpecStable']is True
    assert len(value['stages'])==1 and value['stages'][0]['name']=='protocol'
    stage=value['stages'][0];assert stage['status']=='PASSED'and stage['exit']==0 and not stage.get('administrativeDeadline')
    actual=stage['counts']['actualReporterSummary'];assert actual['tests']>0 and actual['pass']==actual['tests']and all(actual[k]==0 for k in ['fail','cancelled','skipped','todo'])
    assert not stage.get('lateUncaughtActivity')and not live(stage['ownedBeforeCleanup'])and not live(stage['ownedAfterCleanup'])
    return path

def verify_spec(spec,env):
    assert spec['schema']=='network-initial-installed-root-remaining-workflow/v1'and spec['status']=='FROZEN_REVIEWED_ACCEPTED_INSTALLED_GRAPH'
    assert spec['root']==str(ROOT)and sha(Path(__file__).resolve())==spec['controllerSHA256']and sha(HERE/'full_source_collection.py')==spec['collectorSHA256']
    assert sha(NODE)==NODE_SHA256 and not env.get('RED_PANDA_RUNTIME_ADDON')and not env.get('RED_PANDA_COLLECTIONS_ADDON')
    assert json.loads((ROOT/'package.json').read_text())['scripts']['test:protocol']==PROTOCOL_SCRIPT,'Package full-JS invocation changed'
    verify_receipts(spec['actualPrerequisites']);configure_additional(spec)
    assert len(spec['nativeArtifactsSHA256'])==18 and all(sha(ROOT/name)==value for name,value in spec['nativeArtifactsSHA256'].items()),'Installed18 native artifact mismatch'
    assert sha(ROOT/'native/runtime.cc')==RUNTIME_SOURCE
    assert snapshot(env)==spec['fullCurrentInputs'],'Installed accepted input graph changed'
    assert test_files()==spec['testFiles']and spec['tentativeStaticCollection']['tentative']is True
    assert len(test_files())==spec['tentativeStaticCollection']['fileCount'],'Actual test file set changed'

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--epoch', required=True)
    parser.add_argument('--freeze-spec',type=Path,required=True)
    parser.add_argument('--execute-after-root-review',action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*', args.epoch):
        raise ValueError('Epoch must be a single fresh filename')
    if not args.execute_after_root_review:raise RuntimeError('Full JS needs actual Parent acceptance/integration/runtime review.')
    spec=json.loads(args.freeze_spec.read_text());spec_digest=sha(args.freeze_spec)
    verify_spec(spec,environment())
    out = HERE / args.epoch
    out.mkdir(exist_ok=False)
    env = environment()
    record = {'status': 'STARTING', 'stages': [], 'futureStages': [s[0] for s in STEPS],
              'countsPolicy': 'Only actual raw reporter output; no historical count arithmetic.'}
    before = None
    child = None
    final_owned_leader = None
    owned = {}
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    def persist():
        save(out / 'status.json', record)
    try:
        assert os.path.samefile(shutil.which('node', path=env['PATH']), NODE)
        assert not env.get('RED_PANDA_RUNTIME_ADDON') and not env.get('RED_PANDA_COLLECTIONS_ADDON'), 'Use actual Root-installed matching addons'
        assert sha(NATIVE) == '9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f'
        assert sha(ROOT / 'native/runtime.cc') == RUNTIME_SOURCE, 'Future combined95 source not installed'
        installed = {}
        for version, expected in RUNTIMES.items():
            folder = ROOT / 'native/build/linux-x64' / ('node-' + version)
            metadata = json.loads((folder / 'runtime.node.json').read_text())
            assert sha(folder / 'runtime.node') == expected == metadata['binarySHA256']
            assert metadata['sourceSHA256'] == RUNTIME_SOURCE
            assert metadata['node'] == 'v' + version
            installed[version] = metadata
        artifacts = list((ROOT / 'native/build/linux-x64').glob('node-*/*.node*'))
        assert len(artifacts) == 18, 'Require all18 ordinary SDK binaries/manifests'
        before = snapshot(env)
        save(out / 'inputs-before.json', before)
        assert sha(NODE)==NODE_SHA256,'Actual stock24 executable hash required, no custom provider substitution'
        actual_node_version='v24.22.1 (authority: exact known executable SHA; no extra Node invocation)'
        assert before==spec['fullCurrentInputs'],'Installed accepted graph changed before full JS'
        record['excludedServiceAuthority']=dict(EXCLUDED_SERVICE_AUTHORITY)
        record['installedRootTestFiles']=test_files()
        record['staticExpectedCounts']=spec['tentativeStaticCollection']
        record['historical2190NotRequired']=True
        save(out / 'environment.json', {
            'node': actual_node_version,
            'PATH': env['PATH'], 'NODE_USE_ENV_PROXY': env['NODE_USE_ENV_PROXY'],
            'NO_PROXY': env['NO_PROXY'], 'no_proxy': env['no_proxy'],
            'NPM_CONFIG_CACHE': env['NPM_CONFIG_CACHE'],
            'NODE_OPTIONS': env.get('NODE_OPTIONS'),
            'tlsInheritedKeys': {k: env.get(k) for k in ['NODE_EXTRA_CA_CERTS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'REQUESTS_CA_BUNDLE']},
            'runtimeInstalled': installed, 'sdkArtifacts': [str(p) for p in sorted(artifacts)],
            'proxyCredentialsNotPrinted': True,
            'policy': 'Canonical Root environment; preserve inherited proxy/TLS values; append all original loopback aliases.'})
        for name, command, cap in STEPS:
            assert snapshot(env) == before, 'Guarded inputs changed before stage'
            started = time.monotonic()
            row = {'name': name, 'command': command, 'administrativeCapSeconds': cap,
                   'status': 'RUNNING', 'resourcesBefore': resources()}
            record['stages'].append(row)
            record['futureStages'].remove(name)
            logpath = out / (name + '.log')
            with logpath.open('xb') as log:
                child = subprocess.Popen(command, cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
                    stdout=log, stderr=subprocess.STDOUT, start_new_session=True, preexec_fn=no_core)
                final_owned_leader=child.pid
                row['identity'] = identity(child.pid)
                assert row['identity'] and row['identity']['pgrp'] == child.pid and row['identity']['sid'] == child.pid
                owned = {(child.pid, row['identity']['startTicks']): row['identity']}
                persist()
                print(json.dumps({'stage': name, 'status': 'RUNNING', 'identity': row['identity']}), flush=True)
                last_progress = started
                while child.poll() is None:
                    now = time.monotonic()
                    for member in members(child.pid):
                        owned[(member['pid'], member['startTicks'])] = member
                    if now - started >= cap:
                        row['administrativeDeadline'] = True
                        break
                    if now - last_progress >= 20:
                        progress = {'stage': name, 'status': 'RUNNING', 'seconds': now - started,
                                    'logBytes': logpath.stat().st_size, 'owned': members(child.pid)}
                        with (out / 'progress.jsonl').open('a') as stream:
                            stream.write(json.dumps(progress) + '\n')
                        print(json.dumps(progress), flush=True)
                        last_progress = now
                    time.sleep(.2)
                row['ownedBeforeCleanup'] = observed_remainder(child.pid, owned)
                row['ownedAfterCleanup'] = cleanup(child.pid, owned)
                child.wait(timeout=5)
                row['exit'] = child.returncode
                row['ownedObserved'] = list(owned.values())
                child = None
            row['seconds'] = time.monotonic() - started
            row['resourcesAfter'] = resources()
            row['rawLog'] = {'path': str(logpath), 'sha256': sha(logpath), 'bytes': logpath.stat().st_size}
            row['counts'] = observed_counts(name, logpath)
            row['inputsUnchanged'] = snapshot(env) == before
            text=logpath.read_text(errors='replace')
            row['actualCountsNotHistorical']=True
            row['observedStagePass']=True
            if name=='purescript':row['observedStagePass']=row['counts']['actualPassLines']>0 and bool(row['counts']['actualCheckSummaryLines'])
            elif name=='reference':row['observedStagePass']=row['counts']['actualPassLines']>0
            elif name=='strict':
                warnings=re.findall(r'(?m)^Warnings\s+(\d+)\s+(\d+)\s+(\d+)\s*$',text)
                errors=re.findall(r'(?m)^Errors\s+(\d+)\s+(\d+)\s+(\d+)\s*$',text)
                row['actualCompilerSummary']={'warningsRows':warnings,'errorsRows':errors,'rawLogAuthoritative':True}
                row['observedStagePass']=bool(warnings)and bool(errors)and all(int(n)==0 for group in [*warnings,*errors]for n in group)
            row['status']='PASSED'if row['exit']==0 and not row.get('administrativeDeadline')and not live(row['ownedBeforeCleanup'])and not live(row['ownedAfterCleanup'])and row['inputsUnchanged']and row['observedStagePass']else'FAILED_RETAIN_RAW'
            persist()
            print(json.dumps({k: row[k] for k in ['name', 'status', 'exit', 'seconds', 'counts']}), flush=True)
            if row['status'] != 'PASSED':
                break
        record['status'] = 'PASS' if len(record['stages']) == len(STEPS) and all(row['status'] == 'PASSED' for row in record['stages']) else 'STOPPED_REST_UNRUN'
    except BaseException as error:
        record['status'] = 'STOPPED_REST_UNRUN'
        record['failure'] = {'type': type(error).__name__, 'message': str(error)}
    finally:
        if child is not None:
            record['interruptedCleanup'] = cleanup(child.pid, owned)
            try:
                record['interruptedChildExit'] = child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                record['cleanupFailure'] = 'Owned leader did not exit after bounded cleanup'
        if final_owned_leader is not None:
            try:
                if live(observed_remainder(final_owned_leader,owned)):
                    record['finalExceptionalCleanup']=cleanup(final_owned_leader,owned)
                record['finalOwnedRemainder']=observed_remainder(final_owned_leader,owned)
                if live(record['finalOwnedRemainder']):record['status']='STOPPED_OWNED_CLEANUP_FAILURE'
            except BaseException as error:record['status']='STOPPED_OWNED_CLEANUP_FAILURE';record['finalOwnedCleanupFailure']=str(error)
        if before is not None:
            after = snapshot(env)
            save(out / 'inputs-after.json', after)
            record['inputsUnchanged'] = before == after
            save(out / 'source-stable.json', {'unchanged': before == after, 'inputs': len(before),
                'changed': sorted(k for k in before.keys() | after.keys() if before.get(k) != after.get(k))})
            if before != after:
                record['status'] = 'STOPPED_INTEGRITY_FAILURE'
        try:
            assert sha(args.freeze_spec)==spec_digest,'Freeze spec changed'
            verify_spec(spec,env)
            record['acceptedSpecStable']=True
            record['excludedServiceAuthorityAfter']=dict(EXCLUDED_SERVICE_AUTHORITY)
        except BaseException as error:record['status']='STOPPED_INTEGRITY_FAILURE';record['acceptedSpecFailure']=str(error)
        persist()
        print(json.dumps({'status': record['status'], 'futureStages': record['futureStages'],
                          'inputsUnchanged': record.get('inputsUnchanged')}), flush=True)
    return 0 if record['status'] == 'PASS' and not record.get('cleanupFailure') else 1

if __name__ == '__main__':
    raise SystemExit(main())
