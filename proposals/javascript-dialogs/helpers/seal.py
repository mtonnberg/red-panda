from pathlib import Path
import difflib
import hashlib
import json
import shutil

p=Path(__file__).resolve().parents[1]
nroot=Path('/workspace/shared/javascript-dialog-native-handoff/checkpoint1')
runtime_root=Path('/workspace/red-panda')
sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
summary={}
for profile in ['core','lifetime','authority']:
    n=json.loads((nroot/'evidence'/('native-'+profile+'.json')).read_text())
    c=json.loads((p/'evidence'/('final-candidate-'+profile+'24.json')).read_text())
    nr={row['label']:row for row in n['rows']}
    cr={row['label']:row for row in c['rows']}
    differences=[]
    for label,row in cr.items():
        original=nr.get(label)
        if original is None:
            continue
        if row.get('error') or original.get('error'):
            a={key:row.get('error',{}).get(key) for key in ['code','message']}
            b={key:original.get('error',{}).get(key) for key in ['code','message']}
            if a!=b:
                assert label=='session:invalid',label
                differences.append({'label':label,'candidate':a,'native':b,'bound':'Parent-owned generic session-id fix, outside immutable929 base'})
        elif row['method']=='Runtime.evaluate':
            if row.get('result',{}).get('exceptionDetails') or original.get('result',{}).get('exceptionDetails'):
                assert label=='borrowed:fake-receiver',label
                differences.append({'label':label,'bound':'Actual TypeError/nonconsumption match; existing generic returnByValue error result/stack envelope differs; full raw reports retained'})
                continue
            a=row.get('result',{}).get('result',{}).get('value')
            b=original.get('result',{}).get('result',{}).get('value')
            if label in ['retained:document-identities','retained:remove-child']:
                differences.append({'label':label,'candidate':a,'native':b,'bound':'Known real oldDocument URL/raw WindowProxy foundation gap, never retargeted'})
            elif label=='retained:save':
                assert a['methodSame']==b['methodSame']
            else:
                assert a==b,(profile,label,a,b)
    def events(report):
        from urllib.parse import urlsplit
        roles={};index=0
        for row in report['rows']:
            if row['label']=='setup:attach' and row.get('result',{}).get('sessionId'):
                index+=1;roles[row['result']['sessionId']]='primary-'+str(index)
            if row['label']=='secondary:attach' and row.get('result',{}).get('sessionId'):
                roles[row['result']['sessionId']]='secondary'
        result=[]
        for event in report['events']:
            if not event['method'].startswith('Page.javascriptDialog'):
                continue
            params=event['params'];url=urlsplit(params.get('url',''))
            result.append({'method':event['method'],'sessionRole':roles.get(event.get('sessionId'),event.get('sessionId')),'urlRoute':{'scheme':url.scheme,'host':url.hostname,'path':url.path,'query':url.query,'fragment':url.fragment},**{key:params[key] for key in ['message','type','hasBrowserHandler','defaultPrompt'] if key in params}})
        return result
    assert events(c)==events(n),profile
    summary[profile]={'stages':len(c['stages']),'rows':len(c['rows']),'actualHTTPRequests':len(c['requests']),'openingEvents':sum(event['method']=='Page.javascriptDialogOpening' for event in c['events']),'allDriverStagesCompleted':all(stage.get('completed') for stage in c['stages']),'failure':c.get('failure'),'dialogEventProjectionMatches':True,'explicitRemainingDifferences':differences}
(p/'evidence/final-comparison.json').write_text(json.dumps({'scope':'Authored API values/final readiness and dialog event route/session-role projection only. No raw frame is rewritten. Not whole CDP/graph parity.','profiles':summary},indent=2)+'\n')
old=json.loads((p/'evidence/root-before.json').read_text())
changes=[]
for name,before in old['files'].items():
    after=sha(runtime_root/name)
    if before!=after:
        changes.append({'path':name,'base929SHA256':before,'postParentCookieApplySHA256':after})
(p/'evidence/post-parent-cookie-source-state.json').write_text(json.dumps({'epoch':'AFTER controller exit and runtime lease release. Parent applied accepted cookie actions after9f5d. Never attributed to this child or backdated as during-run guard.','changesAgainstOriginal929':changes,'protectedOriginalCount':len(old['files'])},indent=2)+'\n')
paths=['src/browser.js','src/cdp.js','src/world-sessions.js','src/javascript-dialogs.js','test/javascript-dialogs.test.js']
parts=[]
for path in paths:
    base=p/'base'/Path(path).name
    before=base.read_text().splitlines(True) if path in paths[:3] else []
    parts.append(''.join(difflib.unified_diff(before,(p/path).read_text().splitlines(True),fromfile='a/'+path if before else '/dev/null',tofile='b/'+path)))
