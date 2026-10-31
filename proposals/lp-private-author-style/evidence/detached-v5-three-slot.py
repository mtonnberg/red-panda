from pathlib import Path
import subprocess,json,hashlib,time,os,signal,sys
p=Path.cwd();expected=json.loads((p/'evidence/detached-v5-three-inputs.json').read_text())
def digest(path):
 h=hashlib.sha256()
 with path.open('rb')as source:
  for block in iter(lambda:source.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def state():return{n:digest(p/n)for n in expected}
assert state()==expected,'Frozen detached-control inputs changed before launch'
env=os.environ.copy();union=list(dict.fromkeys([v.strip()for key in['NO_PROXY','no_proxy']for v in env.get(key,'').split(',')if v.strip()]+['localhost','.localhost','127.0.0.1','::1','[::1]','0.0.0.0']));env['NODE_USE_ENV_PROXY']='1';env['NO_PROXY']=env['no_proxy']=','.join(union);node='/workspace/shared/rea-tools/node_modules/node/bin/node';rows=[]
for lane,binary in[('native','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'),('current-root',str(p/'evidence/current-root-cli')),('candidate-v5',str(p/'evidence/candidate-cli'))]:
 output='evidence/detached-v5-'+lane+'.json';command=[node,'--experimental-vm-modules','evidence/detached-document-probe.mjs',binary,output];start=time.monotonic();watchdog=False
 with(p/('evidence/detached-v5-'+lane+'.log')).open('xb')as log:
  child=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env=env)
  try:code=child.wait(timeout=12)
  except subprocess.TimeoutExpired:
   watchdog=True;os.killpg(child.pid,signal.SIGTERM)
   try:code=child.wait(timeout=3)
   except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
 rawfile=p/output;raw=json.loads(rawfile.read_text())if rawfile.exists()else{};groups=raw.get('groups',[]);producer=raw.get('pid');row={'lane':lane,'command':command,'exit':code,'seconds':time.monotonic()-start,'outerWatchdog':12,'cleanupGrace':3,'watchdogTriggered':watchdog,'groups':len(groups),'completed':sum(g.get('completed')is True for g in groups),'topFailure':raw.get('failure'),'observedLPErrors':sum('error'in step for g in groups for step in g.get('steps',[])if step.get('method')=='LP.getMarkdown'),'producerPID':producer,'producerPresentAfterCleanup':bool(producer)and Path('/proc/'+str(producer)).exists()};rows.append(row);print(json.dumps(row),flush=True)
 if code or watchdog or row['producerPresentAfterCleanup']:break
 if state()!=expected:break
after=state();result={'steps':rows,'inputs':len(expected),'changed':[n for n in expected if after[n]!=expected[n]],'canonicalEnv':{'NODE_USE_ENV_PROXY':env['NODE_USE_ENV_PROXY'],'equalBypassLists':env['NO_PROXY']==env['no_proxy'],'unionSHA256':hashlib.sha256(env['NO_PROXY'].encode()).hexdigest(),'proxyTLSPreserved':all(env.get(n)==os.environ.get(n)for n in['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NODE_TLS_REJECT_UNAUTHORIZED','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR'])},'scope':'diagnostic; actual LP protocol errors are recorded, not converted into fabricated success'};(p/'evidence/detached-v5-three-status.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True);sys.exit(1 if result['changed']or len(rows)!=3 or any(r['exit']or r['watchdogTriggered']or r['producerPresentAfterCleanup']or r['completed']!=4 or r['topFailure']for r in rows)else 0)
