import pathlib,json,hashlib,subprocess,time,os,signal,resource
p=pathlib.Path(__file__).resolve().parent;root=pathlib.Path('/workspace/red-panda');candidate=pathlib.Path('/workspace/shared/animation-scheduler-only-20261031');out=p/'node26-stage-r1';out.mkdir(exist_ok=False);node='/workspace/shared/node26/node_modules/node/bin/node';sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();base=json.loads((p/'scheduler-only-static-r1/base-source.json').read_text());owned=json.loads((p/'scheduler-only-static-r1/candidate-source.json').read_text());before={label+'/'+n:sha(folder/n)for label,folder,names in[('Root',root,base),('candidate',candidate,owned)]for n in names};assert all(before['Root/'+n]==h for n,h in base.items());assert all(before['candidate/'+n]==h for n,h in owned.items());(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n');env=os.environ.copy();env['NODE_USE_ENV_PROXY']='1'
for key in['NO_PROXY','no_proxy']:env[key]=','.join(dict.fromkeys([s.strip()for s in env.get(key,'').split(',')if s.strip()]+['127.0.0.1','localhost','0.0.0.0','::1','[::1]']))
fingerprint={'NODE_USE_ENV_PROXY':env['NODE_USE_ENV_PROXY'],'NO_PROXY':env['NO_PROXY'],'no_proxy':env['no_proxy'],'otherEnvHashes':{k:{'present':k in env,'sha256':hashlib.sha256(env.get(k,'').encode()).hexdigest()}for k in['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NODE_OPTIONS']}};(out/'environment.json').write_text(json.dumps(fingerprint,indent=2)+'\n');steps=[];start=time.monotonic()
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
for mode in['Root','candidate']:
 folder=out/mode;folder.mkdir();command=[node,'--experimental-vm-modules',str(p/'node26-stage-probe.mjs'),mode,str(folder/'result.json'),str(folder)];begin=time.monotonic();samples=[];sampled=set();signaled=False
 with(folder/'stdout.log').open('xb')as stdout,(folder/'stderr.log').open('xb')as stderr:
  child=subprocess.Popen(command,cwd=root,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=core_zero)
  while child.poll()is None:
   elapsed=time.monotonic()-begin
   for at in[1,4,8,12,14,19]:
    if elapsed>=at and at not in sampled:
     sampled.add(at);sample={'at':elapsed,'ps':subprocess.run(['ps','-p',str(child.pid),'-o','pid,pcpu,pmem,rss,stat,wchan:32,etime,args'],capture_output=True,text=True).stdout}
     for name in['status','wchan','stack']:
      try:sample[name]=(pathlib.Path('/proc')/str(child.pid)/name).read_text()
      except OSError as error:sample[name+'Error']=str(error)
     samples.append(sample)
   if elapsed>=12 and not signaled:
    signaled=True
    try:child.send_signal(signal.SIGUSR2)
    except ProcessLookupError:pass
   if elapsed>=20:os.killpg(child.pid,signal.SIGKILL);break
   time.sleep(.05)
  code=child.wait()
 (folder/'process-samples.json').write_text(json.dumps(samples,indent=2)+'\n');steps.append({'mode':mode,'pid':child.pid,'exit':code,'seconds':time.monotonic()-begin,'reportSignalSent':signaled,'outer20sDeadline':code==-signal.SIGKILL,'resultPresent':(folder/'result.json').exists(),'command':command})
after={label+'/'+n:sha(folder/n)for label,folder,names in[('Root',root,base),('candidate',candidate,owned)]for n in names};(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'scope':'Separate canonical-env instrumented traces; prior ambient-env timeout unchanged','steps':steps,'seconds':time.monotonic()-start,'sourceUnchanged':before==after,'guardedInputs':len(before),'RootEdits':False};(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if before==after else 1)
