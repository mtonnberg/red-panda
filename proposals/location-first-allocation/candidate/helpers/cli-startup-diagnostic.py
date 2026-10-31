from pathlib import Path
import json,os,subprocess,time,hashlib
root=Path(__file__).resolve().parent.parent
node='/workspace/shared/rea-tools/node_modules/node/bin/node'
env=dict(os.environ,NODE_USE_ENV_PROXY='1');prior=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]))
aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]'
env.update({key:','.join(filter(None,[prior,aliases])) for key in ['NO_PROXY','no_proxy']});env['PATH']=str(Path(node).parent)+':'+env.get('PATH','')
command=[str(root/'bin/red-panda.js'),'version'];start=time.monotonic()
result=subprocess.run(command,cwd='/workspace/red-panda',env=env,capture_output=True,text=True,timeout=1.7)
record={'command':command,'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr,'seconds':time.monotonic()-start,'PATH':env['PATH'],'binarySHA256':hashlib.sha256((root/'bin/red-panda.js').read_bytes()).hexdigest()}
(root/'evidence/cli-startup-diagnostic.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
