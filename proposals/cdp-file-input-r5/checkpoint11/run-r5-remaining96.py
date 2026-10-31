"""Prepared only. Requires a fresh explicit quiet-runtime lease."""
from pathlib import Path
import hashlib,json,os,re,signal,subprocess,time,traceback
R=Path(__file__).resolve().parent.parent;E=R/'evidence';C=R/'candidate-r5';P=Path('/workspace/red-panda')
started=time.monotonic();status=E/'r5-remaining96-status.json';assert not status.exists()
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def identity(root):
    result={str(p.relative_to(root)):sha(p)for d in ['src','test','native','scripts','bin']for p in(root/d).rglob('*')if p.is_file()and not p.is_symlink()};result.update({n:sha(root/n)for n in ['package.json','package-lock.json']});return result
def new(path,value):
    with path.open('x')as f:json.dump(value,f,indent=2);f.write('\n')
owned=json.loads((E/'candidate-r5-manifest.json').read_text());assert identity(C)==owned['files'];before=identity(P)
new(E/'r5-remaining96-external-before.json',{'files':before,'ownedOldBaseExplicit':True})
env=os.environ.copy();env['NODE_USE_ENV_PROXY']='1';proxy=','.join([env.get('NO_PROXY',''),env.get('no_proxy',''),'0.0.0.0','127.0.0.1','127.0.0.2','127.255.1.2','localhost','::1','[::1]']);env['NO_PROXY']=proxy;env['no_proxy']=proxy
for key in ['FILE_DISPATCH_DEPTH_OBSERVER','FILE_DISPATCH_RECOVERY_EVIDENCE','PROMISE_ATTRIBUTION_EVIDENCE']:env.pop(key,None)
commands=[];failure=None
def run(label,node,files,expected,skip=None):
    args=[node,'--experimental-vm-modules','--test','--test-concurrency=1','--test-reporter=spec']
    if skip:args.append('--test-skip-pattern='+skip)
    args.extend(str(C/'test'/name)for name in files);begin=time.monotonic()
    outpath=E/(label+'.stdout.log')
    with outpath.open('x')as out,(E/(label+'.stderr.log')).open('x')as err:
        p=subprocess.Popen(args,cwd=R,env=env,stdout=out,stderr=err,start_new_session=True);print(json.dumps({'phase':'started','label':label,'pid':p.pid}),flush=True);expired=False
        try:code=p.wait(timeout=max(.01,180-(time.monotonic()-started)))
        except subprocess.TimeoutExpired:expired=True;os.killpg(p.pid,signal.SIGKILL);p.wait();code=p.returncode
    text=outpath.read_text();passed=re.findall(r'(?m)^[ℹ#]\s*pass\s+(\d+)\s*$',text);failed=re.findall(r'(?m)^[ℹ#]\s*fail\s+(\d+)\s*$',text);skipped=re.findall(r'(?m)^[ℹ#]\s*skipped\s+(\d+)\s*$',text)
    row={'label':label,'pid':p.pid,'command':args,'exit':code,'administrativeTimeout':expired,'expectedPass':expected,'actualPass':int(passed[-1])if passed else None,'actualFail':int(failed[-1])if failed else None,'reportedSkipped':int(skipped[-1])if skipped else None,'explicitSkipPattern':skip,'elapsedSeconds':time.monotonic()-begin};commands.append(row);status.write_text(json.dumps({'complete':False,'commands':commands},indent=2)+'\n');print(json.dumps(row),flush=True)
    if expired or code or row['actualPass']!=expected or row['actualFail']!=0:raise RuntimeError('Owned acceptance command failed: '+label)
try:
    for label,node in [('26.13','/workspace/shared/node26/node_modules/node/bin/node')]:
        run('r5-r2-recovery8-'+label,node,['file-input-dispatch-recovery.test.js'],8)
        run('r5-r2-ordinary17-'+label,node,['file-input-capability.test.js'],17,r'^Host CDP file commit and authored handlers obey the genuine owner VM policy and recover$')
    run('r5-r2-consumers71','/workspace/shared/rea-tools/node_modules/.bin/node',[n+'.test.js'for n in ['blob-integration','blob-urls','forms','forms-integration','dom-events','platform-codec','indexeddb']],71)
except BaseException as error:failure={'name':type(error).__name__,'message':str(error),'traceback':traceback.format_exc()}
finally:
    after=identity(P);same=identity(C)==owned['files'];new(E/'r5-remaining96-after-guards.json',{'externalFiles':after,'externalUnchanged':before==after,'ownedUnchanged':same})
    if before!=after or not same:failure={'name':'SourceGuardChanged','previous':failure}
    value={'complete':failure is None,'commands':commands,'failure':failure,'elapsedSeconds':time.monotonic()-started,'administrativeCapSeconds':180,'remainingSDKs':1,'earlierNode24_19Required25PlusDuplicate1Passed':True,'recoveryPerSDK':8,'ordinaryPerSDK':17,'consumerExpectedTests':71,'earlierErrorsPromise21NotRepeated':True,'noNativeRerun':True,'oldR5BaseNotCurrentRoot':True,'productionEdits':False,'APIReplyMilliseconds':5000,'scriptMilliseconds':1000,'completeBarrierMilliseconds':5000,'actualOwnerVMTimeoutMilliseconds':200,'ownedChildDeadlineMilliseconds':7000,'testDeadlineMilliseconds':8000}
    status.write_text(json.dumps(value,indent=2)+'\n');print(json.dumps({'complete':failure is None,'commands':len(commands),'failure':failure,'elapsedSeconds':time.monotonic()-started}),flush=True)
if failure:raise SystemExit(1)
