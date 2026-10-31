import difflib,hashlib,json,pathlib
r=pathlib.Path('/workspace/red-panda');s=pathlib.Path('/workspace/shared/selection-core-20261031');p=r/'proposals/selection-core';leaves=p/'leaves';leaves.mkdir(exist_ok=True);sha=lambda b:hashlib.sha256(b).hexdigest();patch=[];changes={}
for path in ['src/selection.js','src/browser.js','src/world-sessions.js','test/selection.test.js']:
 before=(r/path).read_bytes() if (r/path).exists() else b''
 if path=='src/browser.js':
  text=before.decode();assert text.count("import { installMedia } from './media.js';")==1 and text.count('      installDOMLifecycle(this, window);')==1
  after=text.replace("import { installMedia } from './media.js';","import { installMedia } from './media.js';\nimport {installSelection} from './selection.js';").replace('      installDOMLifecycle(this, window);','      installDOMLifecycle(this, window);\n      installSelection(this, window);').encode()
 elif path=='src/world-sessions.js':
  text=before.decode();assert text.count("import {installCSSNamespace} from './css-namespace.js';")==1 and text.count('record.global=record.controller.global;')==1
  after=text.replace("import {installCSSNamespace} from './css-namespace.js';","import {installCSSNamespace} from './css-namespace.js';\nimport {installUtilitySelection} from './selection.js';").replace('record.global=record.controller.global;','installUtilitySelection(record.controller,window);record.global=record.controller.global;').encode()
 else:after=(s/path).read_bytes()
 target=leaves/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(after)
 patch+=['diff --git a/'+path+' b/'+path+'\n']
 if not before:patch+=['new file mode 100644\n']
 patch+=list(difflib.unified_diff(before.decode().splitlines(True),after.decode().splitlines(True),fromfile='a/'+path if before else '/dev/null',tofile='b/'+path))
 changes[path]={'beforeSHA256':sha(before) if before else None,'afterSHA256':sha(after)}
(p/'integration-current.patch').write_text(''.join(patch))
graph={str(f.relative_to(s)):sha(f.read_bytes()) for folder in ['src','test','scripts','native','bin'] for f in sorted((s/folder).rglob('*')) if f.is_file()}
for path in ['candidate-browser','package.json','package-lock.json']:graph[path]=sha((s/path).read_bytes())
(p/'source-freeze.json').write_text(json.dumps({'scratch':str(s),'graph':graph,'note':'Bounded scratch fork of Root before text-track integration; only selection source changes applied here. Browser/world-sessions integration leaves rebase only narrow imports/install calls onto current Root; broad combined tree remains Root validation. No native addon or dependency changes.'},indent=2)+'\n')
(p/'integration-manifest.json').write_text(json.dumps({'patchSHA256':sha((p/'integration-current.patch').read_bytes()),'changes':changes,'sourceFreezeSHA256':sha((p/'source-freeze.json').read_bytes())},indent=2)+'\n');print(sha((p/'integration-current.patch').read_bytes()))
