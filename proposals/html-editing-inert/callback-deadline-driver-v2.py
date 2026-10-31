from pathlib import Path
import subprocess,os,signal,time,json,selectors,hashlib
p=Path(__file__).parent;steps=[];node='/workspace/shared/rea-tools/node_modules/node/bin/node'
for label,scratch in [('before','/workspace/shared/html-inert-watchdog-before-20261031'),('after','/workspace/shared/html-editing-inert-phase21-20261031')]:
 started=time.monotonic();command=[node,'--experimental-vm-modules',str(p/'callback-deadline-child-v2.mjs'),scratch];process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True);selector=selectors.DefaultSelector();selector.register(process.stdout,selectors.EVENT_READ,'stdout');selector.register(process.stderr,selectors.EVENT_READ,'stderr');chunks={'stdout':b'','stderr':b''};armed=None;timeout=None
 while selector.get_map():
  now=time.monotonic();deadline=started+10 if armed is None else armed+3
  if now>=deadline:
   timeout='setup'if armed is None else'after-armed'
   try:os.killpg(process.pid,signal.SIGKILL)
   except ProcessLookupError:pass
   break
  for key,_ in selector.select(min(.05,deadline-now)):
   chunk=os.read(key.fileobj.fileno(),8192)
   if not chunk:selector.unregister(key.fileobj);continue
   chunks[key.data]+=chunk
   if key.data=='stdout'and armed is None:
    for line in chunks['stdout'].splitlines():
     try:row=json.loads(line)
     except json.JSONDecodeError:continue
     if row.get('stage')=='armed':armed=time.monotonic();break
 stdout,stderr=process.communicate(timeout=1);chunks['stdout']+=stdout;chunks['stderr']+=stderr;selector.close();row={'name':label,'command':command,'setupDeadlineMs':10000,'afterArmedDeadlineMs':3000,'timeout':timeout,'observedArmed':armed is not None,'exitCode':process.returncode,'elapsedMs':round((time.monotonic()-started)*1000),'afterArmedMs':None if armed is None else round((time.monotonic()-armed)*1000),'stdout':chunks['stdout'].decode(errors='replace'),'stderr':chunks['stderr'].decode(errors='replace'),'stateModuleSHA256':hashlib.sha256((Path(scratch)/'src/html-element-state.js').read_bytes()).hexdigest()};steps.append(row);print(label,timeout,process.returncode,flush=True);(p/'callback-deadline-results-v2.json').write_text(json.dumps(steps,indent=2)+'\n')
