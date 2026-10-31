from pathlib import Path
import json,hashlib,subprocess,time
r=Path.cwd();o=r/'integration-evidence/purescript100'
def snap():
 names=['src','test','native','bin','scripts','automation/src','automation/test','docs/reference','node_modules','proposals/window-lifecycle-timers','proposals/shared-worker','proposals/eventsource','proposals/websocket-quota','proposals/window-viewport-parity','proposals/form-target-routing','proposals/joint-session-history','proposals/navigation-api','proposals/navigation-reload','proposals/history-url-principal']
 paths=[p for n in names for p in(r/n).rglob('*')if p.is_file()and '__pycache__'not in p.parts]
 paths += [p for n in ['automation/.spago/g','automation/.spago/p']for p in(r/n).rglob('*')if p.is_file()and p.suffix in ['.purs','.js']and '.git'not in p.parts]
 paths += [r/n for n in ['package.json','package-lock.json','automation/spago.yaml','automation/spago.lock']]+[o/'run-purescript100.py']
 return{str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
b=snap();(o/'purescript100-source-before.json').write_text(json.dumps(b,indent=2));identity=json.loads(subprocess.check_output(['node','-p','JSON.stringify({executable:process.execPath,versions:process.versions})'],text=True));rows=[]
for name,cmd in [('strict100',['npm','run','build:automation','--','--strict','--pedantic-packages']),('puppeteer100',['npm','run','test:puppeteer'])]:
 start=time.monotonic()
 with(o/(name+'.log')).open('w')as f:c=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,timeout=180)
 rows.append({'name':name,'command':cmd,'exit':c.returncode,'seconds':time.monotonic()-start});(o/'purescript100-status-partial.json').write_text(json.dumps(rows,indent=2))
 if c.returncode:break
a=snap();(o/'purescript100-source-after.json').write_text(json.dumps(a,indent=2));d={'runtime':identity,'steps':rows,'unchanged':a==b,'inputs':len(b),'changed':[p for p in set(a)|set(b)if a.get(p)!=b.get(p)]};(o/'purescript100-status.json').write_text(json.dumps(d,indent=2));print(json.dumps(d));raise SystemExit(0 if len(rows)==2 and all(x['exit']==0 for x in rows)and a==b else 1)
