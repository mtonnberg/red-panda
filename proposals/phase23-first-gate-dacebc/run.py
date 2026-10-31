import subprocess,pathlib,time,json,hashlib
p=pathlib.Path(__file__).resolve().parent;root=pathlib.Path('/workspace/red-panda');baseline=pathlib.Path('/workspace/shared/phase23-baseline-dacebc-20261031');composed=pathlib.Path('/workspace/shared/phase23-composed-112-20261031');node='/workspace/shared/rea-tools/node_modules/node/bin/node';out=p/'run-r1';out.mkdir(exist_ok=False);started=time.monotonic();steps=[];deadline=started+90
expectedBase=json.loads((p/'baseline-source.json').read_text());expectedComposed=json.loads((p/'composed-source.json').read_text());expectedDeps=json.loads((p/'dependencies.json').read_text());sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
def snapshot():
 result={}
 for prefix,folder,expected in [('baseline',baseline,expectedBase),('composed',composed,expectedComposed),('Root',root,expectedBase),('deps',root,expectedDeps)]:
  for name,wanted in expected.items():result[prefix+'/'+name]=sha(folder/name)
 result['controller']=sha(pathlib.Path(__file__).resolve());result['physical-driver']=sha(p/'physical.mjs');return result
before=snapshot();assert all(before['baseline/'+n]==v and before['Root/'+n]==v for n,v in expectedBase.items());assert all(before['composed/'+n]==v for n,v in expectedComposed.items());assert all(before['deps/'+n]==v for n,v in expectedDeps.items());(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n')
test=lambda *args:[node,'--experimental-vm-modules','--test','--test-concurrency=1',*args]
jobs=[
 ('physical-baseline',[node,'--experimental-vm-modules',str(p/'physical.mjs'),str(baseline),str(out/'physical-baseline.json'),'before'],baseline),
 ('physical-composed',[node,'--experimental-vm-modules',str(p/'physical.mjs'),str(composed),str(out/'physical-composed.json'),'after'],composed),
 ('foundational6',test('test/foundational-interface-realms.test.js'),composed),
 ('utility-storage2',test('test/utility-node-target-binding.test.js'),composed),
 ('Location2',test('--test-name-pattern=the first actual Location front|utility Location aliases','test/location-factory.test.js'),composed),
 ('manual19-six',test('test/manual-element-realms.test.js'),composed),
 ('retained-scroll2',test('--test-name-pattern=real Element scroll dispatch|canonical Target and new typed receivers','test/window-viewport-parity.test.js'),composed),
 ('Document6',test('test/document-interface-realms.test.js'),composed),
 ('manualDocument9-six',test('test/manual-document-realms.test.js'),composed),
 ('additional2',test('--test-name-pattern=three original public interfaces|Select retains the sole original','test/additional-control-interface-realms.test.js'),composed),
 ('Option2',test('--test-name-pattern=Option alias and its canonical|V8 resolves actual newTarget','test/option-alias.test.js'),composed),
]
for name,command,cwd in jobs:
 remaining=deadline-time.monotonic()
 if remaining<=0:steps.append({'name':name,'notRun':'90s administrative deadline'});break
 begin=time.monotonic()
 with(out/(name+'.log')).open('xb')as log:
  child=subprocess.Popen(command,cwd=cwd,stdout=log,stderr=subprocess.STDOUT)
  try:code=child.wait(timeout=remaining);status={'exit':code}
  except subprocess.TimeoutExpired:child.kill();child.wait();code=child.returncode;status={'exit':code,'administrativeDeadline':True}
 steps.append({'name':name,'command':command,'seconds':time.monotonic()-begin,**status});(out/'status-partial.json').write_text(json.dumps(steps,indent=2)+'\n')
 if code!=0:break
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');result={'rootCommit':'dacebc3377c4057fb56e0f628be28b6494de6d7c','steps':steps,'elapsedSeconds':time.monotonic()-started,'administrativeBudgetSeconds':90,'sourceUnchanged':before==after,'inputs':len(before),'changed':[n for n in before.keys()|after.keys()if before.get(n)!=after.get(n)],'cookieFunctionalAcceptance':'BLOCKED; no Cookiefunctional tests executed','SDK':'24.22.1 only; nootherSDK/broad/heap/build/source claim'};(out/'status.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));raise SystemExit(0 if len(steps)==len(jobs)and all(s.get('exit')==0 for s in steps)and before==after else 1)
