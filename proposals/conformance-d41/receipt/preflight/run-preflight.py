from pathlib import Path
import json,hashlib,subprocess,os,time,signal
r=Path(__file__).resolve().parent.parent;out=r/'preflight';manifest=json.loads((r/'candidate-frozen.json').read_text());mapping=json.loads((r/'maps/registration-map.json').read_text());node=manifest['node']['path'];paths=dict(manifest['graphSHA256']);paths[str(r/'candidate-frozen.json')]=None
for name in ['preflight/public-branding.mjs','preflight/run-preflight.py']:paths[str(r/name)]=None
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();snapshot=lambda:{p:sha(p)for p in sorted(paths)};before=snapshot();(out/'before.json').write_text(json.dumps(before,indent=2)+'\n');assert all(before[p]==v for p,v in paths.items()if v is not None),'Frozen graph drift';env=dict(os.environ,NODE_USE_ENV_PROXY='1');env['PATH']=str(Path(node).parent)+':'+env.get('PATH','');previous=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]));aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[previous,aliases]))for key in ['NO_PROXY','no_proxy']});rows=[];start=time.monotonic();failure=None

def run(label,command,budget):
 with(out/(label+'.log')).open('xb')as log:
  child=subprocess.Popen(command,cwd=r,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=child.wait(timeout=budget)
  except BaseException:
   os.killpg(child.pid,signal.SIGTERM)
   try:child.wait(timeout=.2)
   except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
   raise
 row={'label':label,'command':command,'exit':code,'pid':child.pid,'elapsedSeconds':time.monotonic()-start};rows.append(row);print(json.dumps(row),flush=True);return code
try:
 assert run('syntax',[node,'--check',str(r/'harness/scripts/conformance.mjs')],5)==0
 assert run('public-branding',[node,str(out/'public-branding.mjs')],15)==0
 brand=json.loads((out/'public-branding.json').read_text());actual=json.loads(brand['actual']['result']['value']);assert actual['userAgent'].startswith('RedPanda/')and all(item['brand']=='RedPanda'for item in actual['brands']),actual
 injected=next(f['path']for f in mapping['fixtures']if f['profile']=='5c7914276aeb');selection=['node/is_equal_node.html',injected,'net/websocket.html','navigator/navigator.html']
 for index,path in enumerate(selection):
  fixture=next(f for f in mapping['fixtures']if f['path']==path);profile=next(p for p in mapping['profiles']if p['id']==fixture['profile']);report=out/(str(index)+'-fixture.json');command=[node,str(r/'harness/scripts/conformance.mjs'),'--root',str(r/'fixtures/adapted'),'--binary',str(r/'candidate/red-panda-launcher'),'--isolate','--fixture-profile','upstream','--source-load-contract','--websocket-port','9584','--registration-map',str(r/'maps/registration-map.json'),'--runner-global-arg=--ws-max-concurrent','--runner-global-arg=50','--port','9582','--test',path,'--report',str(report)];run('fixture-'+str(index),command,(profile['sourceTimeoutMs']+17000)/1000);payload=json.loads(report.read_text());result=payload['results'][0];assert result['phase']!='browser-setup'if'phase'in result else True
  expected='failed'if path=='navigator/navigator.html'else'passed';assert result['status']==expected,(path,result['status'],result.get('error'));assert result['nativeHarnessBranch']is True and result['observedUserAgent'].startswith('RedPanda/');assert payload['publicUserAgentOverrideApplied']is False and payload['sourceHarnessSHA256']=='2b0e6212c8fce6c8f57d25ec05b1a07b4c1a9448a5dd5510f953b83b10abd92b';assert result['configuration']['fixtureBudgetMs']==profile['sourceTimeoutMs'];assert result['configuration']['runnerGlobalArgs']==['--ws-max-concurrent','50']
except BaseException as error:failure={'type':type(error).__name__,'message':str(error)}
finally:
 after=snapshot();(out/'after.json').write_text(json.dumps(after,indent=2)+'\n');status={'rows':rows,'failure':failure,'inputs':len(before),'unchanged':before==after,'changed':[p for p in before if before[p]!=after[p]],'seconds':time.monotonic()-start,'scope':'one genuine branding process +four fixtures only; navigator nonpass retained, later unexecuted assertions unverified'};(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status),flush=True)
