"""Prepared focused candidate gate; do not execute outside the Root lease."""
from pathlib import Path
import hashlib,json,subprocess,time,os,signal,resource
p=Path(__file__).resolve().parent;root=p.parent.parent;s=Path('/workspace/shared/promise-attribution-authority-r2');out=p/'candidate-validation-r2';packet=p/'candidate-static-r2';node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
base=json.loads((packet/'base-source.json').read_text());candidate=json.loads((packet/'candidate-source.json').read_text())
def snapshot():
 result={}
 for label,directory,mapping in [('Root',root,base),('candidate',s,candidate)]:
  for name,expected in mapping.items():
   actual=sha(directory/name)
   if actual!=expected:raise RuntimeError('Source epoch mismatch: '+label+'/'+name)
   result[label+'/'+name]=actual
 for f in (root/'node_modules').rglob('*'):
  if f.is_file():result['dependency/'+str(f.relative_to(root/'node_modules'))]=sha(f)
 for f in [node,Path(__file__),packet/'integration.patch']:
  result[str(f)]=sha(f)
 return result
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
out.mkdir(exist_ok=False);before=snapshot();(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n');env=dict(os.environ,NODE_USE_ENV_PROXY='1',PROMISE_ATTRIBUTION_EVIDENCE=str(out/'actual-cases.json'))
for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[env.get(key),'127.0.0.1','localhost','0.0.0.0']))
command=[str(node),'--test','--test-concurrency=1','test/promise-attribution.test.js','test/errors.test.js'];started=time.monotonic()
with (out/'tests.stdout').open('xb') as stdout,(out/'tests.stderr').open('xb') as stderr:
 child=subprocess.Popen(command,cwd=s,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=core_zero)
 try:code=child.wait(timeout=90);expired=False
 except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'scope':'11 new attribution cases +10 existing errors cases; no external-hook safety/Native late-target claim','pid':child.pid,'exit':code,'deadline':expired,'administrativeSeconds':90,'seconds':time.monotonic()-started,'expectedTests':21,'unchanged':before==after,'guardInputs':len(before),'command':command};(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
raise SystemExit(0 if code==0 and not expired and before==after else 1)
