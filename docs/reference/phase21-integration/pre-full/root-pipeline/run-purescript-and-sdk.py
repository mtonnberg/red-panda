from pathlib import Path
import json,subprocess,hashlib,time,os
r=Path.cwd();o=r/'.cache/validation/phase21'
roots=['src','test','native','bin','scripts','automation/src','automation/test','oracle','docs/reference','node_modules','proposals/dom-attribute-names','proposals/namespace-serialization','proposals/event-api-parity','proposals/document-editing','proposals/form-control-parity','proposals/control-interface-realms','proposals/html-element-parity','proposals/html-editing-inert','proposals/css-source-liveness','proposals/shared-worker','proposals/eventsource','proposals/websocket-quota','proposals/css-layout','proposals/audio-core','proposals/web-crypto','proposals/urlpattern','proposals/text-encoder','proposals/document-write','proposals/images','proposals/payment-request','proposals/window-open']
def snap():
 paths=[p for n in roots for p in(r/n).rglob('*')if p.is_file()and'__pycache__'not in p.parts]+[r/n for n in ['package.json','package-lock.json','automation/spago.yaml','automation/spago.lock','.cache/validation/phase21/run-purescript-and-sdk.py','.cache/validation/phase21/run-sdk.py']]
 return{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
b=snap();(o/'pipeline-source-before.json').write_text(json.dumps(b,indent=2));checks=[]
steps=[('strict93',['npm','run','build:automation','--','--strict','--pedantic-packages'],{}),('puppeteer93',['npm','run','test:puppeteer'],{}),('sdk-24.19.0',['python3',str(o/'run-sdk.py')],{'PHASE21_LABEL':'sdk-24.19.0','PHASE21_NODE':'/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'}),('sdk-26.13.0',['python3',str(o/'run-sdk.py')],{'PHASE21_LABEL':'sdk-26.13.0','PHASE21_NODE':'/workspace/shared/node26/node_modules/node/bin/node'})]
for name,cmd,env in steps:
 start=time.monotonic()
 with(o/(name+'.log')).open('w')as f:c=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,env={**os.environ,**env})
 checks.append({'name':name,'command':cmd,'exit':c.returncode,'seconds':time.monotonic()-start});(o/'pipeline-status-partial.json').write_text(json.dumps(checks,indent=2))
 if c.returncode:break
a=snap();(o/'pipeline-source-after.json').write_text(json.dumps(a,indent=2));d={'checks':checks,'unchanged':a==b,'inputs':len(b),'changed':[p for p in set(a)|set(b)if a.get(p)!=b.get(p)]};(o/'pipeline-status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d));raise SystemExit(0 if len(checks)==4 and all(x['exit']==0 for x in checks)and a==b else 1)
