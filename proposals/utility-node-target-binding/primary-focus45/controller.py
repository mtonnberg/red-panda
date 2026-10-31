from pathlib import Path
import json,hashlib,subprocess,time
r=Path.cwd();o=r/'integration-evidence';out=o/'utility-node-corrected-focused';out.mkdir(exist_ok=True)
def snap():
 names=['src','test','native','bin','scripts','automation/src','automation/test','docs/reference','node_modules','proposals/window-lifecycle-timers','proposals/shared-worker','proposals/eventsource','proposals/websocket-quota','proposals/window-viewport-parity','proposals/form-target-routing','proposals/joint-session-history','proposals/navigation-api','proposals/navigation-reload','proposals/history-url-principal']
 paths=[p for n in names for p in(r/n).rglob('*')if p.is_file()and '__pycache__'not in p.parts]+[r/n for n in ['package.json','package-lock.json','automation/spago.yaml','automation/spago.lock']]+[o/'run-utility-node-focused.py']
 return{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
files=['utility-node-target-binding','namespace-serialization','fetch-interface-realms','direct-target-migration','isolated-world','event-foundation','event-backend-initialization','private-event-utility-backing']
assert all((r/('test/'+n+'.test.js')).is_file()for n in files)
b=snap();(out/'source-before.json').write_text(json.dumps(b,indent=2));rows=[]
for label,node in [('24.22.1','/workspace/shared/rea-tools/node_modules/node/bin/node'),]:
 identity=json.loads(subprocess.check_output([node,'-p','JSON.stringify({executable:process.execPath,versions:process.versions})'],text=True));cmd=[node,'--experimental-vm-modules','--test','--test-concurrency=1',*['test/'+n+'.test.js'for n in files]];start=time.monotonic()
 with(out/(label+'.log')).open('w')as f:c=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=300)
 rows.append({'runtime':identity,'command':cmd,'exit':c.returncode,'seconds':time.monotonic()-start});(out/'status-partial.json').write_text(json.dumps(rows,indent=2))
 if c.returncode:break
a=snap();(out/'source-after.json').write_text(json.dumps(a,indent=2));d={'steps':rows,'unchanged':a==b,'inputs':len(b),'changed':[p for p in set(a)|set(b)if a.get(p)!=b.get(p)]};(out/'status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d));raise SystemExit(0 if len(rows)==3 and all(x['exit']==0 for x in rows)and a==b else 1)
