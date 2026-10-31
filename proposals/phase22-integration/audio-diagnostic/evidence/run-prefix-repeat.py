from pathlib import Path
import hashlib,json,os,subprocess,time
root=Path(__file__).resolve().parent.parent;e=root/'evidence';graph=root/'current-root-captured';node='/workspace/shared/rea-tools/node_modules/node/bin/node';capture=json.loads((root/'current-root-capture.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def guard():
 result={name:sha(graph/name)for name in capture['realCopiedInputSHA256']}
 for name in capture['nativeReadOnlyLinkToOwned104HashMatchedRoot']:result['native/'+name]=sha(graph/'native'/name)
 for name in ['test/audio-media-diagnostic.test.js','.cache/lightpanda-reference/browser-948d773786/src/browser/tests/testing.js','.cache/lightpanda-reference/browser-948d773786/src/browser/tests/webaudio/audio_context.html','docs/reference/audio-media/audio-media-native-expression.js','docs/reference/audio-media/audio-media-native.json','docs/reference/audio-media/audio-decode-extra-native-expression.js','docs/reference/audio-media/audio-decode-extra-native.json']:result[name]=sha(graph/name)
 result['runner']=sha(Path(__file__));result['node']=sha(Path(node));return result
before=guard();(e/'prefix-repeat-before.json').write_text(json.dumps(before,indent=2)+'\n');rows=[];start=time.monotonic()
for epoch in [2,3]:
 cmd=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/audio-media-diagnostic.test.js'];begin=time.monotonic();r=subprocess.run(cmd,cwd=graph,env={**os.environ,'PATH':str(Path(node).parent)+':'+os.environ['PATH']},capture_output=True)
 (e/f'prefix-current-epoch{epoch}.stdout').write_bytes(r.stdout);(e/f'prefix-current-epoch{epoch}.stderr').write_bytes(r.stderr);rows.append({'epoch':epoch,'command':cmd,'exit':r.returncode,'seconds':time.monotonic()-begin});print(json.dumps(rows[-1]),flush=True)
 if r.returncode:break
after=guard();(e/'prefix-repeat-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'runs':rows,'seconds':time.monotonic()-start,'inputs':len(before),'stable':before==after,'boundary':'Only2additional fresh exact-prefix processes after initialepoch1; original fixture, polling and tests unchanged except diagnostic console/assertOk capture. No full-run fix claim.'};(e/'prefix-repeat-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if before==after and all(row['exit']==0 for row in rows)else 1)
