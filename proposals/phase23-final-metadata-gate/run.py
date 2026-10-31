import subprocess,pathlib,time,json,hashlib,re
p=pathlib.Path(__file__).resolve().parent;root=pathlib.Path('/workspace/red-panda');source=pathlib.Path('/workspace/shared/phase23-composed-final-metadata-20261031');old=pathlib.Path('/workspace/shared/phase23-composed-112-cookie-shape-v3-20261031');node='/workspace/shared/rea-tools/node_modules/node/bin/node';out=p/'run-r1';out.mkdir(exist_ok=False);started=time.monotonic();deadline=started+120;rows=[];sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();expected=json.loads((p/'final-source.json').read_text());prior=json.loads((p/'shape-v3-source.json').read_text());base=json.loads((p/'root-source.json').read_text());deps=json.loads((root/'proposals/phase23-first-gate-dacebc/dependencies.json').read_text())
def snapshot():
 result={}
 for label,folder,names in [('final',source,expected),('shapeV3',old,prior),('Root',root,base),('deps',root,deps)]:
  for name in names:result[label+'/'+name]=sha(folder/name)
 for f in [pathlib.Path(__file__).resolve(),p/'branding.mjs']:result[str(f)]=sha(f)
 return result
before=snapshot();assert all(before['final/'+n]==v for n,v in expected.items());assert all(before['shapeV3/'+n]==v for n,v in prior.items());assert all(before['Root/'+n]==v for n,v in base.items());assert all(before['deps/'+n]==v for n,v in deps.items());(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n')
records=[('cookie-ingress',7,None),('cdp-cookie-metadata',5,None),('utility-node-target-binding',2,None),('document-interface-realms',6,None),('manual-document-realms',6,None),('private-event-utility-backing',2,None),('location-factory',1,'utility Location aliases'),('window-viewport-parity',1,'canonical Target and new typed receivers')];jobs=[]
for name,count,pattern in records:
 command=[node,'--experimental-vm-modules','--test','--test-concurrency=1']
 if pattern:command.append('--test-name-pattern='+pattern)
 command.append('test/'+name+'.test.js');jobs.append((name,command,count))
jobs.append(('RedPanda-branding',[node,'--experimental-vm-modules',str(p/'branding.mjs'),str(source),str(out/'branding.json')],None))
for name,command,count in jobs:
 remaining=deadline-time.monotonic()
 if remaining<=0:rows.append({'name':name,'notRun':'120s administrative cap'});break
 begin=time.monotonic();logfile=out/(name+'.log')
 with logfile.open('xb')as log:
  child=subprocess.Popen(command,cwd=source,stdout=log,stderr=subprocess.STDOUT)
  try:code=child.wait(timeout=remaining);status={'exit':code}
  except subprocess.TimeoutExpired:child.kill();child.wait();code=child.returncode;status={'exit':code,'administrativeDeadline':True}
 result={'name':name,'command':command,'seconds':time.monotonic()-begin,**status}
 if count is not None:
  text=logfile.read_text();n=re.search(r'tests (\d+)',text);a=re.search(r'pass (\d+)',text);b=re.search(r'fail (\d+)',text);result.update({'expected':count,'actual':int(n.group(1))if n else None,'pass':int(a.group(1))if a else None,'fail':int(b.group(1))if b else None});result['countMatches']=result['actual']==count
 rows.append(result);(out/'status-partial.json').write_text(json.dumps(rows,indent=2)+'\n')
 if code!=0 or result.get('countMatches')is False:break
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');summary={'steps':rows,'elapsedSeconds':time.monotonic()-started,'sourceUnchanged':before==after,'inputs':len(before),'changed':[n for n in before.keys()|after.keys()if before.get(n)!=after.get(n)],'actualTests':sum(r.get('actual')or 0 for r in rows),'pass':sum(r.get('pass')or 0 for r in rows),'fail':sum(r.get('fail')or 0 for r in rows),'RootApplied':False,'scope':'Brief combined Node24 gate only, no190repeat/CPPbuild/Rootedit'};(out/'status.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary));raise SystemExit(0 if len(rows)==len(jobs)and all(r.get('exit')==0 and r.get('countMatches')is not False for r in rows)and before==after else 1)
