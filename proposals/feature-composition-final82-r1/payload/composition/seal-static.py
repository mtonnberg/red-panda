from pathlib import Path
import hashlib,json,re,difflib,subprocess,shutil,stat
P=Path(__file__).parent; R=Path('/workspace/red-panda'); B=P/'baseline'; C=P/'source-only-candidate'; H=P/'handoff'
H.mkdir(exist_ok=False)
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def write(name,value):
 (H/name).write_text(json.dumps(value,indent=2)+'\n')
root=json.loads((P/'Root2342-before.json').read_text()); comps=json.loads((P/'components.json').read_text()); state=json.loads((P/'merge-state.json').read_text())
assert state['next']==7
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip()=='2342b41353f04c2ab3c4b40e85b847c0ba2bede4'
assert all(sha(R/n)==v and sha(B/n)==v for n,v in root.items())
paths=sorted({n for c in comps for n in c['paths']}); assert len(paths)==51
runtime6=[n for n in root if n.endswith(('runtime.node','runtime.node.json'))]; assert len(runtime6)==6
assert all(not (C/n).exists() for n in runtime6)
protected={n:v for n,v in root.items() if n not in paths and n not in runtime6};assert all(sha(C/n)==v for n,v in protected.items())
assert not list(C.rglob('*.rej'))
assert not any(re.search(r'(?m)^(<<<<<<<|=======|>>>>>>>|\|\|\|\|\|\|\|)',(C/n).read_text()) for n in paths)
records=[];patch=[]
for n in paths:
 old=B/n; new=C/n; actualmode=stat.S_IMODE(new.stat().st_mode);mode=0o755 if actualmode&0o111 else 0o644;oldmode=(0o755 if old.stat().st_mode&0o111 else 0o644) if old.exists() else None
 assert mode in (0o644,0o755)
 records.append({'path':n,'beforeSHA256':root.get(n),'afterSHA256':sha(new),'beforeMode':oct(oldmode) if oldmode is not None else None,'afterMode':oct(mode),'actualFilesystemMode':oct(actualmode),'components':[c['name'] for c in comps if n in c['paths']]})
 patch.append(f'diff --git a/{n} b/{n}\n')
 if not old.exists():patch.append(f'new file mode {mode+0o100000:o}\n')
 elif oldmode!=mode:patch.extend([f'old mode {oldmode+0o100000:o}\n',f'new mode {mode+0o100000:o}\n'])
 patch.extend(difflib.unified_diff(old.read_text().splitlines(True) if old.exists() else [],new.read_text().splitlines(True),fromfile=f'a/{n}' if old.exists() else '/dev/null',tofile=f'b/{n}'))
 dest=H/'leaves'/n;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(new,dest)
(H/'integration-source.patch').write_text(''.join(patch));write('allowlist.json',records)
proof=P/'static-patch-roundtrip';proof.mkdir(exist_ok=False)
for n in paths:
 if (B/n).exists():q=proof/n;q.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(B/n,q)
subprocess.run(['git','init','-q'],cwd=proof,check=True)
checks=[]
for args in [['--check'],[],['--reverse','--check'],['--reverse']]:
 r=subprocess.run(['git','apply',*args,str(H/'integration-source.patch')],cwd=proof,text=True,capture_output=True);checks.append({'arguments':args,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr});assert r.returncode==0,r.stderr
 if args==[]:assert all(sha(proof/n)==sha(C/n) for n in paths)
