"""Fresh main-checkout composition proof, separate from isolated R2 epochs."""
from pathlib import Path
import hashlib, json, os, re, resource, signal, subprocess, time

root=Path('/workspace/red-panda')
out=root/'.cache/validation/phase26-root-promise-r1'
node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node')
def snapshot():
    paths={p for name in ['src','test','native','bin','scripts','helpers','node_modules','oracle','docs/reference']
           for p in (root/name).rglob('*') if p.is_file() and '.git' not in p.parts and '__pycache__' not in p.parts}
    paths.update(root/name for name in ['package.json','package-lock.json'])
    paths.update([node,Path(__file__)])
    return {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}
def save(name,value): (out/name).write_text(json.dumps(value,indent=2)+'\n')
def no_core(): resource.setrlimit(resource.RLIMIT_CORE,(0,0))

out.mkdir(exist_ok=False)
before=snapshot();save('inputs-before.json',before)
env=dict(os.environ,NODE_USE_ENV_PROXY='1',PROMISE_ATTRIBUTION_EVIDENCE=str(out/'actual-promise-children.json'))
command=[str(node),'--experimental-vm-modules','--test','--test-concurrency=1',
         'test/promise-attribution.test.js','test/errors.test.js','test/animations.test.js',
         'test/window-lifecycle-timers.test.js','test/animations-allocation.test.js','test/animation-task-owner.test.js']
started=time.monotonic()
with (out/'tests.stdout').open('xb') as stdout,(out/'tests.stderr').open('xb') as stderr:
    child=subprocess.Popen(command,cwd=root,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=no_core)
    try: code=child.wait(timeout=120);expired=False
    except subprocess.TimeoutExpired: os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
after=snapshot();save('inputs-after.json',after)
raw=(out/'tests.stdout').read_text()
counts={key:int(re.search(r'^# '+key+r' (\d+)$',raw,re.M)[1]) if re.search(r'^# '+key+r' (\d+)$',raw,re.M) else None
        for key in ['tests','pass','fail','cancelled','skipped']}
children=json.loads((out/'actual-promise-children.json').read_text()) if (out/'actual-promise-children.json').exists() else None
gone=children is not None and all(not Path('/proc/'+str(row['pid'])).exists() for row in children['rows'])
ok=code==0 and not expired and before==after and counts=={'tests':49,'pass':49,'fail':0,'cancelled':0,'skipped':0} and gone
status={'command':command,'pid':child.pid,'exit':code,'administrativeDeadline':expired,'seconds':time.monotonic()-started,
        'counts':counts,'inputs':len(before),'stable':before==after,'promiseChildrenAbsent':gone,'passed':ok,
        'scope':'Main-checkout 11 new +10 error +28 animation/lifecycle checks; original execution limits unchanged'}
save('status.json',status);print(json.dumps(status),flush=True)
raise SystemExit(0 if ok else 1)
