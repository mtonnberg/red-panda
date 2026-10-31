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
status_path=E/'candidate-r2-gate-status.json'
assert not status_path.exists(),'Preserve prior epoch; use a separately named controller.'
owned=json.loads((E/'candidate-r2-manifest.json').read_text())
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
write_new(E/'external-root-before-r2-gate.json',{'root':str(external),'files':external_before,'ownedBaseHEAD':owned['HEAD'],'ownedBaseUnchanged':identity(ROOT/'candidate-r2')==owned['files'],'differenceFromOwned':{p:{'owned':owned['files'].get(p),'external':v}for p,v in external_before.items()if v!=owned['files'].get(p)}})
assert identity(ROOT/'candidate-r2')==owned['files']
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
    for name in ['../candidate-r2/src/file-wrapper-realms.js','../candidate-r2/src/file-inputs.js','../candidate-r2/src/cdp-file-input.js','../candidate-r2/src/blob.js','../candidate-r2/src/cdp.js','../candidate-r2/src/dom-wrapper-realms.js','../candidate-r2/src/browser.js','../candidate-r2/src/platform-codec.js','../candidate-r2/test/file-input-capability.test.js','candidate-controls-r2.mjs','candidate-access-path-r2.mjs','candidate-iterator-contract-r2.mjs','candidate-iterator-constructor-r2.mjs']:
        run('r2-syntax-'+Path(name).name,[NODE,'--check',str(E/name)])
    expected_reports={'access-path':'native-access-path.json','iterator-contract':'native-iterator-contract.json','iterator-constructor':'native-iterator-constructor.json'}
    for profile,reference in expected_reports.items():
        output=E/('candidate-'+profile+'-r2.json');assert not output.exists()
        run('r2-'+profile,[NODE,'--experimental-vm-modules',str(E/('candidate-'+profile+'-r2.mjs')),str(output)])
        actual=json.loads(output.read_text());native=json.loads((E/reference).read_text())
        assert actual.get('failure') is None and len(actual['rows'])==len(native['rows'])
        for observed,control in zip(actual['rows'],native['rows']):
            assert observed['name']==control['name']
            if profile=='access-path':
                keys=['first','second','parentAgain','childAgain']
                assert {key:observed['value'][key]for key in keys}=={key:control['value'][key]for key in keys},{'actual':observed,'Native':control}
            else:
                av=observed['value'];nv=control['value']
                if profile=='iterator-constructor' and observed['name'].startswith('01-'):
                    # Explicit genuine independent function source difference;
                    # do not patch Function#toString or normalize provenance.
                    av=json.loads(json.dumps(av));nv=json.loads(json.dumps(nv));av['actual'].pop('source');nv['actual'].pop('source')
                assert av==nv,{'actual':observed,'Native':control}
    run('r2-focused17',[NODE,'--experimental-vm-modules','--test','--test-concurrency=1',str(ROOT/'candidate-r2/test/file-input-capability.test.js')])
    output=E/'candidate-profile20-r2.json';assert not output.exists()
    run('r2-profile20',[NODE,'--experimental-vm-modules',str(E/'candidate-controls-r2.mjs'),'candidate',str(output)])
    report=json.loads(output.read_text());assert report.get('failure') is None and len(report['rows'])==20
    for row in report.get('physicalCreation',{}).get('rows',[]):
        expected=row['name'].endswith('-constructor')
        assert row['before']['host'] is expected and row['after']['host'] is expected,row
        assert row['before']['selectedVM'] is not expected and row['after']['selectedVM'] is not expected,row
except BaseException as exc:
    failure={'name':type(exc).__name__,'message':str(exc),'traceback':traceback.format_exc()}
finally:
    external_after=identity(external);owned_after=identity(ROOT/'candidate-r2')
    write_new(E/'external-root-after-r2-gate.json',{'root':str(external),'files':external_after,'unchanged':external_before==external_after})
    write_new(E/'owned-candidate-r2-after-gate.json',{'files':owned_after,'unchanged':owned_after==owned['files']})
    if external_before!=external_after or owned_after!=owned['files']:
        failure={'name':'SourceGuardChanged','previous':failure,'externalChanged':external_before!=external_after,'ownedChanged':owned_after!=owned['files']}
    save_status({'complete':failure is None,'commands':commands,'failure':failure,'elapsedSeconds':time.monotonic()-started,'candidateAccessRows':6,'candidateIteratorRows':8,'candidateConstructorRows':2,'candidateProfileRows':20,'newFocusedTests':17,'runtimeGraphs':['candidate-r2 from isolated old541 snapshot; not current Root','frozen Native6+8+2 raw oracles read only'],'productionEdits':False,'largeFileProbe':False,'APIReplyMilliseconds':5000,'scriptMilliseconds':1000,'completeBarrierMilliseconds':5000})
    print(json.dumps({'complete':failure is None,'commands':len(commands),'failure':failure,'elapsedSeconds':time.monotonic()-started}),flush=True)
if failure:raise SystemExit(1)
