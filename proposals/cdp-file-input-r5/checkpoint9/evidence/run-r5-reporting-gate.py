"""Explicit quiet lease required. Administrative cap only; original API/test limits stay unchanged."""
from pathlib import Path
import hashlib,json,os,signal,subprocess,time,traceback

R=Path(__file__).resolve().parent.parent;E=R/'evidence'
NODE='/workspace/shared/rea-tools/node_modules/.bin/node'
started=time.monotonic();status=E/'candidate-r5-reporting-status.json'
assert not status.exists(),'Preserve prior epoch.'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def identity(root):
    values={str(p.relative_to(root)):sha(p) for d in ['src','test','native','scripts','bin'] for p in (root/d).rglob('*') if p.is_file() and not p.is_symlink()}
    values.update({n:sha(root/n) for n in ['package.json','package-lock.json']});return values
def new(path,value):
    with path.open('x') as f:json.dump(value,f,indent=2);f.write('\n')
graphs={name:json.loads((E/(name+'-manifest.json')).read_text()) for name in ['candidate-r5-prerequisite','candidate-r5','candidate-r5-prerequisite-observed','candidate-r5-observed']}
for name,m in graphs.items():assert identity(R/name)==m['files'],name
external=Path('/workspace/red-panda');before=identity(external)
new(E/'external-root-before-r5-reporting.json',{'files':before,'separateOldBase':True})
env=os.environ.copy();env['NODE_USE_ENV_PROXY']='1'
proxy=','.join([env.get('NO_PROXY',''),env.get('no_proxy',''),'0.0.0.0','127.0.0.1','127.0.0.2','127.255.1.2','localhost','::1','[::1]'])
env['NO_PROXY']=proxy;env['no_proxy']=proxy
commands=[];failure=None
def save():status.write_text(json.dumps({'complete':False,'commands':commands},indent=2)+'\n')
def run(label,args,expected=0):
    begin=time.monotonic()
    with (E/(label+'.stdout.log')).open('x') as out,(E/(label+'.stderr.log')).open('x') as err:
        p=subprocess.Popen([NODE,*args],cwd=R,env=env,stdout=out,stderr=err,start_new_session=True)
        print(json.dumps({'phase':'started','label':label,'pid':p.pid}),flush=True);expired=False
        try:code=p.wait(timeout=max(.01,90-(time.monotonic()-started)))
        except subprocess.TimeoutExpired:
            expired=True;os.killpg(p.pid,signal.SIGKILL);p.wait();code=p.returncode
    row={'label':label,'pid':p.pid,'command':[NODE,*args],'exit':code,'expectedExit':expected,'administrativeTimeout':expired,'elapsedSeconds':time.monotonic()-begin};commands.append(row);save();print(json.dumps(row),flush=True)
    if expired or code!=expected:raise RuntimeError('Owned command failed: '+label)
def owned(label,graph,mode,observed=False,expected=0):
    env['FILE_DISPATCH_RECOVERY_EVIDENCE']=str(E/(label+'.json'))
    if observed:env['FILE_DISPATCH_DEPTH_OBSERVER']=(R/graph/'test/fixtures/error-depth-observer.mjs').as_uri()
    else:env.pop('FILE_DISPATCH_DEPTH_OBSERVER',None)
    run(label,['--experimental-vm-modules','--test','--test-concurrency=1','--test-name-pattern=^Owned file dispatch recovery: '+mode+'$',str(R/graph/'test/file-input-dispatch-recovery.test.js')],expected)
    raw=json.loads((E/(label+'.json')).read_text());assert not raw['expired'] and raw['signal'] is None and raw['code']==expected
    value=json.loads(raw['stdout'].strip().split('\n')[-1]);return value
