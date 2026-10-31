import subprocess,json,os,pathlib,hashlib,time
root=pathlib.Path(__file__).resolve().parents[1]
files=['navigation-api','navigation-api-privacy','navigation-load-cancel','joint-history','history','navigation','navigation-integration','forms','forms-integration']
nodes=[('prepared24','/workspace/shared/rea-tools/node_modules/node/bin/node'),('system24','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('node26','/workspace/shared/node26/node_modules/node/bin/node')]
results=[];env=os.environ.copy();env['NODE_USE_ENV_PROXY']='1'
for key in ['NO_PROXY','no_proxy']:env[key]=env.get(key,'')+',0.0.0.0,127.0.0.1,localhost,::1,[::1]'
for name,node in nodes:
 command=[node,'--experimental-vm-modules','--test','--test-concurrency=1']+['test/'+f+'.test.js' for f in files];started=time.time();log=root/'evidence'/('final-focus-'+name+'.log')
 with log.open('x') as out:code=subprocess.run(command,cwd=root,env=env,stdout=out,stderr=subprocess.STDOUT).returncode
 results.append({'name':name,'command':command,'exitCode':code,'durationSeconds':time.time()-started,'log':str(log.relative_to(root))});print(name,code,flush=True)
 (root/'evidence/final-focused-status.json').write_text(json.dumps(results,indent=2)+'\n')
 if code:break
