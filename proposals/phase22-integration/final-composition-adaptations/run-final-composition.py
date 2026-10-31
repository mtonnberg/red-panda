from pathlib import Path
import json,hashlib,subprocess,time
r=Path.cwd();out=r/'integration-evidence/final-composition';out.mkdir(exist_ok=True)
folders=['src','test','native','bin','scripts','automation/src','automation/test','oracle','docs/reference','node_modules','.cache/lightpanda-reference/browser-948d773786/src/browser/tests']
proposals=['shared-worker','eventsource','websocket-quota','direct-target-migration','window-lifecycle-timers','window-viewport-parity','namespace-serialization','history-url-principal','form-target-routing','joint-session-history','navigation-api','navigation-reload','fixture-routes']
files=['location-private-alias','location-factory','location-boundaries','location-javascript','module-load-readiness','utility-node-target-binding','dom-wrapper-realms','dom-factory-parity','geometry-platform','messaging','shared-workers','shared-worker-transports','workers','worker-fetch','worker-abort','worker-apis','worker-authority','worker-dom-exception','worker-scheduler','websocket-quota','eventsource','window-lifecycle-timers','direct-target-migration','window-viewport-parity','fetch-interface-realms','namespace-serialization','history-principal']
def snapshot():
 paths=[p for folder in folders+['proposals/'+n for n in proposals] for p in(r/folder).rglob('*')if p.is_file()and '__pycache__'not in p.parts]
 paths += [r/n for n in ['package.json','package-lock.json','automation/spago.yaml','automation/spago.lock','integration-evidence/run-final-composition.py']]
 return {str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
assert all((r/('test/'+n+'.test.js')).is_file()for n in files)
before=snapshot();(out/'source-before.json').write_text(json.dumps(before,indent=2));rows=[]
for label,node in [('24.22.1','/workspace/shared/rea-tools/node_modules/node/bin/node'),('24.19.0','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('26.13.0','/workspace/shared/node26/node_modules/node/bin/node')]:
 identity=json.loads(subprocess.check_output([node,'-p','JSON.stringify({executable:process.execPath,versions:process.versions})'],text=True))
 command=[node,'--experimental-vm-modules','--test','--test-concurrency=1','--test-name-pattern=^(?!.*heap)',*['test/'+n+'.test.js'for n in files]]
 start=time.monotonic()
 with(out/(label+'.log')).open('x')as log:result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,timeout=600)
 rows.append({'runtime':identity,'command':command,'exit':result.returncode,'seconds':time.monotonic()-start});(out/'status-partial.json').write_text(json.dumps(rows,indent=2))
 if result.returncode:break
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2))
status={'steps':rows,'unchanged':before==after,'inputs':len(before),'changed':[n for n in set(before)|set(after)if before.get(n)!=after.get(n)],'heapScope':'Heap-named tests explicitly excluded here; full Root validation remains required.'}
(out/'status.json').write_text(json.dumps(status,indent=2));print(json.dumps(status),flush=True)
raise SystemExit(0 if before==after and len(rows)==3 and all(x['exit']==0 for x in rows)else 1)
