from pathlib import Path
import collections
import hashlib
import json
import re

root=Path('/workspace/red-panda')
out=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
load=lambda path:json.loads((root/path).read_text())

inputs=[
 'docs/reference/compatibility-remaining-plan.md','docs/reference/compatibility-remaining-audit.json',
 'docs/reference/compatibility-remaining-manifest.json','docs/reference/upstream-fixture-inventory.json',
 'docs/reference/upstream-fixture-inventory.md','docs/COMPATIBILITY.md',
 'proposals/native455-canonical/classified-matrix.json','proposals/native455-canonical/README.md',
 'proposals/candidate455-phase17/classified-matrix.json','proposals/candidate455-phase17/README.md',
 'proposals/candidate455-phase17/registration-map.json','proposals/websocket-runner-global/README.md',
 'proposals/websocket-runner-global/global-configuration-audit.json',
 'proposals/phase25-full-initial/code-leaf-manifest.json','proposals/phase25-full-initial/README.md',
 'proposals/phase25-full-initial/status.json','proposals/phase25-independent-controls/README.md',
 'proposals/phase25-independent-controls/status.json','proposals/phase25-failure-singlecases/README.md',
 'proposals/phase25-failure-files/README.md','proposals/phase23-branding-decision/decision.json',
 'proposals/phase22-integration/source63-final/source-phase22-native.json',
 'proposals/phase22-integration/source63-final/source-phase22-candidate.json',
 'proposals/phase22-integration/source63-final/source-phase22-status.json',
 'proposals/cdp-cookie-actions/README.md','proposals/cdp-cookie-unicode/README.md',
 'proposals/javascript-dialogs/README.md','proposals/network-body-capture/README.md',
 'proposals/permission-geolocation/tested/README.md','proposals/lp-aliases-canonical/README.md',
 'proposals/page-lifecycle-controls/validation-r1/README.md',
 'src/cdp.js','src/dom.js','src/input.js','src/runtime.js','src/permission-control.js',
 'src/javascript-dialogs.js','src/network-capture.js','src/browser.js','src/cli-options.js',
 'bin/red-panda.js','scripts/conformance.mjs','scripts/upstream-fixture-server.mjs',
 'scripts/reference-server.mjs','proposals/candidate455-phase17/run-candidate455.mjs',
 'proposals/native455-canonical/run-native455.mjs',
 '.cache/lightpanda-reference/browser-948d773786/src/testing.zig',
 '.cache/lightpanda-reference/browser-948d773786/src/browser/Runner.zig',
 '.cache/lightpanda-reference/browser-948d773786/src/server/cdp/domains/network.zig',
 '.cache/lightpanda-reference/browser-948d773786/src/network/UrlBlocklist.zig',
 'test/websocket-quota.test.js',
]
leaves=load('proposals/phase25-full-initial/code-leaf-manifest.json')
leaf_check={path:{'expected':expected,'observed':sha(root/path)} for path,expected in leaves['leaves'].items()}
inputs=sorted(set(inputs)|set(leaf_check))
external=[Path('/workspace/shared/rea-tools/node_modules/rea-agents/skills/reverse-engineer-anything/SKILL.md'),Path('/workspace/shared/cdp-gap-inventory-handoff/static1/evidence/dispatch-matrix.json'),Path('/workspace/shared/owned-current-root-integration-handoff/static1/design/MODULE-BOUNDARY.md')]
(out/'input-hashes.json').write_text(json.dumps({'scope':'Static source/artifact identity only; no new runtime results','rootBase':leaves['base'],'Root37Leaves':leaf_check,'all37Match':all(x['expected']==x['observed'] for x in leaf_check.values()),'files':[{'path':str(root/path),'sha256':sha(root/path)} for path in inputs]+[{'path':str(path),'sha256':sha(path)} for path in external]},indent=2)+'\n')

native=load('proposals/native455-canonical/classified-matrix.json')
candidate=load('proposals/candidate455-phase17/classified-matrix.json')
nr={row['path']:row for row in native['rows']}
historical=[]
for row in candidate['rows']:
    n=nr[row['path']]
    if row['kind']!='verified-source-harness-pass' and n['category']=='verified-native-harness-pass':
        historical.append({'path':row['path'],'candidateHistoricalCategory':row['kind'],'NativeHistoricalCategory':n['category'],'sameFixtureSHA256':row['sha256']==n['fixtureSHA256'],'sameRegistrationProfile':row['profile']==n['profile'],'current37Status':'UNMEASURED as a full registered fixture; later curated proofs remain separate','candidateReport':row['report'],'NativeReport':n['driverReport']})
