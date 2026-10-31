import pathlib,hashlib,json,difflib
r=pathlib.Path('/workspace/red-panda');s=pathlib.Path('/workspace/shared/range-geometry-20261031');p=r/'proposals/range-geometry';leaves=p/'leaves';leaves.mkdir(exist_ok=True);sha=lambda b:hashlib.sha256(b).hexdigest();baseline=json.loads((p/'baseline-source.json').read_text())['graph'];patch=[];changes={}
paths=['src/range-geometry.js','src/range-text.js','src/layout.js','src/flow-metrics.js','src/utility-layout.js','src/isolated-world.js','src/styles.js','src/browser.js','src/world-sessions.js','test/range-geometry.test.js','test/layout.test.js','test/utility-platform.test.js']
for path in paths:
 before=(r/path).read_bytes() if (r/path).exists() else b''
 if path=='src/browser.js':
  text=before.decode();assert text.count("import { installGeometry }")==1 and text.count('      installGeometry(window);')==1
  after=text.replace("import { installGeometry }", "import {installRangeGeometry} from './range-geometry.js';\nimport { installGeometry }").replace('      installGeometry(window);','      installGeometry(window);\n      installRangeGeometry(this,window);').encode()
 elif path=='src/world-sessions.js':
  text=before.decode();assert text.count("import { installCanvas }")==1 and text.count('installUtilityLayout(page,record.controller,window);')==1
  after=text.replace("import { installCanvas }", "import {installUtilityRangeGeometry} from './range-geometry.js';\nimport { installCanvas }").replace('installUtilityLayout(page,record.controller,window);','installUtilityLayout(page,record.controller,window);installUtilityRangeGeometry(record.controller);').encode()
 else:
  if before:assert sha(before)==baseline[path],f'Rebase required: {path}'
  after=(s/path).read_bytes()
 target=leaves/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(after)
 patch+=['diff --git a/'+path+' b/'+path+'\n']
 if not before:patch+=['new file mode 100644\n']
 patch+=list(difflib.unified_diff(before.decode().splitlines(True),after.decode().splitlines(True),fromfile='a/'+path if before else '/dev/null',tofile='b/'+path))
 changes[path]={'beforeSHA256':sha(before) if before else None,'afterSHA256':sha(after)}
(p/'integration-current.patch').write_text(''.join(patch))
graph={str(f.relative_to(s)):sha(f.read_bytes()) for folder in ['src','test','scripts','native','bin'] for f in sorted((s/folder).rglob('*')) if f.is_file()}
for path in ['candidate-browser','package.json','package-lock.json']:graph[path]=sha((s/path).read_bytes())
externalInputs={}
for f in [r/'docs/reference/geometry-extended-evidence.json',*[r/'proposals/css-layout'/name for name in ['controls.js','native-controls.json','vertical-controls.js','vertical-native-controls.json','advance-controls.js','advance-native-controls.json','additional-controls.js','additional-native-controls.json']]]:externalInputs[str(f)]=sha(f.read_bytes())
(p/'source-freeze.json').write_text(json.dumps({'scratch':str(s),'graph':graph,'externalExistingTestInputs':externalInputs,'note':'Frozen independent scratch copied from Root with Selection/text-track integration; predates Root scheduler changes. Narrow browser/world-session integration rebased onto current Root and preserves scheduler imports/install calls. No native/dependency changes. Existing layout/flow/style/utility tests are serial focused prerequisites, not a whole-repository run.'},indent=2)+'\n')
(p/'integration-manifest.json').write_text(json.dumps({'patchSHA256':sha((p/'integration-current.patch').read_bytes()),'changes':changes,'sourceFreezeSHA256':sha((p/'source-freeze.json').read_bytes())},indent=2)+'\n');print(sha((p/'integration-current.patch').read_bytes()))
