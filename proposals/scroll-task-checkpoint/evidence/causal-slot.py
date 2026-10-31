from pathlib import Path
import subprocess,json,time,hashlib
p=Path.cwd();proof=json.loads((p/'evidence/base-manifest.json').read_text());base=proof['copiedInputs'];before={n:hashlib.sha256((p/n).read_bytes()).hexdigest() for n in base};assert before==base
variantPins=json.loads((p/'evidence/variant-manifests.json').read_text())['variants']
def variantState():
 return {name:{n:hashlib.sha256((p/name/n).read_bytes()).hexdigest() for n in pins} for name,pins in variantPins.items()}
assert variantState()==variantPins
rows=[]
for name,binary in [('native','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'),('current',str(p/'evidence/cli-current')),('original-timer',str(p/'evidence/cli-original-timer'))]:
 command=['/workspace/shared/rea-tools/node_modules/node/bin/node','--experimental-vm-modules','evidence/progress-probe.mjs',binary,'evidence/causal-'+name+'.json'];start=time.monotonic()
 with (p/('evidence/causal-'+name+'.log')).open('xb')as log:result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
 rows.append({'name':name,'command':command,'exit':result.returncode,'seconds':time.monotonic()-start})
variantAfter=variantState();assert variantAfter==variantPins
after={n:hashlib.sha256((p/n).read_bytes()).hexdigest() for n in base};(p/'evidence/causal-source-after.json').write_text(json.dumps({'count':len(base),'changed':[n for n in base if base[n]!=after[n]]},indent=2)+'\n');(p/'evidence/causal-status.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows))