(out/'historical455.json').write_text(json.dumps({'scope':'Historical exact-profile matrices only, never current failure counts','native':{'selected':native['selected'],'categories':native['categoryCounts']},'candidate':{'commit':candidate['candidateCommit'],'categories':candidate['classifiedCounts']},'NativePositiveCandidateHistoricalNonpass':historical,'count':len(historical),'families':dict(collections.Counter(row['path'].split('/')[0] for row in historical))},indent=2)+'\n')

cdp=(root/'src/cdp.js').read_text()
route_map=collections.defaultdict(list)
connection_offset=cdp.index('class Connection')
for match in re.finditer(r"case ['\"]([A-Z][A-Za-z0-9]*\.[A-Za-z0-9]+)['\"]",cdp):
    route_map[match[1]].append({'source':'src/cdp.js','line':cdp.count('\n',0,match.start())+1,'owner':'Connection.run' if match.start()>connection_offset else 'Session.run'})
for filename,sets,owner in [
 ('src/cdp.js',['SESSION_ENABLE_METHODS','SESSION_DISABLE_METHODS','CONFIGURATION_ACK_METHODS'],'Exact lifecycle/ack set'),
 ('src/dom.js',['methods'],'Dedicated supportsDOM/runDOM'),
 ('src/input.js',['METHODS'],'Dedicated supportsInput/runInput'),
 ('src/runtime.js',['methods'],'Dedicated supportsRuntime/runRuntime'),
 ('src/permission-control.js',['methods'],'supportsPermissionControl/runPermissionControl'),
]:
    text=(root/filename).read_text()
    for name in sets:
        match=re.search(r'\b'+name+r'\s*=\s*new Set\(\[([\s\S]*?)\]\)',text)
        assert match,(filename,name)
        for method in re.findall(r"['\"]([A-Z][A-Za-z0-9]*\.[A-Za-z0-9]+)['\"]",match[1]):
            route_map[method].append({'source':filename,'line':text.count('\n',0,match.start())+1,'owner':owner})
baseline=json.loads(external[1].read_text())
source_methods={row['method'] for row in baseline['rows']}
schema_methods={row['method'] for row in baseline['rows'] if row['schemaAdvertised']}
ack={'CSS.enable','Inspector.enable','Inspector.disable','Security.enable','Security.disable','Network.setCacheDisabled','Page.setInterceptFileChooserDialog','Emulation.setFocusEmulationEnabled','Emulation.setEmulatedMedia','Emulation.setTouchEmulationEnabled','Performance.setTimeDomain','Target.setAutoAttach'}
rejection={'Page.handleJavaScriptDialog'}
rows=[]
for row in baseline['rows']:
    method=row['method'];routes=route_map.get(method,[])
    category='not recognized by exact dispatch, unsupported fallback'
    if routes:category='recognized; substantive/scoped backend requires its own bounded evidence'
    if method in ack and routes:category='acknowledgement/configuration only; not underlying engine feature'
    if method in rejection and routes:category='measured explicit no-dialog rejection, not blocking modal backend'
    rows.append({'method':method,'schemaAdvertised':row['schemaAdvertised'],'NativeSource':row['native'],'currentRoutes':routes,'staticCategory':category,'runtimeClaim':'None produced by this static audit'})
(out/'current-dispatch.json').write_text(json.dumps({'scope':'Actual receive/session routers, dedicated method sets and explicit cases; recognized names are not parity counts','NativeSourceCommands':len(source_methods),'NativeSchemaCommands':len(schema_methods),'recognizedNativeSourceNames':len(source_methods&set(route_map)),'recognizedNativeSchemaNames':len(schema_methods&set(route_map)),'RootExtensions':sorted(set(route_map)-source_methods),'rows':rows},indent=2)+'\n')

old=load('docs/reference/compatibility-remaining-audit.json')
cli=(root/'bin/red-panda.js').read_text();options=cli[cli.index('const { values,'):cli.index('  if (values.version)')]
flags=set(a or b for a,b in re.findall(r"(?:['\"]([^'\"]+)['\"]|([A-Za-z][A-Za-z0-9-]*))\s*:\s*\{\s*type:",options))
native_flags=set(old['cli']['nativeFetchHelpFlags'])
(out/'cli-flags.json').write_text(json.dumps({'scope':'Parser wiring only; help/name presence does not verify behavior','NativePinnedHelpFlags':sorted(native_flags),'currentParserFlags':sorted(flags),'NativeFlagsStillAbsentFromParser':sorted(native_flags-flags),'oldMissingNowParsed':sorted(set(old['cli']['nativeFlagsAbsentFromCandidateParser'])&flags),'ws50':{'staticAccepted':True,'range':'0..255','productDefault':8,'proof':'src/cli-options.js:45 + test/websocket-quota.test.js:10, prior actual evidence; no new run'}},indent=2)+'\n')

