from pathlib import Path
import hashlib,json,subprocess,os,time
root=Path(__file__).resolve().parent.parent;e=root/'evidence';nodes=['/workspace/shared/rea-tools/node_modules/node/bin/node','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node','/workspace/shared/node26/node_modules/node/bin/node'];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def guard():
 paths=[p for top in ['src','bin','scripts','native','helpers','test','node_modules']for p in(root/top).rglob('*')if p.is_file()and'__pycache__'not in p.parts]+[root/'package.json',root/'package-lock.json',Path(__file__)]+[Path(node)for node in nodes];return{str(p):sha(p)for p in sorted(paths)}
start=time.monotonic();before=guard();(e/'focus-r3-before.json').write_text(json.dumps(before,indent=2)+'\n');rows=[]
for index,node in enumerate(nodes):
 cmd=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/cdp-cookie-metadata.test.js','test/cookies.test.js','test/cookie-store.test.js'];begin=time.monotonic();r=subprocess.run(cmd,cwd=root,env={**os.environ,'PATH':str(Path(node).parent)+':'+os.environ['PATH']},capture_output=True);(e/f'focus-r3-{index}.stdout').write_bytes(r.stdout);(e/f'focus-r3-{index}.stderr').write_bytes(r.stderr);rows.append({'command':cmd,'exit':r.returncode,'seconds':time.monotonic()-begin});(e/'focus-r3-progress.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(rows[-1]),flush=True)
 if r.returncode:break
after=guard();(e/'focus-r3-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'runs':rows,'seconds':time.monotonic()-start,'inputs':len(before),'stable':before==after};(e/'focus-r3-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if before==after and len(rows)==3 and all(row['exit']==0 for row in rows)else 1)
