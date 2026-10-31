from pathlib import Path
import subprocess,json,time,hashlib,os,signal,sys
p=Path.cwd();c=p/'candidate';base=json.loads((p/'evidence/candidate-final-static-manifest.json').read_text());state=lambda:{n:hashlib.sha256((c/n).read_bytes()).hexdigest() for n in base};assert state()==base
full=json.loads(Path('/workspace/red-panda/.cache/validation/phase22-full-diagnostic/full-source-before.json').read_text());deps={n:h for n,h in full.items()if n.startswith('node_modules/')};depstate=lambda:{n:hashlib.sha256((Path('/workspace/red-panda')/n).read_bytes()).hexdigest() for n in deps};assert depstate()==deps
sdk=[('24.22.1','/workspace/shared/rea-tools/node_modules/node/bin/node'),('24.19.0','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node'),('26.13.0','/workspace/shared/node26/node_modules/node/bin/node')]
if len(sys.argv)>1:sdk=[row for row in sdk if row[0]==sys.argv[1]]
rows=[]
for name,node in sdk:
 command=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/lp-aliases.test.js','test/dump.test.js','test/cdp.test.js'];start=time.monotonic();watchdog=False
 with (p/('evidence/focused-'+name+'.log')).open('xb')as log:
  child=subprocess.Popen(command,cwd=c,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=child.wait(timeout=45)
  except subprocess.TimeoutExpired:
   watchdog=True;os.killpg(child.pid,signal.SIGTERM)
   try:code=child.wait(timeout=3)
   except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
 rows.append({'node':name,'command':command,'exit':code,'seconds':time.monotonic()-start,'outerWatchdogSeconds':45,'watchdogTriggered':watchdog});print(json.dumps(rows[-1]),flush=True)
 assert state()==base
finalstate=state();finaldeps=depstate();(p/('evidence/focused-status-'+(sys.argv[1]if len(sys.argv)>1 else'all')+'.json')).write_text(json.dumps({'steps':rows,'sourceInputs':len(base),'changed':[n for n in base if finalstate[n]!=base[n]],'dependencyInputs':len(deps),'dependencyChanged':[n for n in deps if finaldeps[n]!=deps[n]]},indent=2)+'\n');sys.exit(1 if any(row['exit'] for row in rows)else 0)
