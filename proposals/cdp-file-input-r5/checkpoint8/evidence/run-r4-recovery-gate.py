"""Prepared static controller. Running requires an explicit quiet-runtime lease.

Administrative 90-second ownership watchdog only; API reply=5s, authored
Runtime.evaluate=1s, document complete/child barrier=5s remain unchanged.
"""
from pathlib import Path
import ast,hashlib,json,os,signal,subprocess,time,traceback

ROOT=Path(__file__).resolve().parent.parent
E=ROOT/'evidence'
NODE='/workspace/shared/rea-tools/node_modules/.bin/node'
started=time.monotonic()
status_path=E/'candidate-r4-recovery-status.json'
assert not status_path.exists(),'Preserve prior epoch; use a separately named controller.'
owned=json.loads((E/'candidate-r4-manifest.json').read_text())
external=Path(owned['root'])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def identity(root):
    paths=[p for d in ['src','test','native','scripts','bin'] for p in (root/d).rglob('*') if p.is_file() and not p.is_symlink()]
    paths += [root/'package.json',root/'package-lock.json']
    return {str(p.relative_to(root)):sha(p) for p in sorted(paths)}
def write_new(path,value):
    with path.open('x') as f:json.dump(value,f,indent=2);f.write('\n')
def save_status(value):status_path.write_text(json.dumps(value,indent=2)+'\n')
commands=[];failure=None
external_before=identity(external)
write_new(E/'external-root-before-r4-recovery.json',{'root':str(external),'files':external_before,'ownedBaseHEAD':owned['HEAD'],'ownedBaseUnchanged':identity(ROOT/'candidate-r4')==owned['files'],'differenceFromOwned':{p:{'owned':owned['files'].get(p),'external':v}for p,v in external_before.items()if v!=owned['files'].get(p)}})
assert identity(ROOT/'candidate-r4')==owned['files']
env=os.environ.copy();env['NODE_USE_ENV_PROXY']='1'
no_proxy=','.join([env.get('NO_PROXY',''),env.get('no_proxy',''),'0.0.0.0','127.0.0.1','127.0.0.2','127.255.1.2','localhost','::1','[::1]'])
env['NO_PROXY']=no_proxy;env['no_proxy']=no_proxy
def run(label,command):
    start=time.monotonic()
    with (E/(label+'.stdout.log')).open('x') as out,(E/(label+'.stderr.log')).open('x') as err:
        p=subprocess.Popen(command,cwd=ROOT,env=env,stdout=out,stderr=err,start_new_session=True)
        print(json.dumps({'phase':'started','label':label,'pid':p.pid}),flush=True)
        timeout=False
        try:code=p.wait(timeout=max(.01,90-(time.monotonic()-started)))
        except subprocess.TimeoutExpired:
            timeout=True
            os.killpg(p.pid,signal.SIGKILL);p.wait();code=p.returncode
    row={'label':label,'command':command,'pid':p.pid,'exit':code,'administrativeTimeout':timeout,'elapsedSeconds':time.monotonic()-start}
    commands.append(row);save_status({'complete':False,'commands':commands});print(json.dumps(row),flush=True)
    if timeout or code:raise RuntimeError('Owned command failed: '+label)
try:
    for name in ['../candidate-r4/src/dom-dispatch-recovery.js','../candidate-r4/src/dom-event-state.js','../candidate-r4/src/dom-platform-factory-hooks.js','../candidate-r4/src/file-inputs.js','../candidate-r4/test/fixtures/file-input-watchdog.mjs','../candidate-r4/test/file-input-dispatch-recovery.test.js','dispatch-normal-driver.mjs','dispatch-normal-program.mjs','candidate-event-order-r4.mjs']:
        run('r4-syntax-'+Path(name).name,[NODE,'--check',str(E/name)])
    normal=[]
    for graph in ['candidate-r3','candidate-r4']:
        output=E/('r4-normal-'+graph+'.json');assert not output.exists()
        run('r4-normal-'+graph,[NODE,'--experimental-vm-modules',str(E/'dispatch-normal-driver.mjs'),str(ROOT/graph),str(output)])
        report=json.loads(output.read_text());assert report.get('failure') is None and all(report['canonicalIdentity'].values());normal.append(report)
    assert normal[0]['programSHA256']==normal[1]['programSHA256'] and normal[0]['value']==normal[1]['value'],normal
    output=E/'candidate-event-order-r4.json';assert not output.exists()
    run('r4-normal-native-order',[NODE,'--experimental-vm-modules',str(E/'candidate-event-order-r4.mjs'),str(output)])
    observed=json.loads(output.read_text());native=json.loads((E/'native-event-order.json').read_text());assert observed.get('failure') is None and observed['rows']==native['rows']
    for mode in ['basic','nested','shadow-open','shadow-closed','prior-outer','tampered-slot','error-report']:
        env['FILE_DISPATCH_RECOVERY_EVIDENCE']=str(E/('r4-owned-'+mode+'.json'))
        run('r4-owned-'+mode,[NODE,'--experimental-vm-modules','--test','--test-concurrency=1','--test-name-pattern=^Owned file dispatch recovery: '+mode+'$',str(ROOT/'candidate-r4/test/file-input-dispatch-recovery.test.js')])
except BaseException as exc:
    failure={'name':type(exc).__name__,'message':str(exc),'traceback':traceback.format_exc()}
finally:
    external_after=identity(external);owned_after=identity(ROOT/'candidate-r4')
    write_new(E/'external-root-after-r4-recovery.json',{'root':str(external),'files':external_after,'unchanged':external_before==external_after})
    write_new(E/'owned-candidate-r4-after-recovery.json',{'files':owned_after,'unchanged':owned_after==owned['files']})
    if external_before!=external_after or owned_after!=owned['files']:
        failure={'name':'SourceGuardChanged','previous':failure,'externalChanged':external_before!=external_after,'ownedChanged':owned_after!=owned['files']}
    save_status({'complete':failure is None,'commands':commands,'failure':failure,'elapsedSeconds':time.monotonic()-started,'normalCounterfactualGraphs':2,'candidateNativeOrderRows':3,'newOwnedRecoveryCases':7,'normal17AndConsumersAndOtherSDKsUnrun':True,'runtimeGraphs':['candidate-r3 and candidate-r4 from isolated old541 snapshot; not current Root','frozen Native3 ordinary event-order raw oracle read only; no Native rerun'],'productionEdits':False,'largeFileProbe':False,'APIReplyMilliseconds':5000,'scriptMilliseconds':1000,'completeBarrierMilliseconds':5000})
    print(json.dumps({'complete':failure is None,'commands':len(commands),'failure':failure,'elapsedSeconds':time.monotonic()-started}),flush=True)
if failure:raise SystemExit(1)
