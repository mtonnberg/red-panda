from pathlib import Path
import subprocess,os,signal,time,json
p=Path(__file__).parent;steps=[];node='/workspace/shared/rea-tools/node_modules/node/bin/node'
for label,scratch in [('before','/workspace/shared/html-inert-watchdog-before-20261031'),('after','/workspace/shared/html-editing-inert-phase21-20261031')]:
 started=time.monotonic();process=subprocess.Popen([node,'--experimental-vm-modules',str(p/'callback-deadline-child.mjs'),scratch],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=True)
 try:stdout,stderr=process.communicate(timeout=3);timeout=False
 except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);stdout,stderr=process.communicate();timeout=True
 row={'name':label,'externalDeadlineMs':3000,'externalTimeout':timeout,'exitCode':process.returncode,'elapsedMs':round((time.monotonic()-started)*1000),'stdout':stdout,'stderr':stderr};steps.append(row);print(label,timeout,process.returncode,flush=True);(p/'callback-deadline-results.json').write_text(json.dumps(steps,indent=2)+'\n')
