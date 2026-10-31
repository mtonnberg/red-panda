"""Read-only classification of raw Native fixture reports; never rewrites observations."""
from pathlib import Path
import json,re,collections,hashlib
OUT=Path(__file__).resolve().parent
matrix=json.loads((OUT/'matrix.json').read_text());provenance=json.loads((OUT/'provenance.json').read_text());registration=json.loads((OUT/'registration-map.json').read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
rows=[]
for row in matrix['results']:
 r=row.get('result')or{};browser=r.get('ownedBrowser')or{};error=r.get('error')or'';tags=[]
 if not row.get('result'):category='owned-driver-deadline' if row['driver'].get('deadlineExceeded') else 'runner-report-unavailable'
 elif r.get('phase')=='browser-setup':category='browser-setup-failure'
 elif browser.get('signal')not in [None,'SIGTERM','SIGKILL']:category='native-crash-signal'
 elif browser.get('exitCode')not in [0,None]:category='native-process-nonzero-exit'
 elif r.get('status')=='passed':category='verified-native-harness-pass' if r.get('harnessObserved')is True and r.get('nativeHarnessBranch')is True and r.get('nonzeroObservationsEnforced')is True else 'pass-integrity-gap'
 elif r.get('status')=='timeout':category='source-budget-timeout-observed-harness' if r.get('harnessObserved') else 'source-budget-timeout-unobserved-harness'
 elif r.get('status')=='unobserved':category='zero-observation-harness' if re.search('no test observations',error,re.I) else 'per-script-unobserved-assertions' if 'no assertions' in error else 'harness-unobserved'
 elif re.search('CDP connection closed|session.*(?:detach|closed)|target.*closed',error,re.I):category='cdp-closure-or-detach'
 elif r.get('harnessObserved')and (error=='Failed' or re.search(r'^expect\w* failed$',error)):category='observed-application-assertion-failure'
 else:category='observed-harness-exception' if r.get('harnessObserved') else 'failure-before-harness-observation'
 routeAssessment=[]
 for entry in r.get('unavailableRoutes')or[]:
  from urllib.parse import urlsplit,unquote
  path=unquote(urlsplit(entry['path']).path)
  if entry.get('status')==0:kind='request-pending-or-cancelled-before-server-record-completion'
  elif path.startswith('/src/browser/tests/'):
   source='src/browser/tests/'+path[len('/src/browser/tests/'):].lstrip('/')
   kind='pinned-static-file-absent-404' if source not in registration['fixtureAndSupportSHA256'] and entry.get('status')==404 else 'existing-pinned-static-file-unavailable'
  else:kind='unmapped-response-path-needs-contract-review'
  routeAssessment.append({**entry,'assessment':kind})
  if kind=='existing-pinned-static-file-unavailable':tags.append('confirmed-static-file-setup-gap')
  if kind=='unmapped-response-path-needs-contract-review':tags.append('unmapped-response-path-needs-contract-review')
 if browser.get('signal')in['SIGTERM','SIGKILL']:tags.append('owned-process-termination-signal')
 if re.search('CDP connection closed|session.*(?:detach|closed)|target.*closed',error,re.I):tags.append('cdp-closure-or-detach')
 if any(not x for x in row.get('reportIntegrity',{}).values()):tags.append('report-integrity-gap')
 if browser.get('stderrTruncated'):tags.append('native-stderr-truncated')
 if re.search('unknown.*(?:option|feature)|invalid.*(?:option|feature)|unsupported.*(?:option|feature)',error+'\n'+(browser.get('stderr')or''),re.I):tags.append('observed-option-or-feature-setup-mismatch')
 diagnostics=r.get('diagnostics')or[]
 scriptids=sorted(set(match for d in diagnostics for match in re.findall(r'script_id:\s*([^\s\\]+)',d.get('text',''))))
 rows.append({'index':row['index'],'path':row['path'],'fixtureSHA256':row['fixtureSHA256'],'profile':row['profile'],'sourceTimeoutMs':row['sourceProfile']['sourceTimeoutMs'],'originalStatus':row['originalStatus'],'category':category,'tags':tags,'harnessObserved':r.get('harnessObserved'),'nativeHarnessBranch':r.get('nativeHarnessBranch'),'nonzeroObservationsEnforced':r.get('nonzeroObservationsEnforced'),'reportIntegrity':row.get('reportIntegrity'),'error':r.get('error'),'nativeExitCode':browser.get('exitCode'),'nativeSignal':browser.get('signal'),'stderrTruncated':browser.get('stderrTruncated'),'failingScriptIds':scriptids,'unavailableRoutes':r.get('unavailableRoutes'),'routeAssessment':routeAssessment,'driverReport':row['driver']['report'],'diagnostics':diagnostics if category!='verified-native-harness-pass' else []})
counts=dict(collections.Counter(r['category'] for r in rows));profiles=[]
for p in registration['profiles']:
 selected=[r for r in rows if r['profile']==p['id']]
 profiles.append({**p,'completed':len(selected),'categories':dict(collections.Counter(r['category']for r in selected))})
data={'schemaVersion':1,'scope':'Complete actual Native source-registration/profile baseline; no candidate, WPT, or performance parity claim','complete':matrix.get('complete',False),'canonicalNativeAcceptance':False,'readinessWarning':'Initial epoch did not establish required source load completion; raw apparent passes are not canonical acceptance','rawMatrix':'matrix.json','rawMatrixSHA256':sha(OUT/'matrix.json'),'provenance':'provenance.json','provenanceSHA256':sha(OUT/'provenance.json'),'registrationMapSHA256':sha(OUT/'registration-map.json'),'sourceCommit':registration['upstreamCommit'],'selected':len(registration['fixtures']),'completed':len(rows),'originalStatusCounts':dict(collections.Counter(r['originalStatus']for r in rows)),'categoryCounts':counts,'tagCounts':dict(collections.Counter(tag for r in rows for tag in r['tags'])),'profileSummary':profiles,'rows':rows,'classificationNotes':['Raw driver taxonomy is provisional; this file is the canonical failure classification and retains every raw status/report','Native nonzero exit is recorded as process failure; an actual non-clean signal is required for crash-signal classification','CDP closure alone is not labeled an application assertion failure or process crash','Missing routes are retained as an independent tag, never used to promote failures to passes','Only exact external-runner/native-branch/nonzero-assertion observations count as verified passes','Source registration budgets have no 15-second diagnostic override or document-complete settling in this run']}
(OUT/'classified-matrix.json').write_text(json.dumps(data,indent=2)+'\n')
(OUT/'failures.json').write_text(json.dumps({'schemaVersion':1,'complete':data['complete'],'selected':data['selected'],'completed':data['completed'],'categoryCounts':counts,'failures':[r for r in rows if r['category']!='verified-native-harness-pass']},indent=2)+'\n')
print(json.dumps({'complete':data['complete'],'completed':len(rows),'categoryCounts':counts,'tagCounts':data['tagCounts']},indent=2))
