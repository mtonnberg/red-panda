from pathlib import Path
import hashlib,json,os,subprocess,time
root=Path(__file__).resolve().parent.parent;e=root/'evidence';graph=root/'current-root-captured';node='/workspace/shared/rea-tools/node_modules/node/bin/node';capture=json.loads((root/'current-root-capture.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def guard():
 result={name:sha(graph/name)for name in capture['realCopiedInputSHA256']}
 for name in capture['nativeReadOnlyLinkToOwned104HashMatchedRoot']:result['native/'+name]=sha(graph/'native'/name)
 for name in ['evidence/probe-scheduling.mjs','evidence/run-scheduling.py']:result[name]=sha(root/name)
 for name in ['testing.js','webaudio/audio_context.html']:result['pinned/'+name]=sha(graph/'.cache/lightpanda-reference/browser-948d773786/src/browser/tests'/name)
 result['node']=sha(Path(node));return result
before=guard();(e/'scheduling-before.json').write_text(json.dumps(before,indent=2)+'\n');start=time.monotonic();rows=[]
for event in ['DOMContentLoaded','load']:
 label='current-block-'+event;cmd=[node,'--experimental-vm-modules','evidence/probe-scheduling.mjs'];r=subprocess.run(cmd,cwd=root,env={**os.environ,'PATH':str(Path(node).parent)+':'+os.environ['PATH'],'AUDIO_DIAGNOSTIC_GRAPH':str(graph),'AUDIO_DIAGNOSTIC_LABEL':label,'AUDIO_DIAGNOSTIC_BLOCK_EVENT':event},capture_output=True)
 (e/(label+'.stdout')).write_bytes(r.stdout);(e/(label+'.stderr')).write_bytes(r.stderr);row={'label':label,'command':cmd,'exit':r.returncode};rows.append(row);print(json.dumps(row),flush=True)
 if r.returncode:break
after=guard();(e/'scheduling-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'runs':rows,'seconds':time.monotonic()-start,'inputs':len(before),'stable':before==after};(e/'scheduling-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
