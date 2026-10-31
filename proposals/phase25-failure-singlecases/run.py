from pathlib import Path
import json,subprocess,time,hashlib
r=Path.cwd();o=r/'.cache/validation/phase25-reproduce';prior=json.loads((r/'.cache/validation/phase25-all-features/inputs-after.json').read_text())
def snap():return{p:hashlib.sha256((Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux')if p=='external:Native'else r/p).read_bytes()).hexdigest()for p in prior}
b=snap();assert b==prior;(o/'inputs-before.json').write_text(json.dumps(b,indent=2));rows=[]
for label,file,pattern in [('animation-detail','test/animations.test.js','actual Native animation detail observations match'),('audio-heap','test/audio-data.test.js','heap queries preserve authored AudioData lookalikes'),('cli-bare','test/cli-options.test.js','existing no-dump default remains empty')]:
 cmd=['/workspace/shared/rea-tools/node_modules/node/bin/node','--experimental-vm-modules','--test','--test-concurrency=1','--test-name-pattern',pattern,file];start=time.monotonic()
 with(o/(label+'.log')).open('x')as f:c=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=180)
 row={'label':label,'command':cmd,'exit':c.returncode,'seconds':time.monotonic()-start};rows.append(row);(o/'status.json').write_text(json.dumps(rows,indent=2));print(json.dumps(row),flush=True)
a=snap();(o/'inputs-after.json').write_text(json.dumps(a,indent=2));(o/'source-stable.json').write_text(json.dumps({'inputs':len(b),'unchanged':a==b},indent=2));assert a==b
