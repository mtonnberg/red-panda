import subprocess,pathlib,time,json,hashlib
p=pathlib.Path(__file__).resolve().parent;css=p.parent/'computed-style-defaults';standalone=pathlib.Path('/workspace/shared/attribute-adoption-20261031');composed=pathlib.Path('/workspace/shared/computed-style-context-phase22-r2-20261031');node='/workspace/shared/rea-tools/node_modules/node/bin/node';out=p/'focused-r3';out.mkdir(exist_ok=False);started=time.monotonic();deadline=started+15;steps=[]
def snapshot():
 result={}
 for label,root in [('standalone',standalone),('composed',composed)]:
  for folder in ['src','test','native','bin','scripts','oracle']:
   for f in sorted((root/folder).rglob('*')):
    if f.is_file():result[label+'/'+str(f.relative_to(root))]=hashlib.sha256(f.read_bytes()).hexdigest()
 for f in [pathlib.Path(__file__).resolve(),p/'focused-r1/native.json',css/'owner-final-r1/native-owner.json',p/'native-probe.mjs',p/'expression.js',p.parent/'focus-owner-document/candidate-probe.mjs',p.parent/'focus-owner-document/native-focus-owner.json',css/'candidate-owner-stack.mjs',css/'candidate-matrix.mjs',*css.glob('*-expression.js'),p.parent/'programmatic-namespace/interface-expression.js']:
  result[str(f)]=hashlib.sha256(f.read_bytes()).hexdigest()
 return result
before=snapshot();(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n')
jobs=[('composed6',[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/computed-style-defaults.test.js'],composed),('composed320',[node,'--experimental-vm-modules',str(css/'candidate-matrix.mjs'),str(composed),str(out/'after.json')],composed),('actual-controls',[node,'--experimental-vm-modules',str(p.parent/'focus-owner-document/candidate-probe.mjs'),str(composed),str(out/'candidate.json')],composed),('owner-stack',[node,'--experimental-vm-modules',str(css/'candidate-owner-stack.mjs'),str(composed),str(out/'owner-stack.json')],composed)]
for name,command,cwd in jobs:
 remaining=deadline-time.monotonic()
 if remaining<=0:steps.append({'name':name,'notRun':'15s aggregate deadline'});break
 begin=time.monotonic()
 with(out/(name+'.log')).open('xb')as log:
  child=subprocess.Popen(command,cwd=cwd,stdout=log,stderr=subprocess.STDOUT)
  try:code=child.wait(timeout=remaining);status={'exit':code}
  except subprocess.TimeoutExpired:child.kill();child.wait();status={'exit':child.returncode,'deadline':True}
 steps.append({'name':name,'command':command,'seconds':time.monotonic()-begin,**status});(out/'status-partial.json').write_text(json.dumps(steps,indent=2)+'\n')
controlsEqual=False;stackReads=None
if(out/'candidate.json').exists()and(out/'owner-stack.json').exists():
 actual={row['name']:row for row in json.loads((out/'candidate.json').read_text())['rows']}
 nativeAdoption=json.loads((p/'focused-r1/native.json').read_text())['rows'][0]
 nativeOwner=json.loads((css/'owner-final-r1/native-owner.json').read_text())['rows'][0]
 nativeFocus=json.loads((p.parent/'focus-owner-document/native-focus-owner.json').read_text())['rows'][0]
 controlsEqual=all(actual[name]['expressionSHA256']==native['expressionSHA256']and actual[name].get('value')==native['value']for name,native in [('adoption',nativeAdoption),('owner',nativeOwner),('focus',nativeFocus)])
 stackReads=json.loads((out/'owner-stack.json').read_text()).get('value',{}).get('reads')
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'steps':steps,'elapsedSeconds':time.monotonic()-started,'diagnosticBudgetSeconds':15,'sourceUnchanged':before==after,'inputs':len(before),'changed':[k for k in before.keys()|after.keys()if before.get(k)!=after.get(k)],'actualControlsEqualNative':controlsEqual,'actualGetterReads':stackReads};(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if len(steps)==len(jobs)and all(step.get('exit')==0 for step in steps)and before==after and controlsEqual and stackReads==0 else 1)
