from pathlib import Path
import hashlib,json,os,signal,subprocess,time
root=Path(__file__).resolve().parent.parent;e=root/'evidence';start=time.monotonic();admin=180;reserve=5
sdks=[Path('/workspace/shared/rea-tools/node_modules/node/bin/node'),Path('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),Path('/workspace/shared/node26/node_modules/node/bin/node')]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def guard():
 result={}
 for top in ['src','test','scripts','bin','helpers','native','node_modules']:
  for p in(root/top).rglob('*'):
   if p.is_file()and'__pycache__'not in p.parts:result[str(p.relative_to(root))]=sha(p)
 for name in ['package.json','package-lock.json']:result[name]=sha(root/name)
 for i,node in enumerate(sdks):result['sdk/'+str(i)]=sha(node)
 for label,path in native_files.items():result['nativeEvidence/'+label]=sha(path)
 return result
native_files={
 'core':Path('/workspace/shared/network-body-ledger-profile/handoff/baseline-r1/evidence/native-core.json'),
 'extra':Path('/workspace/shared/network-body-owned-extras/handoff/native-r1/evidence/native-extra.json'),
 'owners':Path('/workspace/shared/network-body-owned-extras/handoff/native-r1/evidence/native-owners.json'),
 'boundary':Path('/workspace/shared/network-body-boundaries/handoff/native-r1/evidence/native-boundary.json'),
}
def compare_profile(label,actual):
 expected=json.loads(native_files[label].read_text());methods={'Network.getResponseBody','Network.getRequestPostData','Network.enable','Network.disable'}
 def rows(value):
  result={}
  for r in value['rows']:
   if r.get('method')not in methods:continue
   if 'result'in r:result[r['label']]={'result':r['result']}
   elif 'error'in r:result[r['label']]={'error':{key:r['error'].get(key)for key in ['code','message']}}
   else:result[r['label']]={'classification':r.get('classification')}
  return result
 def post_fields(value):
  result={}
  for capture in value.get('captures',[]):
   events=capture.get('events',[])
   request=next((ev['params']['request']for ev in events if ev.get('method')=='Network.requestWillBeSent'and ev['params']['request']['url']==capture['url']),None)
   if request is not None:result[capture['label']]={key:request[key]for key in ['hasPostData','postData','postDataEntries']if key in request}
  return result
 def wire_bodies(value):
  if 'requests'in value:return[(r['method'],r['url'],r['requestBodyHex'],r['responseBodyHex'])for r in value['requests']]
  return[(m['record']['method'],m['record']['url'],m['record']['requestHex'],m['record']['responseHex'])for m in value['serverEvents']if m['kind']=='request']
 expected_rows,actual_rows=rows(expected),rows(actual);expected_posts,actual_posts=post_fields(expected),post_fields(actual)
 differences=[]
 for category,left,right in [('bodyAPIAndLimits',expected_rows,actual_rows),('inlinePOSTFields',expected_posts,actual_posts)]:
  for key in sorted(left.keys()|right.keys()):
   if left.get(key)!=right.get(key):differences.append({'category':category,'label':key,'native':left.get(key),'candidate':right.get(key)})
 if wire_bodies(expected)!=wire_bodies(actual):differences.append({'category':'actualHTTPPayloads','native':wire_bodies(expected),'candidate':wire_bodies(actual)})
 report={'profile':label,'nativeSource':str(native_files[label]),'nativeSHA256':sha(native_files[label]),'candidateSource':str(e/('candidate-'+label+'.json')),'candidateSHA256':sha(e/('candidate-'+label+'.json')),'bodyRows':len(expected_rows),'inlinePOSTRows':len(expected_posts),'actualHTTPRows':len(wire_bodies(expected)),'differences':differences,'equal':not differences,'boundary':'Only request IDs and ephemeral origins are linked by genuine helper capture labels. Full bodyAPI/limit result/error payloads, all inlinePOST field presence/values, and every actual HTTP method/path/request/response byte sequence compared. Full unfiltered raw wire remains retained. Header/URL/clock metadata and engine branding are outside this byte comparison.'}
 (e/('comparison-'+label+'.json')).write_text(json.dumps(report,indent=2)+'\n');return report
before=guard();(e/'validation-before.json').write_text(json.dumps(before,indent=2)+'\n')
commands=[];node=sdks[0]
for name,args in [('core',['helpers/core-profile.mjs',str(root),'evidence/candidate-core.json']),('extra',['helpers/extra-profile.mjs',str(root),'extra','evidence/candidate-extra.json']),('owners',['helpers/extra-profile.mjs',str(root),'owners','evidence/candidate-owners.json']),('boundary',['helpers/boundary-profile.mjs',str(root),'boundary','evidence/candidate-boundary.json'])]:commands.append((name,node,['--experimental-vm-modules',*args]))
for index,node in enumerate(sdks):
 commands.append(('focus-'+str(index),node,['--experimental-vm-modules','--test','--test-concurrency=1','test/network-body-capture.test.js','test/fetch.test.js','test/worker-fetch.test.js','test/window-sync-xhr.test.js']))
 commands.append(('plaintext-'+str(index),node,['--experimental-vm-modules','--test','--test-concurrency=1','--test-name-pattern=plain-text and JSON responses','test/browser.test.js']))
runs=[]
prior=','.join(filter(None,[os.environ.get('NO_PROXY',''),os.environ.get('no_proxy','')]))
env=dict(os.environ,**{key:','.join(filter(None,[prior,'127.0.0.1,localhost,::1,[::1],0.0.0.0']))for key in ['NO_PROXY','no_proxy']})
for label,node,args in commands:
 remaining=admin-(time.monotonic()-start)-reserve
 if remaining<=0:runs.append({'label':label,'notStarted':'No watchdog allowance remains'});break
 with(e/('validation-'+label+'.stdout')).open('xb')as stdout,(e/('validation-'+label+'.stderr')).open('xb')as stderr:
  begin=time.monotonic();p=subprocess.Popen([str(node),*args],cwd=root,env=env,stdout=stdout,stderr=stderr,start_new_session=True)
  row={'label':label,'command':[str(node),*args],'ownedProcessGroup':p.pid,'watchdogSeconds':min(remaining,40)if label in ['core','extra','owners','boundary']else remaining}
  try:row['exit']=p.wait(timeout=row['watchdogSeconds'])
  except BaseException as error:
   row['controllerError']=repr(error)
   for sig in [signal.SIGTERM,signal.SIGKILL]:
    try:os.killpg(p.pid,sig)
    except ProcessLookupError:pass
    if sig==signal.SIGTERM:
     try:p.wait(timeout=.25)
     except subprocess.TimeoutExpired:pass
   row['exit']=p.wait()
  row['seconds']=time.monotonic()-begin;runs.append(row);print(json.dumps(row),flush=True)
  if row['exit']!=0:break
 # Actual helper transport/setup failures must not be promoted to success.
 if label in ['core','extra','owners','boundary']:
  actual=json.loads((e/('candidate-'+label+'.json')).read_text())
  if actual.get('failure')or actual.get('terminal')or actual.get('transportTerminal'):
   row['rawProfileFailed']=True;break
  comparison=compare_profile(label,actual);row['comparisonEqual']=comparison['equal'];print(json.dumps({'profile':label,'comparisonEqual':comparison['equal'],'bodyRows':comparison['bodyRows'],'inlinePOSTRows':comparison['inlinePOSTRows'],'actualHTTPRows':comparison['actualHTTPRows']}),flush=True)
  if not comparison['equal']:break
after=guard();(e/'validation-after.json').write_text(json.dumps(after,indent=2)+'\n')
status={'runs':runs,'adminSeconds':admin,'seconds':time.monotonic()-start,'stable':before==after,'inputs':len(before),'boundary':'Owned929 byte-ledger draft only. Four actual same-helper wire profiles on24.22;38focused plus1originalplaintext test per SDK. No Root/current composition or full suite accepted. Original per-test/API diagnostic budgets unchanged.'}
(e/'validation-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
raise SystemExit(0 if before==after and len(runs)==len(commands)and all(r['exit']==0 and not r.get('rawProfileFailed')and r.get('comparisonEqual',True)for r in runs)else 1)