try:
    syntax=['candidate-r5/src/dom-dispatch-recovery.js','candidate-r5/src/errors.js','candidate-r5/test/file-input-dispatch-recovery.test.js','candidate-r5/test/fixtures/file-input-watchdog.mjs','candidate-r5/test/fixtures/error-depth-observer.mjs','candidate-r5-prerequisite-observed/src/errors.js','candidate-r5-observed/src/errors.js','evidence/candidate-event-order-r5.mjs']
    for i,path in enumerate(syntax):run('r5-syntax-'+str(i),['--check',str(R/path)])
    negative=owned('r5-counterfactual-observed','candidate-r5-prerequisite-observed','error-report',True,1)
    assert negative['initialDepth']==0 and negative['depthAfterTimeout']==1 and negative['laterReport']==[] and negative['failure']['name']=='AssertionError',negative
    positive=owned('r5-positive-observed','candidate-r5-observed','error-report',True)
    assert positive['initialDepth']==0 and positive['depthAfterTimeout']==0 and positive['disposed'] and positive['secondBytes']==[3,1,4],positive
    recovery=[row for row in positive['depthObservations'] if row['phase'].startswith('abandoned-')]
    assert recovery==[{'phase':'abandoned-before','owner':recovery[0]['owner'],'depth':1},{'phase':'abandoned-after','owner':recovery[0]['owner'],'depth':0}],recovery
    prior=owned('r5-prior-reporting-observed','candidate-r5-observed','prior-reporting',True)
    assert prior['priorReporting']['depthBefore']==prior['priorReporting']['depthAfter']==1 and prior['priorReporting']['childAfter']==0 and prior['outerReportingAfter']['depth']==0,prior
    env.pop('FILE_DISPATCH_DEPTH_OBSERVER',None);env.pop('FILE_DISPATCH_RECOVERY_EVIDENCE',None)
    # Product graph carries no diagnostic source import/property/export.
    run('r5-product-eight-recovery',['--experimental-vm-modules','--test','--test-concurrency=1',str(R/'candidate-r5/test/file-input-dispatch-recovery.test.js')])
    normals=[]
    for graph in ['candidate-r5-prerequisite','candidate-r5']:
        output=E/('r5-normal-'+graph+'.json');assert not output.exists()
        run('r5-normal-'+graph,['--experimental-vm-modules',str(E/'dispatch-normal-driver.mjs'),str(R/graph),str(output)])
        report=json.loads(output.read_text());assert report.get('failure') is None and all(report['canonicalIdentity'].values());normals.append(report)
    assert normals[0]['programSHA256']==normals[1]['programSHA256'] and normals[0]['value']==normals[1]['value']
    output=E/'candidate-event-order-r5.json';assert not output.exists()
    run('r5-native-three-projections',['--experimental-vm-modules',str(E/'candidate-event-order-r5.mjs'),str(output)])
    native=json.loads((E/'native-event-order.json').read_text());actual=json.loads(output.read_text());assert actual.get('failure') is None and actual['rows']==native['rows']
    env['PROMISE_ATTRIBUTION_EVIDENCE']=str(E/'r5-existing-promise-attribution.json')
    run('r5-existing-errors-and-promise21',['--experimental-vm-modules','--test','--test-concurrency=1',str(R/'candidate-r5/test/errors.test.js'),str(R/'candidate-r5/test/promise-attribution.test.js')])
except BaseException as error:failure={'name':type(error).__name__,'message':str(error),'traceback':traceback.format_exc()}
finally:
    after=identity(external);guards={name:identity(R/name)==m['files'] for name,m in graphs.items()}
    new(E/'r5-reporting-after-guards.json',{'externalUnchanged':before==after,'externalFiles':after,'ownedGraphsUnchanged':guards})
    if before!=after or not all(guards.values()):failure={'name':'SourceGuardChanged','previous':failure}
    result={'complete':failure is None,'commands':commands,'failure':failure,'elapsedSeconds':time.monotonic()-started,'administrativeCapSeconds':90,'actualOwnerVMTimeoutMilliseconds':200,'ownedChildDeadlineMilliseconds':7000,'testDeadlineMilliseconds':8000,'APIReplyMilliseconds':5000,'scriptMilliseconds':1000,'actualCompleteBarrierMilliseconds':5000,'expectedNegative':'Accepted PromiseR2 prerequisite plus R4 recovery: private depth remains1 and later reportError delivery fails','productionEdits':False,'otherSDKAndConsumersUnrun':True,'original21RegressionFilesUnchanged':True}
    status.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'complete':failure is None,'commands':len(commands),'failure':failure,'elapsedSeconds':time.monotonic()-started}),flush=True)
if failure:raise SystemExit(1)
