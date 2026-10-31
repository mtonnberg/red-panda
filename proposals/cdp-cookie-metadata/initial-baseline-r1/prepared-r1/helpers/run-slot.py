from pathlib import Path
import hashlib,json,os,subprocess,time,sys
root=Path(__file__).resolve().parent.parent;e=root/'evidence';graph=root/'candidate';node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');native=Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux');capture=json.loads((e/'capture.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();labels=sys.argv[1:]or['native','candidate'];assert all(x in ['native','candidate']for x in labels)
def guard():
 result={name:sha(graph/name)for name in capture['realCopiedInputSHA256']}
 for top in ['native','node_modules']:
  for p in sorted((graph/top).rglob('*')):
   if p.is_file()and'__pycache__'not in p.parts:result[top+'/'+str(p.relative_to(graph/top))]=sha(p)
 for top in ['helpers','scripts','test']:
  for p in sorted((root/top).rglob('*')):
   if p.is_file()and'__pycache__'not in p.parts:result['helper/'+str(p.relative_to(root))]=sha(p)
 result['capture']=sha(e/'capture.json');result['node']=sha(node);result['nativeBinary']=sha(native);return result
start=time.monotonic();before=guard();(e/'metadata-before.json').write_text(json.dumps(before,indent=2)+'\n');assert all(before[name]==value for name,value in capture['realCopiedInputSHA256'].items());runs=[]
for label in labels:
 cmd=[str(node),'--experimental-vm-modules','helpers/full-cookie-objects.mjs','native'if label=='native'else str(graph),'evidence/'+label+'-full-objects.json'];begin=time.monotonic();r=subprocess.run(cmd,cwd=root,env={**os.environ,'PATH':str(node.parent)+':'+os.environ['PATH']},capture_output=True);(e/(label+'.stdout')).write_bytes(r.stdout);(e/(label+'.stderr')).write_bytes(r.stderr);runs.append({'label':label,'command':cmd,'exit':r.returncode,'seconds':time.monotonic()-begin});print(json.dumps(runs[-1]),flush=True)
 if r.returncode:break
after=guard();(e/'metadata-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'runs':runs,'seconds':time.monotonic()-start,'inputs':len(before),'stable':before==after,'boundary':'Native first; complete unfiltered wire getter objects, metadata only/noHTTP. Driver exit0 is not API success; actual setup/API errors stay raw in each response.'};(e/'metadata-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if before==after and all(r['exit']==0 for r in runs)else 1)
