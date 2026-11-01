#!/usr/bin/env python3
"""Read-only static audit; writes one new review artifact, never executes browsers."""
import collections, hashlib, json, pathlib, re, sys
repo=pathlib.Path(__file__).resolve().parents[2];docs=repo/'docs/reference'
source=docs/'upstream-fixture-inventory.json';inv=json.loads(source.read_text());up=pathlib.Path(inv['upstreamRoot'])
digest=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
checkpoints=['conformance-classic-checkpoint.json','conformance-expanded-checkpoint.json','conformance-webapi-checkpoint.json','conformance-shadow-checkpoint.json','conformance-lifecycle-checkpoint.json','conformance-parser-forms-checkpoint.json','conformance-properties-runtime-checkpoint.json','conformance-broader-checkpoint.json']
registered={x['path']:x for x in inv['fixtures'] if x['htmlRunnerRegistrations']};profiles=collections.defaultdict(set);hist=collections.defaultdict(list);inputs={str(source.relative_to(repo)):digest(source)}
for f in inv['fixtures']:
 for rid in f['htmlRunnerRegistrations']:
  r=inv['registrations'][rid];key=json.dumps({k:r[k] for k in ['enabledResources','experimentalFeatures','injectScriptLiteral','timeoutMs']},sort_keys=True);profiles[key].add(f['path'])
for name in checkpoints:
 p=docs/name;r=json.loads(p.read_text());inputs[str(p.relative_to(repo))]=digest(p)
 for row in r['results']:
  hist[row['path']].append({'checkpoint':name,'candidateCommit':r.get('candidateBaseCommit',r.get('candidateCommit')),'nativeStatus':row.get('nativeStatus'),'candidateStatus':row.get('candidateStatus'),'fixtureSHA256':row.get('fixtureSHA256',row.get('sha256'))})
latest_names=set(checkpoints[-2:]);recent={p for p,rows in hist.items() if any(x['checkpoint'] in latest_names for x in rows)}
recent_registered=set(registered)&recent;measured=set(registered)&set(hist)
fixture_mismatches=[x['path'] for x in inv['fixtures'] if digest(up/'src/browser/tests'/x['path'])!=x['sha256']]
source_hashes={x['source']:x['sourceSHA256'] for x in inv['registrations']};source_mismatches=[p for p,h in source_hashes.items() if digest(up/p)!=h]
helper=(repo/'scripts/upstream-fixture-server.mjs').read_text();route_block=helper.split('export const implementedRoutes = [',1)[1].split('];',1)[0];helper_routes=re.findall(r"'([^']+)'",route_block)
routes=(up/'src/test_routes.zig').read_text();literal_routes=[]
for m in re.finditer(r'std\.mem\.(eql|startsWith)\(u8, path, "([^"]+)"\)',routes):literal_routes.append({'kind':m[1],'path':m[2],'line':routes.count('\n',0,m.start())+1})
cli=(repo/'bin/red-panda.js').read_text();options=cli.split('export async function main',1)[1].split('} });',1)[0]
accepted={a or b for a,b in re.findall(r"(?:'([^']+)'|\b(\w+)):\s*\{\s*type:",options)}
helptext=(docs/'fetch-help.txt').read_text();nativeflags=set(re.findall(r'^  --([\w-]+)',helptext,re.M))
protocol=json.loads((docs/'cdp-protocol.json').read_text());nativecommands={d['domain']+'.'+c['name'] for d in protocol['domains'] for c in d.get('commands',[])}
cdp=(repo/'src/cdp.js').read_text();implemented=set(re.findall(r"case '([A-Z]\w*\.\w+)'",cdp))
for file,constant in [('runtime.js','methods'),('dom.js','methods'),('input.js','METHODS')]:
 text=(repo/'src'/file).read_text();block=text.split('const '+constant+' = new Set([',1)[1].split(']);',1)[0];implemented.update(re.findall(r"'([A-Z]\w*\.\w+)'",block))
for domain in ['Page','Runtime','Network','DOM','Log','Performance','Audits']:implemented.update([domain+'.enable',domain+'.disable'])
old_nonpasses=[]
for p,f in registered.items():
 h=f.get('historical178');
 if h and h['nativeStatus']=='passed' and h['candidateStatus']!='passed' and p not in recent:old_nonpasses.append(p)
