from pathlib import Path
import subprocess,json,time,hashlib,os
p=Path.cwd();v=p/'scroll-checkpoint';base=json.loads((p/'evidence/focused-manifest.json').read_text());state=lambda:{n:hashlib.sha256((v/n).read_bytes()).hexdigest() for n in base};assert state()==base
full=json.loads(Path('/workspace/red-panda/.cache/validation/phase22-full-diagnostic/full-source-before.json').read_text());dependencies={n:h for n,h in full.items() if n.startswith('node_modules/')};depstate=lambda:{n:hashlib.sha256((Path('/workspace/red-panda')/n).read_bytes()).hexdigest() for n in dependencies};beforedeps=depstate();assert beforedeps==dependencies
rows=[]
files=['test/scroll-task-checkpoint.test.js','test/window-viewport-parity.test.js','test/window-task-checkpoint.test.js','test/window-lifecycle-timers.test.js','test/resize-observer.test.js','test/frames-integration.test.js','test/layout.test.js']
for name,node in [('24.22.1','/workspace/shared/rea-tools/node_modules/node/bin/node'),('24.19.0','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('26.13.0','/workspace/shared/node26/node_modules/node/bin/node')]:
 command=[node,'--experimental-vm-modules','--test','--test-concurrency=1',*files];start=time.monotonic()
 with (p/('evidence/focused-'+name+'.log')).open('xb')as log:result=subprocess.run(command,cwd=v,stdout=log,stderr=subprocess.STDOUT)
 rows.append({'node':name,'command':command,'exit':result.returncode,'seconds':time.monotonic()-start});print(json.dumps(rows[-1]),flush=True)
 assert state()==base
(p/'evidence/focused-status.json').write_text(json.dumps(rows,indent=2)+'\n');afterdeps=depstate();(p/'evidence/focused-source-after.json').write_text(json.dumps({'inputs':len(base),'changed':[n for n in base if state()[n]!=base[n]],'dependencyInputs':len(dependencies),'dependencyChanged':[n for n in dependencies if afterdeps[n]!=dependencies[n]]},indent=2)+'\n')
