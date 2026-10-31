import os,pathlib,re,signal,subprocess,time
from validation_guard import PACKET,SOURCE,NODE,snapshot,save
out=PACKET/'focus-r1';out.mkdir(exist_ok=False);start=time.monotonic();before=snapshot();save(out/'source-before.json',before)
command=[str(NODE),'--experimental-vm-modules','--test','--test-concurrency=1','test/page-lifecycle.test.js']
with(out/'raw.log').open('xb')as log:
 child=subprocess.Popen(command,cwd=SOURCE,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:code=child.wait(timeout=60);administrative=False
 except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();administrative=True
text=(out/'raw.log').read_text();find=lambda label:(int(re.findall(r'\b'+label+r' (\d+)',text)[-1])if re.findall(r'\b'+label+r' (\d+)',text)else None)
after=snapshot();save(out/'source-after.json',after);status={'command':command,'seconds':time.monotonic()-start,'exit':code,'administrativeDeadline':administrative,'expectedTests':8,'actualTests':find('tests'),'pass':find('pass'),'fail':find('fail'),'sourceUnchanged':before==after,'guardInputs':len(before),'RootApplied':False};save(out/'status.json',status);print(status)
raise SystemExit(0 if code==0 and not administrative and status['actualTests']==status['pass']==8 and status['fail']==0 and before==after else 1)
