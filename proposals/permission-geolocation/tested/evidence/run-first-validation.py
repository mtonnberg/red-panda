from pathlib import Path
import subprocess,json,hashlib,time,os,signal,sys
r=Path(__file__).resolve().parent.parent;e=r/'evidence';c=r/'candidate';node='/workspace/shared/rea-tools/node_modules/.bin/node';start=time.monotonic();statuses=[];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source={str(p.relative_to(c)):sha(p)for d in ['src','test','native','scripts','bin']for p in(c/d).rglob('*')if p.is_file()and not p.is_symlink()}
for name in ['package.json','package-lock.json']:source[name]=sha(c/name)
(e/'candidate-run-manifest.json').write_text(json.dumps({'root':str(c),'files':source,'count':len(source)},indent=2)+'\n')
env=os.environ.copy();env['NODE_USE_ENV_PROXY']='1';proxy=','.join([env.get('NO_PROXY',''),env.get('no_proxy',''),'0.0.0.0','127.0.0.1','127.0.0.2','127.255.1.2','localhost','::1','[::1]']);env['NO_PROXY']=proxy;env['no_proxy']=proxy
root=Path(json.loads((e/'base-manifest.json').read_text())['root']);external={str(p.relative_to(root)):sha(p)for d in ['src','test','native','scripts','bin']for p in(root/d).rglob('*')if p.is_file()and not p.is_symlink()};(e/'external-root-before-first-validation.json').write_text(json.dumps(external,indent=2)+'\n')
def run(label,command,cwd):
 began=time.monotonic();p=subprocess.Popen(command,cwd=cwd,env=env,stdout=(e/(label+'.stdout.log')).open('w'),stderr=(e/(label+'.stderr.log')).open('w'),start_new_session=True);print(json.dumps({'phase':'started','label':label,'pid':p.pid}),flush=True)
 try:code=p.wait(timeout=max(1,90-(time.monotonic()-start)));timeout=False
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait();code=p.returncode;timeout=True
 status={'label':label,'command':command,'cwd':str(cwd),'pid':p.pid,'exit':code,'administrativeTimeout':timeout,'elapsedSeconds':time.monotonic()-began};statuses.append(status);(e/'first-validation-status.json').write_text(json.dumps({'complete':False,'commands':statuses},indent=2)+'\n');print(json.dumps(status),flush=True);assert code==0 and not timeout,status
run('syntax',[node,'--experimental-vm-modules',str(e/'check-syntax.mjs')],r)
for profile in ['extra16','24','16']:
 for mode in ['native','candidate']:
  output=e/('profile-'+profile+'-'+mode+'.json');assert not output.exists();run('profile-'+profile+'-'+mode,[node,'--experimental-vm-modules',str(e/('profile-'+profile+'.mjs' if profile=='extra16' else 'profile'+profile+'.mjs')),mode,str(output)],r);report=json.loads(output.read_text());assert not report.get('failure')and len(report['rows'])==(24 if profile=='24' else 16)
 run('compare-'+profile,[sys.executable,str(e/'compare-profiles.py'),str(e/('profile-'+profile+'-native.json')),str(e/('profile-'+profile+'-candidate.json')),str(e/('profile-'+profile+'-comparison.json'))],r)
run('focused28',[node,'--experimental-vm-modules','--test','--test-concurrency=1','--test-reporter=tap','test/permission-control.test.js','test/device-permissions.test.js','test/navigator.test.js'],c)
assert source=={p:sha(c/p)for p in source};assert external=={p:sha(root/p)for p in external}
(e/'first-validation-status.json').write_text(json.dumps({'complete':True,'commands':statuses,'elapsedSeconds':time.monotonic()-start,'candidateSourceUnchanged':len(source),'externalRootUnchanged':len(external),'RootEdits':False,'runtimeLeaseReleased':True},indent=2)+'\n');print(json.dumps({'complete':True,'elapsedSeconds':time.monotonic()-start,'runtimeLeaseReleased':True}),flush=True)
