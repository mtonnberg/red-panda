import subprocess,pathlib,time,json,hashlib
p=pathlib.Path(__file__).resolve().parent
candidate=pathlib.Path('/workspace/shared/computed-style-context-phase22-r2-20261031')
node='/workspace/shared/rea-tools/node_modules/node/bin/node'
out=p/'owner-final-r1';out.mkdir(exist_ok=False)
started=time.monotonic();deadline=started+15;steps=[]
def snapshot():
 result={}
 for folder in ['src','test','native','bin','scripts','oracle']:
  for f in sorted((candidate/folder).rglob('*')):
   if f.is_file():result[str(f.relative_to(candidate))]=hashlib.sha256(f.read_bytes()).hexdigest()
 for f in [pathlib.Path(__file__).resolve(),p/'native-owner-document.mjs',p/'owner-document-expression.js',p/'candidate-matrix.mjs',*p.glob('*-expression.js'),p.parent/'programmatic-namespace/interface-expression.js']:
  result[str(f)]=hashlib.sha256(f.read_bytes()).hexdigest()
 return result
before=snapshot();(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n')
for name,command in [
 ('native-owner',[node,str(p/'native-owner-document.mjs'),'/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux',str(out/'native-owner.json')]),
 ('five-focused',[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/computed-style-defaults.test.js']),
 ('candidate-final',[node,'--experimental-vm-modules',str(p/'candidate-matrix.mjs'),str(candidate),str(out/'after.json')])
]:
 remaining=deadline-time.monotonic()
 if remaining<=0:steps.append({'name':name,'notRun':'15s aggregate deadline'});break
 begin=time.monotonic()
 with (out/(name+'.log')).open('xb')as log:
  child=subprocess.Popen(command,cwd=candidate,stdout=log,stderr=subprocess.STDOUT)
  try:code=child.wait(timeout=remaining);status={'exit':code}
  except subprocess.TimeoutExpired:child.kill();child.wait();status={'exit':child.returncode,'deadline':True}
 steps.append({'name':name,'command':command,'seconds':time.monotonic()-begin,**status});(out/'status-partial.json').write_text(json.dumps(steps,indent=2)+'\n')
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n')
status={'steps':steps,'elapsedSeconds':time.monotonic()-started,'diagnosticBudgetSeconds':15,'sourceUnchanged':before==after,'inputs':len(before),'changed':[key for key in before.keys()|after.keys()if before.get(key)!=after.get(key)]};(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
raise SystemExit(0 if len(steps)==3 and all(step.get('exit')==0 for step in steps)and before==after else 1)
