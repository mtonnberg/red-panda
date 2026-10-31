from pathlib import Path
import subprocess,json,hashlib,os,signal,time,re
p=Path(__file__).resolve().parent;out=p/'acceptance';out.mkdir(exist_ok=False)
plan=Path('/workspace/shared/registration455-adapted-plan-20261031');native=Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux');sdk={'24.22.1':Path('/workspace/shared/rea-tools/node_modules/node/bin/node'),'24.19.0':Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),'26.13.0':Path('/workspace/shared/node26/node_modules/node/bin/node')}
paths={f for name in ['src','test','bin','node_modules','native/build'] for f in (p/name).rglob('*') if f.is_file()}|set(sdk.values())|{native,Path(__file__).resolve(),p/'red-panda-launcher',plan/'harness/scripts/conformance.mjs',plan/'fixtures/adapted/testing.js',plan/'fixtures/adapted/url.html',plan/'maps/registration-map.json'}
def state():return{str(f):hashlib.sha256(f.read_bytes()).hexdigest()for f in sorted(paths)}
before=state();(out/'before.json').write_text(json.dumps(before,indent=2)+'\n');env=os.environ.copy();union=list(dict.fromkeys([v for n in ['NO_PROXY','no_proxy']for v in env.get(n,'').split(',')if v]+['127.0.0.1','localhost','::1','[::1]','0.0.0.0']));env['NO_PROXY']=env['no_proxy']=','.join(union);env['NODE_USE_ENV_PROXY']='1';stages=[]
def run(label,cmd,cap):
 start=time.monotonic();timed=False
 with(out/(label+'.log')).open('xb')as log:
  child=subprocess.Popen(cmd,cwd=p,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=child.wait(timeout=cap)
  except subprocess.TimeoutExpired:
   timed=True;os.killpg(child.pid,signal.SIGKILL);code=child.wait()
 row={'label':label,'cmd':cmd,'pid':child.pid,'exit':code,'administrativeTimeout':timed,'seconds':time.monotonic()-start,'stable':state()==before};stages.append(row);(out/'stages.json').write_text(json.dumps(stages,indent=2)+'\n');print(json.dumps(row),flush=True);assert code==0 and not timed and row['stable'];return row
try:
 for actor,binary in [('native',native),('candidate',p/'red-panda-launcher')]:
  report=out/(actor+'-url.json');run(actor+'-source',[str(sdk['24.22.1']),str(plan/'harness/scripts/conformance.mjs'),'--root',str(plan/'fixtures/adapted'),'--binary',str(binary),'--isolate','--fixture-profile','upstream','--source-load-contract','--websocket-port','9584','--registration-map',str(plan/'maps/registration-map.json'),'--runner-global-arg=--ws-max-concurrent','--runner-global-arg=50','--port','9582','--test','url.html','--report',str(report)],19)
  data=json.loads(report.read_text());assert len(data['results'])==1;r=data['results'][0];assert r['path']=='url.html' and r['status']=='passed' and r['nativeHarnessBranch']is True;rload=r['sourceLoadContract'];assert rload['loadBudgetMs']==2000 and rload['assertionBudgetMs']==2000 and rload['assertionStartedAfterLoad']is True;assert r['sourceProfile']['id']=='fa94522d56ca'
 for version in ['24.19.0','26.13.0']:
  label='new-five-'+version;run(label,[str(sdk[version]),'--experimental-vm-modules','--test','--test-reporter=tap','--test-concurrency=1','test/url-parse-factory.test.js'],60);text=(out/(label+'.log')).read_text();assert re.search(r'^# pass 5$',text,re.M) and re.search(r'^# fail 0$',text,re.M)
 run('existing-consumers',[str(sdk['24.22.1']),'--experimental-vm-modules','--test','--test-reporter=tap','--test-concurrency=1','test/blob-urls.test.js','test/worker-blob-urls.test.js','test/dom-wrapper-realms.test.js'],90)
finally:
 after=state();(out/'after.json').write_text(json.dumps(after,indent=2)+'\n');(out/'stable.json').write_text(json.dumps({'inputs':len(before),'stable':before==after},indent=2)+'\n')
