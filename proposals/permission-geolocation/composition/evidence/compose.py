from pathlib import Path
import json,hashlib,shutil,subprocess,difflib
r=Path(__file__).resolve().parent.parent;base=r/'base';c=r/'candidate';h=Path('/workspace/shared/permission-geolocation-handoff');e=r/'evidence';events=[];sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(h/'candidate.patch')=='27661165daa7a44768f848d80615191b8082c952708d3fa1cc21789b142e1304'
def edit(path,old,new,label):
 p=c/path;s=p.read_text();assert s.count(old)==1,(path,label,s.count(old));p.write_text(s.replace(old,new));events.append({'path':path,'kind':'guarded narrow hunk','label':label,'old':old,'new':new})
def fragment(path):
 matches=[]
 for block in(h/'candidate.patch').read_text().split('--- ')[1:]:
  text='--- '+block
  if text.splitlines()[1]=='+++ b/'+path:matches.append(text)
 assert len(matches)==1,path;p=e/('exact-fragment-'+path.replace('/','_')+'.patch');p.write_text(matches[0]);q=subprocess.run(['git','apply','--check',str(p)],cwd=c,text=True,capture_output=True);assert q.returncode==0,q.stderr;subprocess.run(['git','apply',str(p)],cwd=c,check=True);assert sha(c/path)==sha(h/'candidate'/path);events.append({'path':path,'kind':'exact sealed fragment','fragment':str(p.relative_to(r))})
for path in ['src/navigator.js','src/device-permissions.js','test/device-permissions.test.js']:fragment(path)
for path in ['src/protocol-float.js','src/permission-control.js','test/permission-control.test.js']:
 assert not(c/path).exists();shutil.copy2(h/'candidate'/path,c/path);events.append({'path':path,'kind':'exact sealed new leaf'})
original=json.loads((h/'evidence/edits-static.json').read_text())['edits']
for event in original:
 if event['path']=='src/browser.js'and event['before']not in ["    if (id === 'default' || !this.contexts.has(id)) throw new Error('Unknown disposable browser context');",'    this.contexts.delete(id);','  close() { for (const page of [...this.pages.values()]) page.close(); this.syncHTTP.close(); }']:
  edit(event['path'],event['before'],event['after'],'retain exact tested permission addition beside current Dialog/Lifecycle/Unicode source')
edit('src/browser.js','    disposeJavaScriptDialogContext(this,context);','    disposeJavaScriptDialogContext(this,context);\n    disposePermissionContext(context);','reuse actual existing Context; preserve Dialog disposal before new permission disposal')
edit('src/browser.js','  close() { for (const page of [...this.pages.values()]) page.close(); disposeJavaScriptDialogs(this); this.syncHTTP.close(); }','  close() { for (const page of [...this.pages.values()]) page.close(); disposeJavaScriptDialogs(this); closePermissionBrowser(this); this.syncHTTP.close(); }','retain real Page close and Dialog disposal, then clear permission controllers before transport cleanup')
for event in original:
 if event['path']=='src/cdp.js'and event['before']!='message.params === null && CONFIGURATION_ACK_METHODS.has(message.method)':edit(event['path'],event['before'],event['after'],'retain exact tested permission addition beside current completion/session/cookie/LP source')
old="(CONFIGURATION_ACK_METHODS.has(message.method) || message.method === 'LP.getMarkdown' || message.method === 'LP.version')"
edit('src/cdp.js',old,old[:-1]+' || supportsPermissionControl(message.method))','extend existing config5/LP-null union only with exact five permission operations')
changed=[];new=[];patch=''
for p in sorted(c.rglob('*')):
 if not p.is_file()or p.is_symlink()or'node_modules'in p.parts:continue
 path=str(p.relative_to(c));old=(base/path).read_bytes()if(base/path).exists()else b'';value=p.read_bytes()
 if old==value:continue
 (changed if(base/path).exists()else new).append(path)
 patch+=''.join(difflib.unified_diff(old.decode().splitlines(keepends=True),value.decode().splitlines(keepends=True),fromfile='a/'+path if(base/path).exists()else'/dev/null',tofile='b/'+path))
assert len(changed)==5 and len(new)==3,(changed,new)
(r/'composed.patch').write_text(patch);q=subprocess.run(['git','apply','--check',str(r/'composed.patch')],cwd=base,text=True,capture_output=True);assert q.returncode==0,q.stderr
# Reverse only the recorded additions in shared files. Equality proves that no
# current Dialog/Lifecycle/Unicode/cookie/session/Runtime behavior was replaced.
preservation=[]
for path in ['src/browser.js','src/cdp.js']:
 text=(c/path).read_text()
 for event in reversed(events):
  if event['path']!=path:continue
  assert text.count(event['new'])==1,(path,event['label']);text=text.replace(event['new'],event['old'])
 assert text==(base/path).read_text(),path
 preservation.append({'path':path,'allCurrentBytesPreservedAfterReversingOnlyPermissionAdditions':True,'beforeSHA256':sha(base/path),'afterSHA256':sha(c/path)})
(e/'context-adaptations.json').write_text(json.dumps({'runtimeExecuted':False,'RootEdits':False,'sealedPatchSHA256':sha(h/'candidate.patch'),'events':events,'sharedFilePreservation':preservation},indent=2)+'\n')
baseManifest=json.loads((e/'current-root-before.json').read_text());root=Path(baseManifest['root']);now={p:sha(root/p)for p in baseManifest['files']};assert now==baseManifest['files'],'Root changed during own static composition'
after=dict(baseManifest['files']);after.update({p:sha(c/p)for p in changed+new});(e/'composed-source-manifest.json').write_text(json.dumps({'runtimeExecuted':False,'files':after,'count':len(after)},indent=2)+'\n')
record={'runtimeExecuted':False,'RootEdits':False,'RootFilesUnchanged':len(now),'composedFiles':len(after),'composedPatchSHA256':sha(r/'composed.patch'),'patchCheckAgainstExactCurrentBaseExit':q.returncode,'before':{p:sha(base/p)for p in changed},'after':{p:sha(c/p)for p in changed+new},'identicalSealedLeaves':[p for p in changed+new if p not in ['src/browser.js','src/cdp.js']],'contextOnlySharedFilePreservation':preservation}
(e/'composition-summary.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record))
