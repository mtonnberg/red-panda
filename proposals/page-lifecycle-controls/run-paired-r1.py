import os,signal,subprocess,time,json
from validation_guard import PACKET,SOURCE,NODE,snapshot,save
out=PACKET/'paired-r1';out.mkdir(exist_ok=False);start=time.monotonic();before=snapshot();save(out/'source-before.json',before);steps=[]
for name,script,binary in [('Native',PACKET/'native-probe.mjs','/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux'),('candidate',PACKET/'candidate-probe.mjs',str(PACKET/'candidate-launcher.sh'))]:
 output=out/(name+'.json');command=[str(NODE),str(script),binary,str(output)];begin=time.monotonic()
 with(out/(name+'.log')).open('xb')as log:
  child=subprocess.Popen(command,cwd=SOURCE,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=child.wait(timeout=25);administrative=False
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();administrative=True
 report=json.loads(output.read_text())if output.exists()else None
 step={'engine':name,'command':command,'seconds':time.monotonic()-begin,'exit':code,'outer25sDeadline':administrative,'reportPresent':report is not None,'scenarios':len(report.get('rows',[]))if report else None,'failure':report.get('failure')if report else 'No report','budget':report.get('budgets')if report else None}
 steps.append(step);save(out/'steps.json',steps)
 if code!=0 or not report or report.get('failure')or len(report.get('rows',[]))!=12:break
after=snapshot();save(out/'source-after.json',after);status={'steps':steps,'seconds':time.monotonic()-start,'sourceUnchanged':before==after,'guardInputs':len(before),'RootApplied':False,'scope':'Actual paired12 scenario observations; semantic comparison remains explicit, no parity assertions inferred from command exit'};save(out/'status.json',status);print(status)
raise SystemExit(0 if len(steps)==2 and all(s['exit']==0 and not s['outer25sDeadline']and s['scenarios']==12 and not s['failure']for s in steps)and before==after else 1)
