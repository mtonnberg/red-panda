# Six independent minimal observations plus two cleanup diagnostics, not passes.
import pathlib,subprocess,json,time,hashlib,os,signal,resource
p=pathlib.Path(__file__).resolve().parent;root=pathlib.Path('/workspace/red-panda');out=p/'minimal-node-r1';out.mkdir(exist_ok=False);node='/workspace/shared/rea-tools/node_modules/node/bin/node';sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();names=['src/animations.js','src/window-lifecycle-timers.js','src/invocation.js','src/errors.js','src/browser.js','native/runtime.cc','src/native-runtime.js'];before={n:sha(root/n)for n in names};rows=[];start=time.monotonic()
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
jobs=[(mode,'minimal-node-checkpoint.mjs',mode)for mode in['default-als','default-plain','after-als','after-plain','nested-als','producer-ownership']]+[(mode,'poison-cleanup-probe.mjs',arg)for mode,arg in[('poison-kept','keep'),('poison-restored','restore')]]
for name,script,arg in jobs:
 command=[node,str(p/script),arg];began=time.monotonic()
 with(out/(name+'.stdout')).open('xb')as stdout,(out/(name+'.stderr')).open('xb')as stderr:
  child=subprocess.Popen(command,cwd=root,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=core_zero)
  try:code=child.wait(timeout=min(4,35-(time.monotonic()-start)));expired=False
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
 rows.append({'name':name,'pid':child.pid,'exit':code,'externalDeadline':expired,'seconds':time.monotonic()-began,'command':command})
 (out/'steps.json').write_text(json.dumps(rows,indent=2)+'\n')
after={n:sha(root/n)for n in names};status={'scope':'Independent causal observations, expected negative exits retained; no acceptance count','rows':rows,'sourceBefore':before,'sourceAfter':after,'sourceUnchanged':before==after,'seconds':time.monotonic()-start,'NodeVMBudgetMS':200,'perChildOuterSeconds':4,'totalAdministrativeSeconds':35,'RootEdits':False};(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
raise SystemExit(0 if len(rows)==8 and before==after else 1)
