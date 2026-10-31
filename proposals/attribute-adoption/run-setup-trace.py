import subprocess,pathlib,time,json,hashlib
p=pathlib.Path(__file__).resolve().parent;css=p.parent/'computed-style-defaults';standalone=pathlib.Path('/workspace/shared/attribute-adoption-20261031');composed=pathlib.Path('/workspace/shared/computed-style-context-phase22-r2-20261031');node='/workspace/shared/rea-tools/node_modules/node/bin/node';out=p/'setup-trace-r1';out.mkdir(exist_ok=False);started=time.monotonic();steps=[]
def snapshot():
 result={}
 for label,root in [('standalone',standalone),('composed',composed)]:
  for folder in ['src','test','native','bin','scripts','oracle']:
   for f in sorted((root/folder).rglob('*')):
    if f.is_file():result[label+'/'+str(f.relative_to(root))]=hashlib.sha256(f.read_bytes()).hexdigest()
 for f in [pathlib.Path(__file__).resolve(),css/'candidate-owner-stack.mjs',css/'owner-stack-expression.js']:result[str(f)]=hashlib.sha256(f.read_bytes()).hexdigest()
 return result
before=snapshot();(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n')
for name,command,cwd in [('standalone3',[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/attribute-adoption.test.js'],standalone),('owner-stack',[node,'--experimental-vm-modules',str(css/'candidate-owner-stack.mjs'),str(composed),str(out/'owner-stack.json')],composed)]:
 remaining=5-(time.monotonic()-started)
 if remaining<=0:steps.append({'name':name,'notRun':'5s diagnostic deadline'});break
 begin=time.monotonic()
 with(out/(name+'.log')).open('xb')as log:
  child=subprocess.Popen(command,cwd=cwd,stdout=log,stderr=subprocess.STDOUT)
  try:code=child.wait(timeout=remaining);status={'exit':code}
  except subprocess.TimeoutExpired:child.kill();child.wait();status={'exit':child.returncode,'deadline':True}
 steps.append({'name':name,'seconds':time.monotonic()-begin,**status})
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'steps':steps,'elapsedSeconds':time.monotonic()-started,'diagnosticBudgetSeconds':5,'sourceUnchanged':before==after,'inputs':len(before)};(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if len(steps)==2 and all(s.get('exit')==0 for s in steps)and before==after else 1)
