from pathlib import Path
import json,hashlib,subprocess,time
p=Path.cwd();base=json.loads((p/'evidence/base-manifest.json').read_text());state=lambda:{n:hashlib.sha256((p/n).read_bytes()).hexdigest() for n in base['source']};assert state()==base['source'];start=time.monotonic()
command=['/workspace/shared/rea-tools/node_modules/node/bin/node','--experimental-vm-modules','evidence/native-alias-probe.mjs','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux','evidence/native-aliases.json']
with (p/'evidence/native-aliases.log').open('xb')as log:result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
after=state();(p/'evidence/native-status.json').write_text(json.dumps({'command':command,'exit':result.returncode,'seconds':time.monotonic()-start,'sourceInputs':len(after),'changed':[n for n,h in base['source'].items() if after[n]!=h]},indent=2)+'\n');print((p/'evidence/native-status.json').read_text())
