from pathlib import Path
import hashlib,json,subprocess,os,time
root=Path(__file__).resolve().parent.parent;e=root/'evidence';node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');binary=Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def guard():
 paths=[p for top in ['helpers','scripts','test','node_modules']for p in (root/top).rglob('*')if p.is_file()and'__pycache__'not in p.parts]+[root/'package.json',node,binary];return{str(p):sha(p)for p in sorted(paths)}
start=time.monotonic();before=guard();(e/'lifecycle-before.json').write_text(json.dumps(before,indent=2)+'\n');runs=[]
for profile in ['explicit-first']:
 cmd=[str(node),'--experimental-vm-modules','helpers/native-order-lifecycle.mjs',profile,'evidence/native-lifecycle-'+profile+'.json'];begin=time.monotonic();r=subprocess.run(cmd,cwd=root,env={**os.environ,'PATH':str(node.parent)+':'+os.environ['PATH']},capture_output=True);(e/('lifecycle-'+profile+'.stdout')).write_bytes(r.stdout);(e/('lifecycle-'+profile+'.stderr')).write_bytes(r.stderr);runs.append({'profile':profile,'command':cmd,'exit':r.returncode,'seconds':time.monotonic()-begin});print(json.dumps(runs[-1]),flush=True)
 if r.returncode:break
after=guard();(e/'lifecycle-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'runs':runs,'seconds':time.monotonic()-start,'inputs':len(before),'stable':before==after,'nativeOnly':True,'scope':'Original RPC2500ms; fresh processes, no candidate edits or broader context restriction. All real API/setup errors remain raw.'};(e/'lifecycle-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if before==after and all(r['exit']==0 for r in runs)else 1)
