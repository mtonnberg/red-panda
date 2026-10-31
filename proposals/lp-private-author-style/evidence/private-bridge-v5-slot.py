from pathlib import Path
import subprocess,json,time,hashlib,os,signal,sys
p=Path.cwd();c=p/'candidate';phase=sys.argv[1]if len(sys.argv)>1 else'seven';sdk=sys.argv[2]if len(sys.argv)>2 else'24.22.1';nodes={'24.22.1':'/workspace/shared/rea-tools/node_modules/node/bin/node','24.19.0':'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node','26.13.0':'/workspace/shared/node26/node_modules/node/bin/node'};node=nodes[sdk]
inputs=json.loads((p/'evidence/corrected-v5-inputs.json').read_text());state=lambda:{n:hashlib.sha256((p/n).read_bytes()).hexdigest()for n in inputs};assert state()==inputs
frozen=json.loads(Path('/workspace/red-panda/.cache/validation/phase22-full-diagnostic/full-source-before.json').read_text());deps={n:h for n,h in frozen.items()if n.startswith('node_modules/')};depstate=lambda:{n:hashlib.sha256((Path('/workspace/red-panda')/n).read_bytes()).hexdigest()for n in deps};assert depstate()==deps
output=p/('evidence/corrected-v5-'+phase+'-'+sdk);cwd=c;outer=45
if phase=='detached':command=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/lp-private-detached-documents.test.js']
elif phase=='prior':
 command=[node,'--experimental-vm-modules','--test','--test-concurrency=1',*['test/'+name+'.test.js'for name in['lp-private-slot-renderer','lp-private-paragraphs','lp-private-author-style','cssom-private-realms','cssom','styles','selectors','css-compat','dump','lp-aliases']]];outer=90
elif phase=='seven':command=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/lp-private-author-style.test.js']
elif phase=='slot':command=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/lp-private-slot-renderer.test.js']
elif phase=='paragraphs':command=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/lp-private-paragraphs.test.js']
elif phase=='realms':command=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/cssom-private-realms.test.js']
elif phase=='regressions':
 command=[node,'--experimental-vm-modules','--test','--test-concurrency=1',*['test/'+name+'.test.js'for name in['cssom','styles','selectors','css-compat','dump','lp-aliases']]];outer=90
elif phase in['owner','cache']:
 assert sdk=='24.22.1','Raw candidate CLI wrapper is pinned to Node24.22.1';cwd=p;probe='candidate-renderer-owner-probe.mjs'if phase=='owner'else'style-cache-probe.mjs';command=[node,'--experimental-vm-modules','evidence/'+probe,str(p/'evidence/candidate-cli'),str(output)+'.json'];outer=20
else:raise ValueError(phase)
env=os.environ.copy();union=list(dict.fromkeys([v.strip()for key in['NO_PROXY','no_proxy']for v in env.get(key,'').split(',')if v.strip()]+['localhost','.localhost','127.0.0.1','::1','[::1]','0.0.0.0']));env['NODE_USE_ENV_PROXY']='1';env['NO_PROXY']=env['no_proxy']=','.join(union)
start=time.monotonic();watchdog=False
with Path(str(output)+'.log').open('xb')as log:
 child=subprocess.Popen(command,cwd=cwd,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env=env)
 try:code=child.wait(timeout=outer)
 except subprocess.TimeoutExpired:
  watchdog=True;os.killpg(child.pid,signal.SIGTERM)
  try:code=child.wait(timeout=3)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
after=state();afterdeps=depstate();result={'phase':phase,'sdk':sdk,'command':command,'cwd':str(cwd),'exit':code,'seconds':time.monotonic()-start,'outerWatchdog':outer,'cleanupGrace':3,'watchdogTriggered':watchdog,'sourceInputs':len(inputs),'changed':[n for n in inputs if after[n]!=inputs[n]],'dependencyInputs':len(deps),'dependencyChanged':[n for n in deps if afterdeps[n]!=deps[n]],'canonicalEnv':{'NODE_USE_ENV_PROXY':env['NODE_USE_ENV_PROXY'],'equalBypassLists':env['NO_PROXY']==env['no_proxy'],'unionSHA256':hashlib.sha256(env['NO_PROXY'].encode()).hexdigest(),'proxyTLSPreserved':all(env.get(n)==os.environ.get(n)for n in['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','http_proxy','https_proxy','all_proxy','NODE_TLS_REJECT_UNAUTHORIZED','NODE_EXTRA_CA_CERTS','SSL_CERT_FILE','SSL_CERT_DIR'])},'controllerSHA256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
semanticFailure=False
if phase in['owner','cache']and Path(str(output)+'.json').exists():
 raw=json.loads(Path(str(output)+'.json').read_text());result['observations']={'groups':len(raw['groups']),'completed':sum(g['completed']for g in raw['groups']),'failures':[{'name':g['name'],'failure':g.get('failure')}for g in raw['groups']if not g['completed']],'producerPID':raw.get('pid'),'producerPresentAfterCleanup':Path('/proc/'+str(raw.get('pid'))).exists()}
 native=json.loads((p/('evidence/native-renderer-owner.json'if phase=='owner'else'evidence/native-style-cache.json')).read_text());expectedGroups=4 if phase=='owner'else 9;semanticFailure=len(raw['groups'])!=expectedGroups or any(not g.get('completed')for g in raw['groups'])or bool(raw.get('failure'))or result['observations']['producerPresentAfterCleanup'];comparisons=[];unobserved=[]
 for group in raw['groups']:
  original=next((g for g in native['groups']if g['name']==group['name']),None)
  for row in group['steps']:
   if row['method']!='LP.getMarkdown':continue
   known=next((s for s in original['steps']if s['label']==row['label']and s['method']=='LP.getMarkdown'and 'result'in s),None)if original else None
   if known is None:unobserved.append({'group':group['name'],'label':row['label']});continue
   expected=json.loads(json.dumps(known['result']).replace(native['origin'],raw['origin']));actual=row.get('result');comparison={'group':group['name'],'label':row['label'],'expected':expected,'actual':actual,'match':expected==actual};comparisons.append(comparison)
 result['observedMarkdownComparisons']=comparisons;result['nativeUnobservedMarkdownRows']=unobserved;result['nativeCompletedGroups']=sum(g['completed']for g in native['groups']);semanticFailure=semanticFailure or any(not row['match']for row in comparisons)
result['controllerPass']=code==0 and not watchdog and not result['changed']and not result['dependencyChanged']and not semanticFailure
Path(str(output)+'-status.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True);sys.exit(0 if result['controllerPass']else 1)
