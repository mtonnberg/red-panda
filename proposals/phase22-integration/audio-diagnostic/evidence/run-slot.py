import hashlib,json,os,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parent.parent;e=root/'evidence';node='/workspace/shared/rea-tools/node_modules/node/bin/node'
graphs={'current':root/'current-root-captured','original104':Path('/workspace/shared/worker-clone-snapshot104'),'timer104':Path('/workspace/shared/broadcast-task-order-fix')}
labels=sys.argv[1:]or['current'];assert all(label in graphs for label in labels)
capture=json.loads((root/'current-root-capture.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def guard():
 out={}
 for label in labels:
  graph=graphs[label]
  for top in ['src','scripts','native']:
   for p in sorted((graph/top).rglob('*')):
    if p.is_file():out[label+'/'+str(p.relative_to(graph))]=sha(p)
  for name in ['test/audio-media.test.js','test/upstream-reference.js','package.json','package-lock.json']:
   p=graph/name
   if p.exists():out[label+'/'+name]=sha(p)
 for name in ['evidence/probe.mjs','evidence/run-slot.py','current-root-capture.json']:out['helper/'+name]=sha(root/name)
 for name in ['testing.js','webaudio/audio_context.html']:
  p=root/'current-root-captured/.cache/lightpanda-reference/browser-948d773786/src/browser/tests'/name;out['pinned/'+name]=sha(p)
 out['node']=sha(Path(node));return out
start=time.monotonic();before=guard();(e/'slot-before.json').write_text(json.dumps(before,indent=2)+'\n')
for name,expected in capture['realCopiedInputSHA256'].items():assert sha(root/'current-root-captured'/name)==expected
runs=[]
for label in labels:
 cmd=[node,'--experimental-vm-modules','evidence/probe.mjs'];begin=time.monotonic();r=subprocess.run(cmd,cwd=root,env={**os.environ,'PATH':str(Path(node).parent)+':'+os.environ['PATH'],'AUDIO_DIAGNOSTIC_GRAPH':str(graphs[label]),'AUDIO_DIAGNOSTIC_LABEL':label},capture_output=True)
 (e/(label+'-run.stdout')).write_bytes(r.stdout);(e/(label+'-run.stderr')).write_bytes(r.stderr);runs.append({'label':label,'command':cmd,'exit':r.returncode,'seconds':time.monotonic()-begin});print(json.dumps(runs[-1]),flush=True)
 if r.returncode:break
after=guard();(e/'slot-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'runs':runs,'seconds':time.monotonic()-start,'inputs':len(before),'stable':before==after,'boundary':'Diagnostic profiles are separate fresh Node processes; actual fixture result remains in raw JSON. Process exit0 only means helper completed.'};(e/'slot-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
raise SystemExit(0 if before==after and all(row['exit']==0 for row in runs)else 1)