assert all((sha(proof/n)==root[n]) if n in root else not (proof/n).exists() for n in paths)
write('patch-roundtrip.json',{'status':'STATIC_TEXT_APPLICATION_ONLY_NOT_RUNTIME','steps':checks,'forward51Exact':True,'reverse51Exact':True})
write('protected-source.json',{'RootHead':'2342b41353f04c2ab3c4b40e85b847c0ba2bede4','RootInputs':615,'actualRoot615Unchanged':True,'unchangedCandidateProtectedInputs':protected,'quarantinedOldRuntime6':runtime6,'Root18NativeUnchanged':True,'candidateCollectionsHeap12Unchanged':True,'sourceOnlyDefaultRuntimeAbsent':True,'noRejectedFilesOrMergeMarkers':True})
conf=[r for r in state['records'] if r.get('conflicts')]
write('conflict-resolutions.json',{'resolutionFiles':len(conf),'conflictBlocks':sum(r['conflicts'] for r in conf),'records':conf,'runtimeValidated':False})
deps=[];unresolved=[]
for n in paths:
 if not n.endswith(('.js','.mjs')):continue
 s=(C/n).read_text()
 for match in re.finditer(r'(?m)^\s*(?:import\s+(?:[^;\n]*?\s+from\s+)?|export\s+[^;\n]*?\s+from\s+)[\'"]([^\'"\n]+)[\'"]',s):
  dep=match.group(1)
  if dep.startswith('.'):
   q=C/n;q=q.parent/dep;ok=q.exists();item={'importer':n,'specifier':dep,'target':str(q.resolve()) if ok else str(q),'exists':ok}
   if ok and q.is_file():item['SHA256']=sha(q)
   deps.append(item)
   if not ok:unresolved.append(item)
  elif not dep.startswith('node:'):
   package='/'.join(dep.split('/')[:2]) if dep.startswith('@') else dep.split('/')[0];q=C/'node_modules'/package/'package.json';ok=q.exists();deps.append({'importer':n,'specifier':dep,'package':package,'exists':ok,'packageJSONSHA256':sha(q) if ok else None})
   if not ok:unresolved.append(deps[-1])
