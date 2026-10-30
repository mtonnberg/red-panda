import collections,hashlib,json,pathlib
HERE=pathlib.Path(__file__).resolve().parent
load=lambda name:json.loads((HERE/name).read_text())
prior=load('inventory.json');selection=load('selection.json');manifest=load('manifest.json')
native=load('native.json');candidate=load('candidate-static47.json');echo=load('echo-method-transport.json')
native_route=load('native-fragment-route.json');candidate_route=load('candidate-fragment-route.json')
native_rows={row['path']:row for row in native['results']if row['path']!='frames/fragment_navigation.html'}
native_rows.update({row['path']:row for row in native_route['results']})
candidate_rows={row['path']:row for row in candidate['results']};candidate_rows.update({row['path']:row for row in candidate_route['results']})
assert set(native_rows)==set(candidate_rows)==set(selection['paths'])
expected={row['path']:row['sha256']for row in selection['fixtures']}
for report in [native,candidate,native_route,candidate_route]:
 assert report['sourceHarnessSHA256']==selection['harnessSHA256']
 assert report['browserArgs']==selection['browserArgs']
 assert report['testUserAgent']=='Lightpanda/1.0'and report['externalRunnerFlag']is True
 for row in report['results']:assert row['sha256']==expected[row['path']]
assert not any(row.get('unavailableRoutes')for row in candidate['results'])
assert not any(row.get('unavailableRoutes')for row in native['results']if row['path']!='frames/fragment_navigation.html')
assert all(not row['unavailableRoutes']for row in echo['cases'])
paired=[]
for path in selection['paths']:
 n=native_rows[path];c=candidate_rows[path]
 paired.append({'path':path,'fixtureSHA256':expected[path],'nativeStatus':n['status'],'candidateStatus':c['status'],'candidateError':c['error'],'candidateHarnessObserved':c.get('harnessObserved'),'candidatePhase':c.get('phase'),'candidateOwnedBrowser':c.get('ownedBrowser'),'candidateDiagnostics':c.get('diagnostics',[]),'candidateRuntimeExceptions':c.get('runtimeExceptions',[]),'transportScope':'canonical9582-source-method-echo'if path=='frames/fragment_navigation.html'else'owned-port0-static','nativeReport':'native-fragment-route.json'if path=='frames/fragment_navigation.html'else'native.json','candidateReport':'candidate-fragment-route.json'if path=='frames/fragment_navigation.html'else'candidate-static47.json'})
counts=lambda rows:dict(collections.Counter(row['status']for row in rows))
groups={name:{'selected':len(paths),'native':counts([native_rows[path]for path in paths]),'candidate':counts([candidate_rows[path]for path in paths])}for name,paths in selection['groups'].items()}
coverage={}
for actor,new in [('native',native_rows),('candidate',candidate_rows)]:
 old=[row for row in prior['evidence']if row['actor']==actor and row['registered']]
 attempted={row['fixture']for row in old};observed={row['fixture']for row in old if row['confirmedHarnessObservation']};positive={row['fixture']for row in old if row['status']=='passed'}
 attempted.update(new);observed.update(path for path,row in new.items()if row.get('harnessObserved')or row['status']=='passed'or any('script_id:'in str(log)for log in row.get('diagnostics',[]))or 'script id:'in str(row.get('error','')).lower());positive.update(path for path,row in new.items()if row['status']=='passed')
 coverage[actor]={'distinctRegisteredAttempted':len(attempted),'distinctRegisteredConfirmedHarnessObserved':len(observed),'distinctRegisteredEverPassedAcrossSeparateSnapshots':len(positive),'newDistinctAttempts':len(set(new)-{row['fixture']for row in old}),'warning':'Historical coverage unions only; never a current aggregate pass rate'}
native_positive={path for path,row in native_rows.items()if row['status']=='passed'}
assert len(native_positive)==48
report={'schemaVersion':1,'scope':'48 newly selected default-profile paths; one frozen candidate graph; not full browser parity','candidateSnapshot':manifest['snapshot'],'candidateSourceManifest':manifest['candidateSourceSHA256'],'nativeBinarySHA256':native['binary']['sha256'],'profiles':{'default440':440,'stylesheet5':5,'other10':10},'sourceBudgetMs':2000,'instrumentedBudgetMs':15000,'settleMs':100,'budgetNote':selection['budgetNote'],'currentDisjointCohortCounts':{'native':counts(list(native_rows.values())),'candidate':counts(list(candidate_rows.values()))},'perGroup':groups,'priorCoverage':prior['coverage'],'historicalCoverageAfterThisCohort':coverage,'originalTransportBlockedControl':{'report':'native.json','path':'frames/fragment_navigation.html','status':'failed','reason':'Missing /echo_method404/405 in static transport; not an engine failure','separateCorrectedReports':['native-fragment-route.json','candidate-fragment-route.json'],'transportReport':'echo-method-transport.json'},'results':paired,'abortCrashRecheck':{'report':'abort-diagnostic/recheck.json','stderr':[str(path.relative_to(HERE))for path in(HERE/'abort-diagnostic').glob('browser-*.stderr.txt')],'finding':'Unchanged native-positive AbortSignal timeout listener exception escapes through Node EventTarget process.nextTick, exits candidate1 before harness polling. Window error handling in fixture cannot intercept it.'},'cleanup':'All owned native/candidate runner processes, port0/static and canonical9582 route servers closed; runtime quiesced','claimsNotMade':['Historical or prototype positives do not imply passes on the current snapshot.','No stylesheet5 or other10 profile execution was added by this default cohort.','The diagnostic15000ms budget is not source2000ms timing equivalence.','Source-only inventories and raw HTTP request200s are not test passes.','Original missing-route failure and successful transport correction remain separate.']}
(HERE/'report.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'current':report['currentDisjointCohortCounts'],'groups':groups,'afterCoverage':coverage},indent=2))
