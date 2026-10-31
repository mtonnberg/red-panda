import hashlib,json,pathlib,resource,subprocess,sys,time
node,probe,report=sys.argv[1:4]
probe=pathlib.Path(probe);start=time.monotonic();command=[node,'--experimental-vm-modules',str(probe)]
process=subprocess.Popen(command,cwd=probe.parent,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,preexec_fn=lambda:resource.setrlimit(resource.RLIMIT_CORE,(0,0)))
try:out,err=process.communicate(timeout=6);deadline=False
except subprocess.TimeoutExpired:process.kill();out,err=process.communicate();deadline=True
source={name:hashlib.sha256((probe.parent/name).read_bytes()).hexdigest() for name in ['src/protocol-serialization.js','src/invocation.js','src/runtime.js']}
result={'command':command,'externalDeadlineSeconds':6,'coreLimit':0,'externalDeadlineExceeded':deadline,'exit':process.returncode,'durationSeconds':time.monotonic()-start,'probeSHA256':hashlib.sha256(probe.read_bytes()).hexdigest(),'sourceSHA256':source,'stdout':out,'stderr':err}
pathlib.Path(report).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({key:value for key,value in result.items() if key not in ['stderr','sourceSHA256']}))
sys.exit(1 if deadline or process.returncode else 0)
