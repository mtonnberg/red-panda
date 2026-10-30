"""Read-only evidence index. Unions are historical observations, never pass rates."""
import collections,hashlib,json,pathlib,urllib.parse,sys
HERE=pathlib.Path(__file__).resolve().parent;ROOT=HERE.parent.parent
upstream=json.loads((ROOT/'docs/reference/upstream-fixture-inventory.json').read_text())
audit=json.loads((ROOT/'docs/reference/compatibility-remaining-audit.json').read_text())
fixtures={row['path']:row for row in upstream['fixtures']}
registrations={row['id']:row for row in upstream['registrations']}
profiles={}
for fixture in upstream['fixtures']:
 values={json.dumps({key:registrations[index][key]for key in ['enabledResources','experimentalFeatures','injectScriptLiteral','timeoutMs']},sort_keys=True)for index in fixture['htmlRunnerRegistrations']}
 if len(values)>1:raise RuntimeError('Fixture has multiple source profiles: '+fixture['path'])
 if values:profiles[fixture['path']]=json.loads(next(iter(values)))
assert profiles=={name:row['profile']for row in audit['configurationProfiles']for name in row['paths']}
registered=set(profiles);evidence=[];unknown=[];files={};rejected=[]
statuses={'passed','failed','timeout','unobserved'}
def sha(value):return hashlib.sha256(value).hexdigest()
def normalize(value):
 if not isinstance(value,str):return None
 value=urllib.parse.urlparse(value).path
 if '/src/browser/tests/'in value:value=value.split('/src/browser/tests/',1)[1]
 return value if value in fixtures else None
