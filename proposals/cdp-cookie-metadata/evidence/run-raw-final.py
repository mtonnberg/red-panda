from pathlib import Path
import hashlib,json,subprocess,os,time
root=Path(__file__).resolve().parent.parent;e=root/'evidence';nodes=['/workspace/shared/rea-tools/node_modules/node/bin/node','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node','/workspace/shared/node26/node_modules/node/bin/node'];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def guard():
 paths=[p for top in ['src','bin','scripts','native','helpers','test','node_modules']for p in(root/top).rglob('*')if p.is_file()and'__pycache__'not in p.parts]+[root/'package.json',root/'package-lock.json',Path(__file__)]+[Path(node)for node in nodes];return{str(p):sha(p)for p in sorted(paths)}
start=time.monotonic();before=guard();(e/'raw-final-before.json').write_text(json.dumps(before,indent=2)+'\n');rows=[]
for profile,helper,label in [('explicit-first','native-order.mjs','explicit'),('default-lifetime','native-order.mjs','default'),('explicit-first','native-order-lifecycle.mjs','lifecycle-attached')]:
 node=nodes[0];cmd=[node,'--experimental-vm-modules','helpers/'+helper,profile,'evidence/candidate-final-'+label+'.json',str(root)];begin=time.monotonic();r=subprocess.run(cmd,cwd=root,env={**os.environ,'PATH':str(Path(node).parent)+':'+os.environ['PATH']},capture_output=True);(e/('raw-final-'+label+'.stdout')).write_bytes(r.stdout);(e/('raw-final-'+label+'.stderr')).write_bytes(r.stderr);rows.append({'command':cmd,'exit':r.returncode,'seconds':time.monotonic()-begin})
 if r.returncode:break
after=guard();(e/'raw-final-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'runs':rows,'seconds':time.monotonic()-start,'inputs':len(before),'stable':before==after};(e/'raw-final-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if before==after and len(rows)==3 and all(row['exit']==0 for row in rows)else 1)
