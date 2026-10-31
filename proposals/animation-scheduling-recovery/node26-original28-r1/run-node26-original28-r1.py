import pathlib,json,hashlib,subprocess,time,os,signal,resource,re
p=pathlib.Path(__file__).resolve().parent;r=pathlib.Path('/workspace/red-panda');s=pathlib.Path('/workspace/shared/animation-scheduler-only-20261031');out=p/'node26-original28-r1';out.mkdir(exist_ok=False);node='/workspace/shared/node26/node_modules/node/bin/node';sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();base=json.loads((p/'scheduler-only-static-r1/base-source.json').read_text());candidate=json.loads((p/'scheduler-only-static-r1/candidate-source.json').read_text());deps=json.loads((r/'proposals/phase23-first-gate-dacebc/dependencies.json').read_text());native=json.loads((r/'proposals/phase23-first-gate-dacebc/native18.json').read_text())
def snapshot():
 result={}
 for label,folder,items in [('Root',r,base),('candidate',s,candidate),('dependencies',r,deps),('RootNative18',r,native),('copiedNative18',s,native)]:
  for name,h in items.items():value=sha(folder/name);assert value==h,(label,name);result[label+'/'+name]=value
 for f in [pathlib.Path(node),pathlib.Path(__file__)]:result[str(f)]=sha(f)
 return result
before=snapshot();(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n');env=os.environ.copy();env['NODE_USE_ENV_PROXY']='1'
for key in['NO_PROXY','no_proxy']:env[key]=','.join(dict.fromkeys([v.strip()for v in env.get(key,'').split(',')if v.strip()]+['127.0.0.1','localhost','0.0.0.0','::1','[::1]']))
(out/'environment.json').write_text(json.dumps({k:env[k]for k in['NODE_USE_ENV_PROXY','NO_PROXY','no_proxy']},indent=2)+'\n');env['ANIMATION_CONTEXT_EVIDENCE']=str(out/'actual-animation-context.json');env['RED_PANDA_WINDOW_TASK_PROOF']=str(out/'actual-window-context.json');command=[node,'--experimental-vm-modules','--test','--test-concurrency=1',*[f'test/{name}.test.js'for name in['animations','window-lifecycle-timers','animations-allocation','animation-task-owner']]];start=time.monotonic()
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
with(out/'raw.log').open('xb')as log:
 child=subprocess.Popen(command,cwd=s,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,preexec_fn=core_zero)
 try:code=child.wait(timeout=90);expired=False
 except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
text=(out/'raw.log').read_text();find=lambda label:(int(re.findall(r'\b'+label+r' (\d+)',text)[-1])if re.findall(r'\b'+label+r' (\d+)',text)else None);after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'command':command,'pid':child.pid,'exit':code,'administrativeDeadline':expired,'seconds':time.monotonic()-start,'expectedTests':28,'actualTests':find('tests'),'pass':find('pass'),'fail':find('fail'),'lateUncaughtActivities':text.count('asynchronous activity after the test ended'),'sourceUnchanged':before==after,'guardInputs':len(before),'RootApplied':False};(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if code==0 and not expired and status['actualTests']==status['pass']==28 and status['fail']==0 and not status['lateUncaughtActivities']and before==after else 1)
