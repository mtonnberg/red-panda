import hashlib,json,pathlib,subprocess
ROOT=pathlib.Path('/workspace/red-panda')
PACKET=pathlib.Path(__file__).resolve().parent
SOURCE=pathlib.Path('/workspace/shared/page-lifecycle-92908b9-20261031')
NODE=pathlib.Path('/workspace/shared/rea-tools/node_modules/node/bin/node')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def snapshot():
 expected=json.loads((PACKET/'static-r3/candidate-source.json').read_text())
 external=json.loads((PACKET/'Root-external-current-before-focus.json').read_text())
 original=external['files']
 dependencies=json.loads((ROOT/'proposals/phase23-first-gate-dacebc/dependencies.json').read_text())
 native=json.loads((ROOT/'proposals/phase23-first-gate-dacebc/native18.json').read_text())
 values={}
 for label,folder,items in [('candidate',SOURCE,expected),('Root',ROOT,original),('dependencies',ROOT,dependencies),('RootNative18',ROOT,native),('candidateNative18',SOURCE,native)]:
  for name,checksum in items.items():
   actual=sha(folder/name);assert actual==checksum,(label,name,actual,checksum);values[label+'/'+name]=actual
 for p in [NODE,PACKET/'candidate-probe.mjs',PACKET/'candidate-launcher.sh',PACKET/'native-probe.mjs',PACKET/'validation_guard.py',PACKET/'run-focus-r1.py',PACKET/'run-paired-r1.py']:
  values[str(p)]=sha(p)
 values['RootCommit']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
 assert values['RootCommit']==external['RootCommit']
 return values
def save(path,value):path.write_text(json.dumps(value,indent=2)+'\n')
