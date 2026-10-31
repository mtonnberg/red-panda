from pathlib import Path
import hashlib,json,os,subprocess,time
root=Path(__file__).resolve().parent.parent;e=root/'evidence';node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def guard():
 out={}
 for label in ['baseline','candidate']:
  graph=root/label
  for top in ['src','scripts','bin','test','native']:
   for p in sorted((graph/top).rglob('*')):
    if p.is_file():out[label+'/'+str(p.relative_to(graph))]=sha(p)
  for name in ['package.json','package-lock.json']:out[label+'/'+name]=sha(graph/name)
 for name in ['run-ab.py','profile-driver.mjs','profile-preload.mjs','saved-script.js','runtime.patch','static-application.json']:out['helper/'+name]=sha(e/name)
 out['node']=sha(node);return out
start=time.monotonic();before=guard();(e/'ab-before.json').write_text(json.dumps(before,indent=2)+'\n');rows=[]
for label in ['baseline','candidate']:
 cmd=[str(node),'--experimental-vm-modules','--test','--test-concurrency=1','--test-name-pattern=saved-script CLI','test/cli-transports-diagnostic.test.js'];begin=time.monotonic();r=subprocess.run(cmd,cwd=root/label,env={**os.environ,'PATH':str(node.parent)+':'+os.environ['PATH'],'CLI_DIAGNOSTIC_OUTPUT':str(e/(label+'-subcommands.json'))},capture_output=True)
 (e/(label+'.stdout')).write_bytes(r.stdout);(e/(label+'.stderr')).write_bytes(r.stderr);rows.append({'label':label,'command':cmd,'exit':r.returncode,'seconds':time.monotonic()-begin});print(json.dumps(rows[-1]),flush=True)
 if r.returncode:break
if len(rows)==2 and all(row['exit']==0 for row in rows):
 cmd=[str(node),'evidence/profile-driver.mjs'];begin=time.monotonic();r=subprocess.run(cmd,cwd=root,env={**os.environ,'PATH':str(node.parent)+':'+os.environ['PATH']},capture_output=True);(e/'profile.stdout').write_bytes(r.stdout);(e/'profile.stderr').write_bytes(r.stderr);rows.append({'label':'instrumented-profile','command':cmd,'exit':r.returncode,'seconds':time.monotonic()-begin})
after=guard();(e/'ab-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'runs':rows,'seconds':time.monotonic()-start,'inputs':len(before),'stable':before==after,'boundary':'Original15s CLI deadlines; actual 3command assertions per A/B and independent single-file profiles separate. Old Root fulldeadline remains unresolved; no fullCLI/fullbrowser acceptance claimed.'};(e/'ab-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if before==after and all(row['exit']==0 for row in rows)else 1)
