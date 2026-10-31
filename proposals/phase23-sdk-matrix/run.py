import subprocess,pathlib,time,json,hashlib,re
p=pathlib.Path(__file__).resolve().parent;root=pathlib.Path('/workspace/red-panda');plan=json.loads((p/'plan.json').read_text());source=pathlib.Path(plan['source']);old=pathlib.Path('/workspace/shared/phase23-composed-112-20261031');first=root/'proposals/phase23-first-gate-dacebc';corrected=root/'proposals/phase23-cookie-corrected-gate';expected=json.loads((corrected/'variant-source.json').read_text());original=json.loads((corrected/'base-source.json').read_text());rootMap=json.loads((first/'baseline-source.json').read_text());deps=json.loads((first/'dependencies.json').read_text());out=p/'run-r1';out.mkdir(exist_ok=False);started=time.monotonic();deadline=started+900;rows=[];sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
def snapshot():
 result={}
 for label,folder,files in [('variant',source,expected),('original31',old,original),('Root',root,rootMap),('deps',root,deps)]:
  for name in files:result[label+'/'+name]=sha(folder/name)
 for f in [pathlib.Path(__file__).resolve(),p/'plan.json',first/'physical.mjs']:
  result[str(f)]=sha(f)
 for sdk in plan['SDKs']:result['node-'+sdk['version']]=sha(pathlib.Path(sdk['binary']))
 return result
before=snapshot();assert all(before['variant/'+n]==v for n,v in expected.items());assert all(before['original31/'+n]==v for n,v in original.items());assert all(before['Root/'+n]==v for n,v in rootMap.items());assert all(before['deps/'+n]==v for n,v in deps.items());(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n');failed=False
for sdk in plan['SDKs']:
 version=sdk['version'];node=sdk['binary'];sdkdir=out/version;sdkdir.mkdir();identity=subprocess.run([node,'-p','JSON.stringify({node:process.version,abi:process.versions.modules,v8:process.versions.v8,platform:process.platform,architecture:process.arch})'],cwd=source,capture_output=True,text=True,timeout=5);(sdkdir/'identity.log').write_text(identity.stdout+identity.stderr);assert identity.returncode==0;actual=json.loads(identity.stdout);assert actual['node']=='v'+version
 for kind,src in [('runtime','runtime.cc'),('heap-query','heap-query.cc'),('collections','collections.cc')]:
  binary=source/'native/build/linux-x64'/('node-'+version)/(kind+'.node');m=json.loads(pathlib.Path(str(binary)+'.json').read_text());assert all(str(m[key])==str(actual[key])for key in actual);assert m['binarySHA256']==sha(binary);assert m['sourceSHA256']==sha(source/'native'/src)
 jobs=[('physical117',[node,'--experimental-vm-modules',str(first/'physical.mjs'),str(source),str(sdkdir/'physical.json'),'after'],None)]
 for record in plan['files']:
  command=[node,'--experimental-vm-modules','--test','--test-concurrency=1']
  if record.get('pattern'):command.append('--test-name-pattern='+record['pattern'])
  command.append(record['file']);jobs.append((pathlib.Path(record['file']).stem,command,record['expectedCases']))
 for name,command,expectedCases in jobs:
  remaining=min(120,deadline-time.monotonic())
  if remaining<=0:failed=True;rows.append({'SDK':version,'name':name,'notRun':'Administrative cap'});break
  begin=time.monotonic();logfile=sdkdir/(name+'.log')
  with logfile.open('xb')as log:
   child=subprocess.Popen(command,cwd=source,stdout=log,stderr=subprocess.STDOUT)
   try:code=child.wait(timeout=remaining);status={'exit':code}
   except subprocess.TimeoutExpired:child.kill();child.wait();code=child.returncode;status={'exit':code,'administrativeDeadline':True}
  text=logfile.read_text();count=re.search(r'tests (\d+)',text);passed=re.search(r'pass (\d+)',text);fail=re.search(r'fail (\d+)',text)
  result={'SDK':version,'name':name,'command':command,'seconds':time.monotonic()-begin,**status}
  if expectedCases is not None:
   result.update({'expectedCases':expectedCases,'actualCases':int(count.group(1))if count else None,'pass':int(passed.group(1))if passed else None,'fail':int(fail.group(1))if fail else None})
   if result['actualCases']!=expectedCases:result['countMismatch']=True
  rows.append(result);(out/'status-partial.json').write_text(json.dumps(rows,indent=2)+'\n')
  if code!=0 or result.get('countMismatch'):failed=True;break
 if failed:break
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');summary={'steps':rows,'elapsedSeconds':time.monotonic()-started,'administrativeTotalBudgetSeconds':900,'sourceUnchanged':before==after,'inputs':len(before),'changed':[n for n in before.keys()|after.keys()if before.get(n)!=after.get(n)],'bySDK':{sdk['version']:{'actualTests':sum(row.get('actualCases')or 0 for row in rows if row.get('SDK')==sdk['version']),'pass':sum(row.get('pass')or 0 for row in rows if row.get('SDK')==sdk['version']),'fail':sum(row.get('fail')or 0 for row in rows if row.get('SDK')==sdk['version'])}for sdk in plan['SDKs']},'scope':'Focused selected file/pattern matrix only; no full/broad/heap/build/Source/Native75or320 repetition','RootApplied':False};(out/'status.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({k:v for k,v in summary.items()if k!='steps'}));raise SystemExit(0 if not failed and before==after and len(rows)==3*(len(plan['files'])+1)else 1)
