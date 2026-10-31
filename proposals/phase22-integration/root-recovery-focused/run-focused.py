from pathlib import Path
import hashlib,json,subprocess,time
r=Path.cwd();out=r/'.cache/validation/phase22-recovery'
def snapshot():
 paths=[p for n in ['src','test','native','bin','scripts','oracle','docs/reference','node_modules','proposals/media-viewport-publication','proposals/stream-retirement'] for p in(r/n).rglob('*') if p.is_file() and '__pycache__'not in p.parts]
 paths += [r/n for n in ['package.json','package-lock.json','.cache/validation/phase22-recovery/run-focused.py']]
 return {str(p.relative_to(r)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}
b=snapshot();(out/'source-before.json').write_text(json.dumps(b,indent=2));rows=[]
for label,node in [('24.22.1','/workspace/shared/rea-tools/node_modules/node/bin/node'),('24.19.0','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('26.13.0','/workspace/shared/node26/node_modules/node/bin/node')]:
 for group,args in [('viewport',['test/css-compat.test.js','test/resize-observer.test.js','test/window-viewport-parity.test.js']),('retirement',['--test-name-pattern=selected Array construction bypasses|utility stream retirement|explicit authored disposal|stream-only VM','test/heap-query-worlds.test.js','test/streams-retirement-realms.test.js'])]:
  command=[node,'--experimental-vm-modules','--test','--test-concurrency=1',*args];start=time.monotonic()
  with(out/(label+'-'+group+'.log')).open('x')as log:result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,timeout=120)
  rows.append({'SDK':label,'group':group,'command':command,'exit':result.returncode,'seconds':time.monotonic()-start});(out/'status-partial.json').write_text(json.dumps(rows,indent=2))
  if result.returncode:break
 if rows[-1]['exit']:break
a=snapshot();(out/'source-after.json').write_text(json.dumps(a,indent=2));status={'steps':rows,'unchanged':a==b,'inputs':len(b),'changed':[n for n in set(a)|set(b)if a.get(n)!=b.get(n)],'scope':'35 viewport checks plus the original poisoned-Array case and 3 stream retirement checks; other heap cases excluded here'}
(out/'status.json').write_text(json.dumps(status,indent=2));print(json.dumps(status),flush=True)
raise SystemExit(0 if a==b and len(rows)==6 and all(x['exit']==0 for x in rows)else 1)