assert not unresolved,unresolved
wm=json.loads(Path('/workspace/shared/worker-local-errors-r5/composition-2342-r1/projection-manifest.json').read_text())
fixtures=wm['alreadyExistingFixtureDependenciesNotPatchAdditions'];assert len(fixtures)==25;assert all(sha(C/n)==v and sha(R/n)==v for n,v in fixtures.items())
write('static-source-closure.json',{'status':'LEXICAL_LITERAL_ESM_ONLY_NOT_A_PARSER_OR_RUNTIME_PROOF','literalESMImports':deps,'unresolvedLiteralESM':unresolved,'workerExisting25Dependencies':fixtures,'limitations':['Computed/dynamic imports, VM source strings, parser scripts, CommonJS transitive imports and all runtime ownership are unexecuted.','node_modules and proposals are read-only Root links, pinned package JSON and 25 Shared fixture inputs here.','Default runtime6 is deliberately absent from SOURCEONLY; install the separately copied exact95 selected6 in a NEW derivative before testing.']})
snapshot={n:sha(C/n) for n in sorted(set(root)-set(runtime6)|set(paths))};write('source-only-inputs.json',snapshot)
newtests={'test/semantic-commands.test.js':6,'test/semantic-registry.test.js':6,'test/semantic-observer-readers.test.js':2,'test/url-blocking.test.js':9,'test/worker-error-origin.test.js':5,'test/worker-local-event-fronts.test.js':2,'test/worker-startup-errors.test.js':4,'test/model-context.test.js':12,'test/http-cache.test.js':13,'test/http-cache-sync.test.js':5,'test/worker-performance.test.js':5,'test/initial-blank-lifecycle.test.js':6,'test/window-task-capture.test.js':7}
assert sum(newtests.values())==82
semantic=json.loads(Path('/workspace/shared/semantic-automation-implementation-r3/protected-regression-plan.json').read_text())['files']; semantic={'test/'+n:v for n,v in semantic.items()}
worker=json.loads(Path('/workspace/shared/worker-local-errors-r5/evidence/regressions84-files.json').read_text())
write('serial-regression-plan.json',{'status':'ALL_COMPOSED_GATES_UNRUN_REQUIRES_ROOT_GRANT','originalBudgetsAndAssertionsUnchanged':True,'stage1':{'meaning':'Syntax check changed JS then all thirteen new test files on Node24.22.1 with actual combined95 selected runtime; stop first defect.','newCases':82,'newFiles':newtests},'stage2':{'meaning':'Protected review/reference population; final full Root workflow includes it. Do not automatically duplicate a separate308 gate before and after application.','semanticExisting217':semantic,'workerExistingFiles':worker,'workerAntecedentExpectedPopulation':91,'additionalRequiredFiles':['test/permission-control.test.js','test/javascript-dialogs.test.js','test/page-lifecycle.test.js','test/network-body-capture.test.js','test/cookies.test.js','test/sync-http-lazy.test.js','test/cli-options.test.js'],'additionalNamesRequireActualExistenceSelection':False},'stage3':{'SDKs':['24.19.0','26.13.0'],'meaning':'After first82 plus externalinteraction2, Parent performs reversible reviewed Root application then full existing Root protocol/PS129/Native13/syntax/strict with original caps. Remaining SDK composition runs only if a specific new concern warrants them; isolated component SDK proofs remain separate.','sourceAnd18ArtifactGuardsBeforeAfter':True},'interactionHeldouts':['A real cached subresource must still honor a subsequently configured URL block before cache selection.','Real frame/utility canonical Node identities and session-private Runtime object handles remain compatible with ModelContext invocation exit.','Actual partial Document stop bytes/reader ownership and Network capture survive optional cache; no fabricated response events.','Real Worker startup/handler errors and MCP Promise snapshots must coexist using the exact combined95 actual addon.','Root XML16, current EventCounts, close/stop, permission/dialog/cookie and private first-front producer paths remain active.'],'noAcceptanceClaim':True,'notes':['The 82 source-declared new top-level cases are not executed composition proof.','Worker Node24 antecedent91 is a union of75+16 disjoint positive epochs; otherSDK each fresh91.','Combined primitive54 already passed on its own graph, not a substitute for composed application gates.']})
assert all(sha(R/n)==v for n,v in root.items())
write('manifest.json',{'state':'SEALED_STATIC_SOURCE_ONLY_COMPOSITION_UNRUN_NOT_APPLIED_ROOT','RootHead':'2342b41353f04c2ab3c4b40e85b847c0ba2bede4','sourceLeafCount':51,'sourceOnlyInputs':len(snapshot),'newTopLevelCasesSourceDeclared':82,'componentOrder':['semantic18','worker13','mcp7WithoutStandaloneCPP','cacheR5nine','combinedCPP95one','WorkerPerf4','initialBlank10'],'patchSHA256':sha(H/'integration-source.patch'),'nativeSelectionPath':str(P/'combined-runtime6-selection.json'),'nativeSelectionSHA256':sha(P/'combined-runtime6-selection.json'),'artifactRuntimeAcceptance':False,'cacheRevision':'R5 exact tested bytes; async13+sync5 each3SDK and91 declared Native resource contracts; composition unrun','remainingBounds':['SyncHTTP/XHR optional cache measured subset only; broader methods/body/cancellation/adversarial policies remain bounded.','Full AX/semantic trees remain unimplemented; LP scope only measured three commands.','MCP source82 strict76 and Native/current2s watchdog policy gap remain explicit.','Owned provider/reusable-global/old parsed-body lazy-front work remains separate.'],'Root615Unchanged':True,'files':{str(f.relative_to(H)):sha(f) for f in sorted(H.rglob('*')) if f.is_file()}})
print(json.dumps({'handoff':str(H),'manifestSHA256':sha(H/'manifest.json'),'patchSHA256':sha(H/'integration-source.patch'),'sourceLeaves':51,'sourceOnlyInputs':len(snapshot),'protectedCandidateInputs':len(protected),'conflictBlocks':sum(r['conflicts'] for r in conf),'Root615Unchanged':True,'runtimeExecuted':False}))
