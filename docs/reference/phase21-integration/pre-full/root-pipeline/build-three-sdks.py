from pathlib import Path
import json,hashlib,subprocess,time
r=Path.cwd();o=r/'.cache/validation/phase21';cpp=r/'native/runtime.cc';assert hashlib.sha256(cpp.read_bytes()).hexdigest()=='cb235f736c7ab4171543d29f6a7278c1c895f35785d001ed2115e43b3c3bedd6'
steps=[]
for name,node in [('24.19.0','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('24.22.1','/workspace/shared/rea-tools/node_modules/node/bin/node'),('26.13.0','/workspace/shared/node26/node_modules/node/bin/node')]:
 cmd=[node,'native/build.mjs'];start=time.monotonic()
 with(o/('build-'+name+'.log')).open('w')as f:c=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
 steps.append({'node':name,'executable':node,'executableSHA256':hashlib.sha256(Path(node).read_bytes()).hexdigest(),'command':cmd,'exit':c.returncode,'seconds':time.monotonic()-start});(o/'native-build-status-partial.json').write_text(json.dumps(steps,indent=2));assert c.returncode==0,steps[-1]
artifacts={};metadata=[]
for p in sorted((r/'native/build').rglob('*.node.json')):
 d=json.loads(p.read_text());binary=Path(str(p)[:-5]);source=r/'native'/(binary.name.removesuffix('.node')+'.cc');assert d['sourceSHA256']==hashlib.sha256(source.read_bytes()).hexdigest();assert d['binarySHA256']==hashlib.sha256(binary.read_bytes()).hexdigest();metadata.append({'manifest':str(p.relative_to(r)),**d});artifacts[str(p.relative_to(r))]=hashlib.sha256(p.read_bytes()).hexdigest();artifacts[str(binary.relative_to(r))]=d['binarySHA256']
assert len(artifacts)==18
(o/'native-build-status.json').write_text(json.dumps({'checks':steps,'artifacts':artifacts,'metadata':metadata,'sources':{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in(r/'native').glob('*.cc')}},indent=2));print(json.dumps({'checks':steps,'verifiedArtifacts':len(artifacts)}))