audit={'schemaVersion':1,'scope':'Read-only source/checkpoint inventory; no runtime coverage inferred from method names or historical results','upstreamCommit':inv['upstreamCommit'],'nativeBinarySHA256':'9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f','verification':{'fixtureHashMismatches':fixture_mismatches,'registrationSourceHashMismatches':source_mismatches,'registrationSourceFilesVerified':len(source_hashes),'htmlFixturesVerified':len(inv['fixtures'])},'counts':{'registeredUnique':len(registered),'registrationCalls':len(inv['registrations']),'nonDefaultRegistrationCalls':sum(x['optionsRaw'].strip()!='.{}' for x in inv['registrations']),'historicalCheckpointUnionRegistered':len(measured),'registeredWithoutAnySelectedHistoricalEvidence':len(set(registered)-measured),'latest41PlusBroader32Union':len(recent_registered),'registeredOutsideLatest41PlusBroader32':len(set(registered)-recent_registered)},'configurationProfiles':[{'profile':json.loads(k),'count':len(v),'paths':sorted(v)} for k,v in profiles.items()],'nonDefaultRegistrations':[x for x in inv['registrations'] if x['optionsRaw'].strip()!='.{}'],'fixtureHistory':dict(hist),'registeredWithoutSelectedHistoricalEvidence':sorted(set(registered)-measured),'historicalNativePassingCandidateNonpassOutsideLatest73':sorted(old_nonpasses),'routes':{'staticHintWarning':'Literal href/src values can be value-only assertions; generated/transitive URLs can be absent from this scan. Endpoint presence is not body/header/timing equivalence.','helperRoutes':helper_routes,'upstreamLiteralChecks':literal_routes,'upstreamExactRouteChecksAbsentFromHelper':[x for x in literal_routes if x['kind']=='eql' and x['path'] not in helper_routes],'helperChangedSinceOriginalInventory':digest(repo/'scripts/upstream-fixture-server.mjs')!=inv['inventoryInputsSHA256']['scripts/upstream-fixture-server.mjs']},'cli':{'nativeFetchHelpFlags':sorted(nativeflags),'candidateParserFlags':sorted(accepted),'candidateSourceDefaults':{'dump':re.search(r"dump: \{ type: 'string', default: '([^']*)'",options).group(1),'waitMs':int(re.search(r"'wait-ms': \{ type: 'string', default: '(\d+)'",options).group(1)),'waitUntil':re.search(r"'wait-until': \{ type: 'string', default: '([^']*)'",options).group(1),'scope':'Source parser values only; default deadline outcome and process lifetime are separate observed contracts'},'nativeFlagsAbsentFromCandidateParser':sorted(nativeflags-accepted),'candidateOnlyParserFlags':sorted(accepted-nativeflags),'note':'Parser presence is not verified behavior. Native help is previously captured from the pinned binary.'},'protocol':{'nativeSchemaCommandCount':len(nativecommands),'candidateStaticDispatchIntersectionCount':len(nativecommands&implemented),'nativeSchemaCommandsWithoutStaticCandidateDispatch':sorted(nativecommands-implemented),'noOpCandidateDispatches':['Network.setCacheDisabled','Page.setInterceptFileChooserDialog','Emulation.setFocusEmulationEnabled','Emulation.setEmulatedMedia','Emulation.setTouchEmulationEnabled','Performance.setTimeDomain','Target.setAutoAttach'],'note':'Static dispatch inventory only; commands can be partial/no-op, and listed absent commands have not been individually invoked against native.'},'inputsSHA256':inputs|{str(p.relative_to(repo)):digest(p) for p in [repo/'src/cdp.js',repo/'src/runtime.js',repo/'src/dom.js',repo/'src/input.js',repo/'bin/red-panda.js',repo/'scripts/upstream-fixture-server.mjs',docs/'cdp-protocol.json',docs/'fetch-help.txt']}}
out=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else docs/'compatibility-remaining-audit.json'
with out.open('x') as f:json.dump(audit,f,indent=2);f.write('\n')
print(json.dumps({'output':str(out),'counts':audit['counts'],'verified':audit['verification'],'protocol':{'schema':len(nativecommands),'staticIntersection':len(nativecommands&implemented)}}))
