import subprocess,pathlib,time,json,hashlib
p=pathlib.Path(__file__).resolve().parent;root=pathlib.Path('/workspace/red-panda');source=pathlib.Path('/workspace/shared/phase23-composed-112-cookie-v2-20261031');old=pathlib.Path('/workspace/shared/phase23-composed-112-20261031');node='/workspace/shared/rea-tools/node_modules/node/bin/node';out=p/'run-r1';out.mkdir(exist_ok=False);started=time.monotonic();deadline=started+120;steps=[];first=root/'proposals/phase23-first-gate-dacebc';css=root/'proposals/computed-style-defaults';deco=root/'proposals/css-text-decoration'
expected=json.loads((p/'variant-source.json').read_text());original=json.loads((p/'base-source.json').read_text());rootMap=json.loads((first/'baseline-source.json').read_text());deps=json.loads((first/'dependencies.json').read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
def snapshot():
 result={}
 for label,base,names in [('variant',source,expected),('original31',old,original),('Root',root,rootMap),('deps',root,deps)]:
  for name in names:result[label+'/'+name]=sha(base/name)
 for f in [pathlib.Path(__file__).resolve(),p/'compare.py',deco/'candidate-probe.mjs',deco/'text-decoration-expression.js',css/'candidate-matrix.mjs',root/'proposals/focus-owner-document/candidate-probe.mjs',deco/'native.json',css/'native-four.json',css/'native-state.json',root/'proposals/programmatic-namespace/native-interfaces.json',root/'proposals/attribute-adoption/focused-r1/native.json',css/'owner-final-r1/native-owner.json',root/'proposals/focus-owner-document/native-focus-owner.json',root/'proposals/css-text-decoration/candidate-r1/evidence/comparison.json']:
  result[str(f)]=sha(f)
 return result
before=snapshot();assert all(before['variant/'+n]==v for n,v in expected.items());assert all(before['original31/'+n]==v for n,v in original.items());assert all(before['Root/'+n]==v for n,v in rootMap.items());assert all(before['deps/'+n]==v for n,v in deps.items());(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n');test=lambda file:[node,'--experimental-vm-modules','--test','--test-concurrency=1',file]
jobs=[(name,test('test/'+name+'.test.js'))for name in ['attribute-adoption','computed-style-defaults','computed-text-decoration','cookie-ingress','cookies','request-metadata','sync-http-lazy']]+[
 ('Native75',[node,'--experimental-vm-modules',str(deco/'candidate-probe.mjs'),str(source),str(out/'actual75.json')]),
 ('Native320',[node,'--experimental-vm-modules',str(css/'candidate-matrix.mjs'),str(source),str(out/'actual320.json')]),
 ('authored3',[node,'--experimental-vm-modules',str(root/'proposals/focus-owner-document/candidate-probe.mjs'),str(source),str(out/'authored3.json')]),
 ('all-field-comparison',['python3',str(p/'compare.py'),str(out)])]
for name,command in jobs:
 remaining=deadline-time.monotonic()
 if remaining<=0:steps.append({'name':name,'notRun':'120s administrative cap'});break
 begin=time.monotonic()
 with(out/(name+'.log')).open('xb')as log:
  child=subprocess.Popen(command,cwd=source,stdout=log,stderr=subprocess.STDOUT)
  try:code=child.wait(timeout=remaining);status={'exit':code}
  except subprocess.TimeoutExpired:child.kill();child.wait();code=child.returncode;status={'exit':code,'administrativeDeadline':True}
 steps.append({'name':name,'command':command,'seconds':time.monotonic()-begin,**status});(out/'status-partial.json').write_text(json.dumps(steps,indent=2)+'\n')
 if code!=0:break
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');summary={'SDK':'Node24.22.1','steps':steps,'elapsedSeconds':time.monotonic()-started,'administrativeBudgetSeconds':120,'sourceUnchanged':before==after,'inputs':len(before),'changed':[name for name in before.keys()|after.keys()if before.get(name)!=after.get(name)],'RootApplied':False,'cookieMetadataResidual':'Preexisting priorityMedium remains; no complete Cookie parity claim'};(out/'status.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary));raise SystemExit(0 if len(steps)==len(jobs)and all(s.get('exit')==0 for s in steps)and before==after else 1)
