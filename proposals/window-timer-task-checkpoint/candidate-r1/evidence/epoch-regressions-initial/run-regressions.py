import hashlib,json,os,subprocess,time
from pathlib import Path
root=Path(__file__).resolve().parent.parent;e=root/'evidence';start=time.monotonic()
nodes=['/workspace/shared/rea-tools/node_modules/node/bin/node','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node','/workspace/shared/node26/node_modules/node/bin/node']
tests=['test/window-task-checkpoint.test.js','test/window-lifecycle-timers.test.js','test/window-messaging.test.js','test/platform-codec.test.js','test/messaging.test.js']
def guard():
 return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()for top in ['src','test','bin','scripts','native']for p in sorted((root/top).rglob('*'))if p.is_file()}
before=guard();(e/'regressions-before.json').write_text(json.dumps(before,indent=2)+'\n');rows=[]
for index,node in enumerate(nodes):
 cmd=[node,'--experimental-vm-modules','--test','--test-concurrency=1',*tests];epoch=time.monotonic()
 r=subprocess.run(cmd,cwd=root,env={**os.environ,'PATH':str(Path(node).parent)+':'+os.environ['PATH']},capture_output=True)
 (e/f'regressions-{index}.stdout').write_bytes(r.stdout);(e/f'regressions-{index}.stderr').write_bytes(r.stderr)
 rows.append({'command':cmd,'nodeSHA256':hashlib.sha256(Path(node).read_bytes()).hexdigest(),'exit':r.returncode,'seconds':time.monotonic()-epoch})
 (e/'regressions-progress.json').write_text(json.dumps(rows,indent=2)+'\n')
 if r.returncode:break
after=guard();(e/'regressions-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'runs':rows,'seconds':time.monotonic()-start,'graphStable':before==after,'inputs':len(before),'base':'owned104, positive-only Window timer checkpoint; Root remains untouched'};(e/'regressions-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
raise SystemExit(0 if before==after and len(rows)==3 and all(r['exit']==0 for r in rows)else 1)
