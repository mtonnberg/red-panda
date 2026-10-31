from pathlib import Path
import subprocess,json,hashlib,time,os,signal,sys
p=Path.cwd();expected=json.loads((p/'evidence/candidate-detached-v5-inputs.json').read_text())
def digest(path):
 h=hashlib.sha256()
 with path.open('rb')as source:
  for block in iter(lambda:source.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def state():return{n:digest(p/n)for n in expected}
assert state()==expected,'Frozen candidate detached replay inputs changed'
env=os.environ.copy();union=list(dict.fromkeys([v.strip()for key in['NO_PROXY','no_proxy']for v in env.get(key,'').split(',')if v.strip()]+['localhost','.localhost','127.0.0.1','::1','[::1]','0.0.0.0']));env['NODE_USE_ENV_PROXY']='1';env['NO_PROXY']=env['no_proxy']=','.join(union);command=['/workspace/shared/rea-tools/node_modules/node/bin/node','--experimental-vm-modules','evidence/detached-document-probe.mjs',str(p/'evidence/candidate-cli'),'evidence/detached-v5-candidate-only.json'];start=time.monotonic();watchdog=False
with(p/'evidence/detached-v5-candidate-only.log').open('xb')as log:
 child=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env=env)
 try:code=child.wait(timeout=12)
 except subprocess.TimeoutExpired:
  watchdog=True;os.killpg(child.pid,signal.SIGTERM)
  try:code=child.wait(timeout=3)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
rawfile=p/'evidence/detached-v5-candidate-only.json';raw=json.loads(rawfile.read_text())if rawfile.exists()else{};native=json.loads((p/'evidence/detached-native.json').read_text());baseline=json.loads((p/'evidence/detached-current-root.json').read_text());comparisons=[]
for group in native['groups']:
 actual=next((g for g in raw.get('groups',[])if g['name']==group['name']),None);old=next(g for g in baseline['groups']if g['name']==group['name'])
 for row in group['steps']:
  if row['method']!='LP.getMarkdown':continue
  candidate=next((s for s in actual.get('steps',[])if s['label']==row['label']),{})if actual else{};root=next(s for s in old['steps']if s['label']==row['label']);label=row['label'].removesuffix('-markdown');description=next(s for s in group['steps']if s['label']==label+'-id');comparisons.append({'group':group['name'],'label':row['label'],'actualNodeType':description['result']['node']['nodeType'],'native':row.get('result'),'candidate':candidate.get('result'),'candidateError':candidate.get('error'),'match':candidate.get('result')==row.get('result')and not candidate.get('error'),'historicalRoot':root.get('result'),'historicalRootError':root.get('error')})
after=state();groups=raw.get('groups',[]);producer=raw.get('pid');result={'command':command,'exit':code,'seconds':time.monotonic()-start,'outerWatchdog':12,'cleanupGrace':3,'watchdogTriggered':watchdog,'inputs':len(expected),'changed':[n for n in expected if after[n]!=expected[n]],'groups':len(groups),'completedGroups':sum(g.get('completed')is True for g in groups),'producerPID':producer,'producerPresentAfterCleanup':bool(producer)and Path('/proc/'+str(producer)).exists(),'comparisons':comparisons,'matches':sum(row['match']for row in comparisons),'historicalActors':'Native and currentRoot raw actors retained from detached diagnostic; neither rerun. Deliberate subsequent Root errors.js delta recorded in current-root-post-promise-r2-composition-audit.json.','canonicalEnv':{'NODE_USE_ENV_PROXY':env['NODE_USE_ENV_PROXY'],'equalBypassLists':env['NO_PROXY']==env['no_proxy'],'unionSHA256':hashlib.sha256(env['NO_PROXY'].encode()).hexdigest(),'proxyTLSPreserved':all(env.get(n)==os.environ.get(n)for n in['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NODE_TLS_REJECT_UNAUTHORIZED','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR'])}}
passed=code==0 and not watchdog and not result['changed']and len(groups)==4 and all(g.get('completed')for g in groups)and not raw.get('failure')and len(comparisons)==13 and all(row['match']for row in comparisons)and not result['producerPresentAfterCleanup'];result['controllerPass']=passed;(p/'evidence/detached-v5-candidate-only-status.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True);sys.exit(0 if passed else 1)
