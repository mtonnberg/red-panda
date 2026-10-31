import difflib,hashlib,json,pathlib
root=pathlib.Path('/workspace/red-panda');scratch=pathlib.Path('/workspace/shared/text-tracks-20261031');out=root/'proposals/text-tracks';leaves=out/'leaves';leaves.mkdir(exist_ok=True)
sha=lambda b:hashlib.sha256(b).hexdigest();patch=[];changes={}
paths=['native/collections.cc','src/browser.js','src/text-tracks.js','src/vtt-parser.js','test/text-tracks.test.js']
for path in paths:
 before=(root/path).read_bytes() if (root/path).exists() else b''
 if path=='src/browser.js':
  text=before.decode();assert text.count("import { installMedia } from './media.js';")==1;assert text.count('      installMedia(this, window);')==1
  text=text.replace("import { installMedia } from './media.js';","import { installMedia } from './media.js';\nimport {installTextTracks} from './text-tracks.js';").replace('      installMedia(this, window);','      installMedia(this, window);\n      installTextTracks(this, window);');after=text.encode()
 else:after=(scratch/path).read_bytes()
 target=leaves/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(after)
 patch.append('diff --git a/'+path+' b/'+path+'\n')
 if not before:patch.append('new file mode 100644\n')
 patch.extend(difflib.unified_diff(before.decode().splitlines(True),after.decode().splitlines(True),fromfile='a/'+path if before else '/dev/null',tofile='b/'+path))
 changes[path]={'beforeSHA256':sha(before) if before else None,'afterSHA256':sha(after)}
(out/'integration-current.patch').write_text(''.join(patch))
graph={}
for folder in ['src','test','scripts','native','bin']:
 for file in sorted((scratch/folder).rglob('*')):
  if file.is_file():graph[str(file.relative_to(scratch))]=sha(file.read_bytes())
for path in ['candidate-browser','package.json','package-lock.json']:
 graph[path]=sha((scratch/path).read_bytes())
(out/'source-freeze.json').write_text(json.dumps({'scratch':str(scratch),'graph':graph,'note':'Frozen scratch graph tested separately from Root current CSS/stylesheet additions; narrow browser import/install rebased only when packaging. Native collections rebuilt only for prepared Node 24.22.1 here. Root must rebuild all selected Node SDKs and validate combined source.'},indent=2)+'\n')
(out/'integration-manifest.json').write_text(json.dumps({'patchSHA256':sha((out/'integration-current.patch').read_bytes()),'changes':changes,'frozenGraphSHA256':sha((out/'source-freeze.json').read_bytes())},indent=2)+'\n')
print(json.dumps({'patchSHA256':sha((out/'integration-current.patch').read_bytes()),'changed':list(changes)}))
