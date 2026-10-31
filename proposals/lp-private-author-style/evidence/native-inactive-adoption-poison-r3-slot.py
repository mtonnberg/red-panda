from pathlib import Path
import subprocess,json,hashlib,time,os,signal,sys
p=Path.cwd();manifest=p/'evidence/native-inactive-adoption-poison-r3-inputs.json';expected=json.loads(manifest.read_text())
def digest(path):
 h=hashlib.sha256()
 with path.open('rb')as source:
  for block in iter(lambda:source.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def path(name):return Path(name[9:])if name.startswith('absolute:')else p/name
def state():return{n:digest(path(n))for n in expected}
assert state()==expected,'Frozen Native slot inputs changed before launch'
node='/workspace/shared/rea-tools/node_modules/node/bin/node';binary='/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';command=[node,'--experimental-vm-modules','evidence/inactive-adoption-poison-r3-probe.mjs',binary,'evidence/native-inactive-adoption-poison-r3.json'];start=time.monotonic();watchdog=False
with(p/'evidence/native-inactive-adoption-poison-r3.log').open('xb')as log:
 env=os.environ.copy();union=list(dict.fromkeys([v.strip()for key in['NO_PROXY','no_proxy']for v in env.get(key,'').split(',')if v.strip()]+['localhost','.localhost','127.0.0.1','::1','[::1]','0.0.0.0']));env['NODE_USE_ENV_PROXY']='1';env['NO_PROXY']=env['no_proxy']=','.join(union)
 child=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env=env)
 try:code=child.wait(timeout=10)
 except subprocess.TimeoutExpired:
  watchdog=True;os.killpg(child.pid,signal.SIGTERM)
  try:code=child.wait(timeout=3)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
after=state();rawfile=p/'evidence/native-inactive-adoption-poison-r3.json';progress=p/'evidence/native-inactive-adoption-poison-r3.json.progress.json';raw=json.loads(rawfile.read_text())if rawfile.exists()else json.loads(progress.read_text())if progress.exists()else{};groups=raw.get('groups',[]);complete=rawfile.exists()and len(groups)==2 and all(g.get('completed')is True for g in groups)and not raw.get('failure');producer=raw.get('pid');present=bool(producer)and Path('/proc/'+str(producer)).exists();result={'command':command,'exit':code,'seconds':time.monotonic()-start,'outerWatchdog':10,'cleanupGrace':3,'watchdogTriggered':watchdog,'sourceInputs':len(after),'changed':[n for n in expected if after[n]!=expected[n]],'manifestSHA256':digest(manifest),'groups':len(groups),'completedGroups':sum(g.get('completed')is True for g in groups),'complete':complete,'producerPID':producer,'producerPresentAfterCleanup':present,'rawFile':str(rawfile if rawfile.exists()else progress if progress.exists()else''),'canonicalEnv':{'NODE_USE_ENV_PROXY':env['NODE_USE_ENV_PROXY'],'equalBypassLists':env['NO_PROXY']==env['no_proxy'],'unionSHA256':hashlib.sha256(env['NO_PROXY'].encode()).hexdigest(),'proxyAndTLSPreserved':all(env.get(n)==os.environ.get(n)for n in ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NODE_TLS_REJECT_UNAUTHORIZED','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR'])},'guardedNode':expected['absolute:'+node],'guardedNative':expected['absolute:'+binary]};(p/'evidence/native-inactive-adoption-poison-r3-status.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True);sys.exit(1 if code!=0 or watchdog or result['changed']or not complete or present else 0)
