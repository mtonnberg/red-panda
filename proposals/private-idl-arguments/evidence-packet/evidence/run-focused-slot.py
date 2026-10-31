from pathlib import Path
import subprocess,json,time,os,signal,hashlib
r=Path(__file__).resolve().parent.parent;e=r/'evidence';candidate=r/'candidate';start=time.monotonic();statuses=[]
nodes=[('24.22.1','/workspace/shared/rea-tools/node_modules/.bin/node'),('24.19.0','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('26.13.0','/workspace/shared/node26/node_modules/node/bin/node')]
files=['test/range-geometry.test.js','test/private-idl-arguments.test.js','test/foundational-interface-realms.test.js','test/document-interface-realms.test.js','test/manual-element-realms.test.js','test/manual-document-realms.test.js','test/dom-wrapper-realms.test.js','test/dom-factory-parity.test.js','test/utility-node-target-binding.test.js','test/location-factory.test.js','test/programmatic-namespace.test.js','test/attribute-names.test.js','test/namespace-serialization.test.js']
env=os.environ.copy();env['NODE_USE_ENV_PROXY']='1';proxy=','.join([env.get('NO_PROXY',''),env.get('no_proxy',''),'0.0.0.0','127.0.0.1','127.0.0.2','127.255.1.2','localhost','::1','[::1]']);env['NO_PROXY']=proxy;env['no_proxy']=proxy
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
manifest={str(p.relative_to(candidate)):sha(p) for d in ['src','test','native']for p in(candidate/d).rglob('*')if p.is_file()}
(e/'focused-before-manifest.json').write_text(json.dumps({'files':manifest,'count':len(manifest),'filesUnderTest':files},indent=2)+'\n')
for version,node in nodes:
 commands=[('focus-'+version,[node,'--experimental-vm-modules','--test','--test-concurrency=1','--test-reporter=tap',*files]),('direct-'+version,[node,'--experimental-vm-modules',str(e/'direct-private-arguments.mjs'),str(candidate),'candidate'])]
 for label,cmd in commands:
  began=time.monotonic();out=(e/(label+'.stdout.log')).open('w');err=(e/(label+'.stderr.log')).open('w');p=subprocess.Popen(cmd,cwd=candidate,env=env,stdout=out,stderr=err,start_new_session=True)
  try:code=p.wait(timeout=90);timeout=False
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait();code=p.returncode;timeout=True
  status={'label':label,'command':cmd,'cwd':str(candidate),'exit':code,'administrativeTimeout':timeout,'elapsedSeconds':time.monotonic()-began,'pid':p.pid};statuses.append(status);print(json.dumps(status),flush=True);(e/'focused-slot-status.json').write_text(json.dumps({'complete':False,'elapsedSeconds':time.monotonic()-start,'commands':statuses},indent=2)+'\n');assert code==0 and not timeout,status
assert manifest=={str(p.relative_to(candidate)):sha(p) for d in ['src','test','native']for p in(candidate/d).rglob('*')if p.is_file()}
(e/'focused-slot-status.json').write_text(json.dumps({'complete':True,'elapsedSeconds':time.monotonic()-start,'commands':statuses,'consumedFilesUnchanged':len(manifest),'RootMutation':False},indent=2)+'\n');print(json.dumps({'complete':True,'commands':len(statuses),'elapsedSeconds':time.monotonic()-start}),flush=True)