map_path=root/'proposals/candidate455-phase17/registration-map.json';registration=json.loads(map_path.read_text())
shutil_note='Copy and hash the exact current scripts/engine/deps/native artifacts into one new immutable snapshot before executing any plan. Do not execute old hardcoded Root output wrappers.'
fixture_root=registration['sourceRoot']+'/src/browser/tests'
snapshot='/workspace/shared/phase25-census-FROZEN-REQUIRED'
reports='/workspace/shared/phase25-census-NEW-EPOCH-REQUIRED'
commands=[]
for index,fixture in enumerate(registration['fixtures']):
    for engine,binary in [('native','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'),('candidate',snapshot+'/red-panda-launcher')]:
        label=f'{index:03d}-'+fixture['path'].replace('/','__').removesuffix('.html')
        command=['/workspace/shared/rea-tools/node_modules/node/bin/node',snapshot+'/scripts/conformance.mjs','--root',fixture_root,'--binary',binary,'--isolate','--fixture-profile','upstream','--source-load-contract','--registration-map',str(out/'registration-map.json'),'--port','9582','--websocket-port','9584','--runner-global-arg=--ws-max-concurrent','--runner-global-arg=50','--test',fixture['path'],'--report',reports+'/'+engine+'/'+label+'.json']
        profile=next(row for row in registration['profiles'] if row['id']==fixture['profile'])
        commands.append({'index':index,'engine':engine,'path':fixture['path'],'fixtureSHA256':fixture['sha256'],'sourceProfile':fixture['profile'],'loadBudgetMs':2000,'freshAssertionBudgetMs':profile['sourceTimeoutMs'],'outerAdministrativeCapMs':profile['sourceTimeoutMs']+17000,'command':command,'status':'UNRUN; placeholders/prerequisites deliberately unresolved'})
(out/'registration-map.json').write_bytes(map_path.read_bytes())
(out/'census-plan.json').write_text(json.dumps({'status':'STATIC UNRUN command plan, not a started/accepted census','registrationMapSHA256':sha(map_path),'profileCount':len(registration['profiles']),'fixtureCount':len(registration['fixtures']),'profiles':registration['profiles'],'commands':commands,'runnerGlobals':[
 {'name':'ws_max_concurrent','sourceValue':50,'explicitPlanArgs':['--ws-max-concurrent','50'],'RootCLIParses':True,'sourceMismatch':'None for this explicitly configured value; actual census UNRUN'},
 {'name':'insecure_disable_tls_host_verification','sourceValue':True,'explicitPlanArgs':[],'RootCLIParses':False,'sourceMismatch':'TLS verification policy not applied/equivalent; retain separate mismatch, especially for HTTPS cases'},
 {'name':'user_agent_suffix','sourceValue':'internal-tester','explicitPlanArgs':[],'RootCLIParses':False,'sourceMismatch':'Source suffix not applied; deliberate external harness UA override is separate instrumentation, not product branding'},
 {'name':'watchdog_ms','sourceValue':0,'explicitPlanArgs':[],'RootCLIParses':False,'sourceMismatch':'Source global watchdog configuration not reproduced; do not conflate with source load/assertion or administrative process budgets'},
 ],'branding':{'policy':'KEEP RED PANDA','literalIdentityFailure':'Retain as failed literal assertion, classify intentional difference; later assertions unexecuted/unverified, never whole fixture pass'},'prerequisites':[shutil_note,'Wait for Root current full validation/fix checkpoint; freeze exact final source hashes, not HEAD alone','Acquire exclusive9582/9584 plus quiet serial execution; no competing heap/build/runtime jobs','New output directory, one owned process and fixture server per fixture, preserve every report/stderr/owned exit/signal','Keep source2000ms load then fresh2000/8000 assertion budgets, original harness/assertions, nonzero observation and real load verification','Record Source test-global WS50 separately from fixture profile; no productdefault change','Flag TLS/UA/watchdog source globals separately; do not claim whole compiled-global equivalence','Keep branding literal assertion failures separate; never rewrite into passes or verify skipped assertions','Compare bytes/profile/server/binary/imported graph hashes before/after; classify setup/load/assertion/driver deadlines/crashes/route issues independently'],'compiledZigRunnerEquivalent':False,'NativeFullPassClaim':False,'WPTClaim':False,'performanceClaim':False},indent=2)+'\n')
print(json.dumps({'Root37Match':all(x['expected']==x['observed'] for x in leaf_check.values()),'historicalNativePositiveCandidateNonpass':len(historical),'recognizedSourceNames':len(source_methods&set(route_map)),'recognizedSchemaNames':len(schema_methods&set(route_map)),'currentFlags':len(flags),'stillMissingNativeCLIFlags':len(native_flags-flags),'oldMissingNowParsed':sorted(set(old['cli']['nativeFlagsAbsentFromCandidateParser'])&flags),'censusCommands':len(commands)},indent=2))
