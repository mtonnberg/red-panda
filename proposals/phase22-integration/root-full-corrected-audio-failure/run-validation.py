from pathlib import Path
import json,hashlib,subprocess,time,os
root=Path.cwd();out=root/'.cache/validation/phase22-full-corrected'
proposal_inputs=['css-layout', 'audio-core', 'web-crypto', 'urlpattern', 'text-encoder', 'document-write', 'images', 'payment-request', 'window-open', 'dom-attribute-names', 'namespace-serialization', 'event-api-parity', 'document-editing', 'form-control-parity', 'control-interface-realms', 'html-element-parity', 'html-editing-inert', 'css-source-liveness', 'shared-worker', 'eventsource', 'websocket-quota', 'beacon-fixture-ownership', 'pointer-driver-precision', 'additional-control-interface-realms', 'programmatic-namespace', 'form-target-routing', 'joint-session-history', 'navigation-api', 'navigation-reload', 'history-url-principal', 'window-viewport-parity', 'direct-target-migration', 'window-lifecycle-timers', 'utility-node-target-binding', 'location-boundaries', 'location-javascript', 'module-load-readiness', 'worker-bootstrap-cost', 'location-first-allocation', 'location-private-alias', 'worker-xhr-cookie-calibration', 'sync-http-lazy', 'media-viewport-publication', 'stream-retirement', 'window-timer-task-checkpoint']
def snapshot():
 paths=[]
 for name in ['src','test','native','bin','scripts','automation/src','automation/test','oracle','docs/reference','node_modules','.cache/lightpanda-reference/browser-948d773786/src/browser/tests',*[f'proposals/{p}'for p in proposal_inputs]]:
  paths.extend(p for p in(root/name).rglob('*')if p.is_file()and '__pycache__'not in p.parts)
 paths.extend(root/p for p in ['package.json','package-lock.json','automation/spago.yaml','automation/spago.lock','proposals/fixture-routes/evidence/registration-map.json','.cache/validation/phase22-full-corrected/run-validation.py'])
 result={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
 target=Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux');result['external:lightpanda-native']=hashlib.sha256(target.read_bytes()).hexdigest();assert result['external:lightpanda-native']=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f'
 return result
identity=json.loads(subprocess.check_output(['node','-p','JSON.stringify({executable:process.execPath,versions:process.versions})'],text=True));identity['environment']={k:os.environ.get(k)for k in ['NODE_OPTIONS','NODE_USE_ENV_PROXY','NO_PROXY','no_proxy']};(out/'runtime-identity.json').write_text(json.dumps(identity,indent=2))
before=snapshot();(out/'full-source-before.json').write_text(json.dumps(before,indent=2));status=[]
for name,command in [('full',['npm','test']),('reference',['npm','run','test:reference','--','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux']),('check',['npm','run','check']),('strict',['npm','run','build:automation','--','--strict','--pedantic-packages'])]:
 start=time.monotonic()
 with(out/(name+'.log')).open('w')as f:result=subprocess.run(command,stdout=f,stderr=subprocess.STDOUT)
 status.append({'name':name,'exit':result.returncode,'seconds':time.monotonic()-start});(out/'full-status.json').write_text(json.dumps(status,indent=2))
 if result.returncode:break
end=snapshot();(out/'full-source-after.json').write_text(json.dumps(end,indent=2));stable=before==end;(out/'source-stable.json').write_text(json.dumps({'unchanged':stable,'inputs':len(before),'changed':[p for p in set(before)|set(end)if before.get(p)!=end.get(p)]},indent=2));print(json.dumps({'status':status,'unchanged':stable,'inputs':len(before)}));raise SystemExit(0 if stable and len(status)==4 and all(x['exit']==0 for x in status)else 1)