(p/'integration.patch').write_text(''.join(parts))
owned=json.loads((p/'evidence/final-owned-after.json').read_text())
status={'baseHEAD':old['HEAD'],'baseCdpSHA256':old['files']['src/cdp.js'],'patchSHA256':sha(p/'integration.patch'),'leafSHA256':{path:sha(p/path) for path in paths},'focusedCommands':json.loads((p/'evidence/final-controller-status.json').read_text()),'protectedOwnedConsumedFiles':len(owned['files']),'ownChanges':owned['changes'],'nativePacket':str(nroot),'nativeManifestSHA256':sha(nroot/'MANIFEST.json'),'nativeRuntimeSourceSHA256':old['files']['native/runtime.cc'],'rootEdited':False,'nativeBuild':False,'broadFullSuite':False,'runtimeLeaseReleased':True,'composition':'Preserve current Root configuration/cookie/global-session changes; this is immutable929 base only'}
(p/'evidence/final-status.json').write_text(json.dumps(status,indent=2)+'\n')
(p/'README.md').write_text('''# Genuine JavaScript dialog operations

This five-leaf independent proposal replaces unimplemented alert/confirm/prompt stubs with genuine selected-VM native public entries over actual owned browsing-context state. LP.handleJavaScriptDialog supplies one response to the next real call; Page.handleJavaScriptDialog returns the measured no-dialog error without changing it. Actual inline scripts, later tasks, frames and utility worlds run to completion and emit actual opening events to the primary session without a Page.enable gate. HTMLDialogElement support is unchanged.

State stays in Host-private null-prototype slots keyed by actual registered Browser.context identity. Genuine context/page creation registers authority, context disposal clears it, and target close preserves it. Exact registered Window identities authenticate receivers. Intrinsics are captured before authored changes; thrown conversion errors retain their original identity. Live foreign methods use their captured real Document; retired methods can use only the actual registered active native-entry incumbent in the same context. No Window facade, oldDocument retargeting, public-name/prototype/impl-getter brand, VM private factory table or serializer mask is introduced. Measured function length0 is defined before publication on the actual V8-created function; no prototype repair occurs.

## Evidence

Frozen Native oracle: /workspace/shared/javascript-dialog-native-handoff/checkpoint1, manifest522f28e41759b191effe81efccba17bb82039611085e1d9540bf3bc5bda5df73. Actual binary9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f; source contract948d773786. All three owned Native processes exit0/no signal. Frame profiles explicitly enable iframe resources. No upstream engine code is imported.

Final4 meaningful cases PASS separately on Node24.19.0,24.22.1,26.13.0. Per SDK the physical control proves9 actual main/frame/utility functions and3 genuine TypeErrors have selected-VM creation contexts, false Host identity, before and after nulling prototypes. Real intrinsic poisoning/fake-proxy receiver traps leave actual hitcount0. Context disposal, scripts/tasks, primary sessions and retained old-method effects pass. Corrected35 authored paired stages run on24.22 only:65/45/37RPC rows,26/12/15opening events,7real HTTP requests. Exact commands/counts are in final-controller-status.json. The source523 owned consumed files stay unchanged across execution. All targets/contexts/fixtures/processes are closed and the runtime lease is released.

Native source/artifacts remain unchanged; runtime.cc stayscb235f736c7ab4171543d29f6a7278c1c895f35785d001ed2115e43b3c3bedd6. No old2db/C984 owned-context artifact, native build, broad/full/PS/WPT/performance run occurred here. Shared node_modules is read-only; no independent full dependency guard is claimed. Parent configuration/global-session changes and later cookie changes are recorded as separate external Root epochs. Own immutable base is92908b9d94a9f0b083afa99deb777ed01aa269d5, cdp fb31a7b10830f3f962c88c4920dbd00aa9c10ba4e0a7fb73d62cf85eab27fb8c. Do not overwrite newer Root with the entire old file. The length1 negative source and all earlier raw reports remain preserved separately.

## Explicit bounds and composition

final-comparison.json compares authored values/final readiness and actual event route/session roles only; complete raw payloads remain intact. Native retained oldDocument.URL falls back to parent and raw WindowProxy staysidentical; Root retains its actual oldDocument URL and different Window identity. Those foundation gaps remain visible. Generic returnByValue error result/stack envelope differs despite the actual correct TypeError; it is not masked. Owned929 generic invalid-session response also differs; Root's separately accepted canonical -32001 correction composes outside this patch. An initial static comparison assertion identified the already-known oldURL difference in the removal result as well as the navigation result; the final comparison explicitly records both, and no runtime report or code was changed to hide either.

Root supports additional shared pages/connections/contexts beyond Native's singleton context per connection. Attached sessions use exact actual context; ambiguous root requests cannot guess one. Those extra multi-page/multi-connection semantics are not claimed Native equivalence. Raw-owned context/module integration still requires immutable RealmHandles and remains separate. Red Panda branding stays intentional.

Apply only the four src leaves and test/javascript-dialogs.test.js, preserving newer Root configuration/cookie/global-session hunks. The patch targets immutable929; parent owns composition, affected existing regressions and later commit/acceptance. This is a bounded feature proposal, not full browser replication or a1900+ full-suite result.
''')
destination=Path('/workspace/shared/javascript-dialog-handoff/checkpoint1')
destination.parent.mkdir(exist_ok=True);destination.mkdir()
for name in ['README.md','integration.patch']:
    shutil.copyfile(p/name,destination/name)
for name in ['base','evidence','helpers']:
    shutil.copytree(p/name,destination/name)
for path in paths:
    target=destination/'leaves'/path;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p/path,target)
files=[]
for path in sorted(destination.rglob('*')):
    if path.is_file():
        files.append({'path':str(path.relative_to(destination)),'bytes':path.stat().st_size,'sha256':sha(path)})
manifest={'status':'Frozen bounded five-leaf proposal; newer Root composition/full acceptance separate','files':files,'fileCount':len(files),'bytes':sum(file['bytes'] for file in files)}
(destination/'MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'path':str(destination),'manifestSHA256':sha(destination/'MANIFEST.json'),'patchSHA256':status['patchSHA256'],'leafs':status['leafSHA256'],'files':len(files),'bytes':manifest['bytes']},indent=2))