def role(row,location,ancestors):
 for node in [row]+list(reversed(ancestors)):
  binary=node.get('binary')or{}
  if isinstance(binary,dict)and binary.get('sha256')=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f':return 'native','verified-native-binary'
  if isinstance(binary,dict)and 'red-panda'in str(binary.get('path','')):return 'candidate','candidate-launcher'
  label=str(node.get('label','')).lower()
  if label.startswith('native'):return 'native','explicit-label'
  if label.startswith('candidate'):return 'candidate','explicit-label'
  for key in ['mode','target','actor']:
   value=node.get(key)
   if isinstance(value,str):
    if value=='native':return 'native','explicit-'+key
    if value in ['candidate','independent','baseline','current'] or any(x in value for x in ['candidate','proposal','selectors-only','final-source']):return 'candidate','explicit-'+key
   if isinstance(value,dict)and 'product'in value:
    if value['product'].startswith('RedPanda/'):return 'candidate','CDP-product'
    if value['product'].startswith('Chrome/')and ('lightpanda'in str(node.get('binary',{})).lower()or node.get('binary',{}).get('sha256')=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f'):return 'native','verified-native-CDP-product'
 if any(x.lower().startswith('native')for x in location.split('/')):return 'native','native-container'
 if any(any(y in x.lower()for y in ['candidate','independent','proposal','baseline'])for x in location.split('/')):return 'candidate','candidate-container'
 if any('installer-level' in str(node.get('scope','')).lower()or str(node.get('scope','')).startswith('Frozen independent CSS')for node in [row]+ancestors):return 'candidate','explicit-independent-installer-scope'
 if any('snapshot'in node or 'candidateSourceManifest'in node for node in [row]+ancestors):return 'candidate','snapshot-associated-observation'
 return None,None
def outcome(value):
 if isinstance(value,str)and value in statuses:return value
 if isinstance(value,dict):
  if value.get('kind')in statuses:return value['kind']
  if value.get('passed')is True or value.get('assertOk')is True:return 'passed'
  if value.get('failed')is True or value.get('assertError'):return 'failed'
  if value.get('timedOut')is True or value.get('timeout')is True:return 'timeout'
  if value.get('status')in statuses:return value['status']
  if value.get('error'):return 'timeout'if 'timed out'in str(value['error']).lower()else'failed'
 return None
def source_identity(root,actor,location):
 if actor=='native':return {'binarySHA256':root.get('nativeBinarySHA256')or root.get('binarySHA256')or(root.get('binary')or{}).get('sha256'),'identityScope':'artifact/options-specific; native observations are not merged into a pass rate'}
 source=root.get('candidateSourceManifest')or root.get('sourceSHA256')or root.get('sources')
 return {'snapshot':root.get('snapshot')or(root.get('binary')or{}).get('path'),'commit':root.get('candidateCommit')or root.get('candidateBaseCommit'),'sourceManifestSHA256':sha(json.dumps(source,sort_keys=True).encode())if source else None,'identityScope':'one artifact/variant; unidentified overlays remain separate'}
def scan(file,relative=None):
 relative=relative or str(file.relative_to(ROOT))
 if relative.startswith('proposals/coverage48/'):return
 try:root=json.loads(file.read_text())
 except Exception as error:rejected.append({'file':str(file.relative_to(ROOT)),'reason':str(error)});return
 if not isinstance(root,(dict,list)):return
 digest=sha(file.read_bytes());files[relative]=digest
 def walk(row,location='',ancestors=None,inherited=None):
  ancestors=ancestors or[]
  if isinstance(row,list):
   for index,value in enumerate(row):walk(value,location+'/'+str(index),ancestors,inherited)
   return
  if not isinstance(row,dict):return
  own=next((normalize(row.get(key))for key in ['path','fixture','name','url','file']if normalize(row.get(key))),None)
  path=own or inherited
  def emit(actor,status,rule,value=None):
   if status not in statuses:return
   if not actor:unknown.append({'file':relative,'pointer':location,'fixture':path,'status':status,'keys':sorted(row)});return
   value=value if isinstance(value,dict)else row
   actual=row.get('fixtureSHA256')or row.get('sourceSHA256')or row.get('sha256')
   expected=fixtures[path]['sha256'];valid=actual==expected if actual else None
   observed=value.get('harnessObserved',row.get(actor+'HarnessObserved',row.get('harnessObserved')))
   branch=value.get('nativeBranch',row.get(actor+'HarnessBranch',row.get('nativeHarnessBranch')))
   logs=value.get('diagnostics',value.get('logs',row.get(actor+'Diagnostics',row.get('diagnostics',row.get('logs',[])))))
   error=value.get('error')or value.get('message')or row.get(actor+'Error')or''
   diagnostic_proof=any('script_id:'in str(log)for log in logs)or 'script id:'in str(error).lower()
   confirmed=observed is True or status=='passed'or(branch is True and status in ['failed','timeout'])or diagnostic_proof
   evidence.append({'file':relative,'fileSHA256':digest,'pointer':location,'fixture':path,'registered':path in registered,'actor':actor,'status':status,'rule':rule,'fixtureHashVerified':valid,'fixtureSHA256':actual,'confirmedHarnessObservation':confirmed,'diagnosticHarnessProof':diagnostic_proof,'harnessObserved':observed,'nativeHarnessBranch':branch,'source':source_identity(root if isinstance(root,dict)else{},actor,location)})
  if path and (own or any(key in row for key in ['target','actor'])):
   for key,actor in [('nativeStatus','native'),('candidateStatus','candidate'),('proposalCandidateStatus','candidate'),('baselineCandidateStatus','candidate')]:
    if key in row:emit(actor,outcome(row[key]),'explicit-'+key)
   for key,actor in [('native','native'),('candidate','candidate'),('independent','candidate'),('baseline','candidate')]:
    if key in row:emit(actor,outcome(row[key]),'named-actor-result',row[key])
   actor,rule=role(row,location,ancestors)
   if row.get('status')in statuses:emit(actor,row['status'],rule)
   elif 'assertOk'in row or'timedOut'in row or'assertError'in row:emit(actor,outcome(row),rule)
   elif isinstance(row.get('result'),dict):emit(actor,outcome(row['result']),rule,row['result'])
  for key,value in row.items():
   if isinstance(value,(dict,list)):walk(value,location+'/'+key,ancestors+[row],path)
 walk(root)
if '--frozen-inputs'in sys.argv:
 for file in sorted((HERE/'evidence-inputs').rglob('*.json')):scan(file,str(file.relative_to(HERE/'evidence-inputs')))
else:
 for directory in ['docs/reference','proposals']:
  for file in sorted((ROOT/directory).rglob('*.json')):scan(file)
# Duplicate summary columns and overlapping raw/summary artifacts do not inflate
# distinct path counts; every accepted record still points to its original row.
dedup={json.dumps(row,sort_keys=True):row for row in evidence};evidence=list(dedup.values())
def group(paths):
 return {actor:{'attempted':len({r['fixture']for r in evidence if r['fixture']in paths and r['actor']==actor}),'confirmedHarnessObserved':len({r['fixture']for r in evidence if r['fixture']in paths and r['actor']==actor and r['confirmedHarnessObservation']}),'everReportedPassed':len({r['fixture']for r in evidence if r['fixture']in paths and r['actor']==actor and r['status']=='passed'}),'everHashVerifiedPassed':len({r['fixture']for r in evidence if r['fixture']in paths and r['actor']==actor and r['status']=='passed'and r['fixtureHashVerified']is True})}for actor in ['native','candidate']}
default={name for name,profile in profiles.items()if profile=={'enabledResources':['iframe','worker'],'experimentalFeatures':{},'injectScriptLiteral':None,'timeoutMs':2000}}
stylesheet={name for name,profile in profiles.items()if profile['enabledResources']==['stylesheet']};other=registered-default-stylesheet
positive={r['fixture']for r in evidence if r['status']=='passed'}
per_artifact=[]
for file in sorted({row['file']for row in evidence}):
 for actor in ['native','candidate']:
  rows=[row for row in evidence if row['file']==file and row['actor']==actor]
  if rows:per_artifact.append({'file':file,'actor':actor,'source':rows[0]['source'],'distinctFixtures':len({row['fixture']for row in rows}),'statusDistinctFixtures':{status:len({row['fixture']for row in rows if row['status']==status})for status in statuses},'note':'one artifact only; variants may overlap; not summed across snapshots'})
report={'schemaVersion':1,'scope':'Historical evidence coverage, not a current or aggregate pass-rate claim','upstreamCommit':upstream['upstreamCommit'],'registeredPartition':{'default440':sorted(default),'stylesheet5':sorted(stylesheet),'other10':sorted(other)},'coverage':{'registered':group(registered),'default':group(default),'stylesheet':group(stylesheet),'other':group(other)},'allHistoricalPositiveUnionUse':'Only to avoid selecting fixtures with any prior reported positive; never a current passing total','defaultNoPositiveEvidence':sorted(default-positive),'evidence':evidence,'perArtifact':per_artifact,'unknownActorOutcomes':unknown,'parseErrors':rejected,'inputFilesSHA256':files,'limits':['Only retained JSON outcomes in docs/reference and proposals are indexed (frozen replay uses the108 accepted input artifacts). Log-only ephemeral runs are not silently inferred.','Terminal failed/timeout records without explicit harness/branch flags or actual harness assertion diagnostics count as attempted, not confirmed observed.','Historical passes with no per-row fixture hash are retained separately from hash-verified positives.','Raw HTTP request logs and source-only fixture inventories are excluded from runtime outcomes.','Source identity is kept per artifact/variant; no snapshot unions become pass claims.']}
(HERE/'inventory.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'partition':{k:len(v)for k,v in report['registeredPartition'].items()},'coverage':report['coverage'],'noPositive':len(report['defaultNoPositiveEvidence']),'records':len(evidence),'unknown':len(unknown)},indent=2))
