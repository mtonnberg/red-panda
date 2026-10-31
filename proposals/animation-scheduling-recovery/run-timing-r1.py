# UNRUN preparation: execute only in a Parent-granted exclusive runtime slot.
import os,pathlib,json,hashlib,subprocess,signal,time
root=pathlib.Path('/workspace/red-panda');base=pathlib.Path('/workspace/shared/phase25-failure-baseline-ece1');packet=pathlib.Path(__file__).resolve().parent;node='/workspace/shared/rea-tools/node_modules/node/bin/node';out=packet/'timing-r1';out.mkdir(exist_ok=False);start=time.monotonic();sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();names=json.loads((base/'baseline-manifest.json').read_text())['files'];before={label+'/'+name:sha(folder/name)for label,folder in[('Root',root),('baseline',base)]for name in names};(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n');rows=[]
for mode in ['Root','baseline','Native']:
 command=[node,'--experimental-vm-modules',str(packet/'timing-probe.mjs'),mode,str(out/(mode+'.json'))]
 with(out/(mode+'.log')).open('xb')as log:
  began=time.monotonic();child=subprocess.Popen(command,cwd=root,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=child.wait(timeout=min(20,59-(time.monotonic()-start)));expired=False
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
 rows.append({'mode':mode,'pid':child.pid,'exit':code,'administrativeDeadline':expired,'seconds':time.monotonic()-began,'command':command})
 if expired or code:break
after={label+'/'+name:sha(folder/name)for label,folder in[('Root',root),('baseline',base)]for name in names};(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'scope':'Separate diagnostics, not originaloracle pass/fail','rows':rows,'sourceUnchanged':before==after,'guardedInputs':len(before),'seconds':time.monotonic()-start,'RootEdits':False};(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
raise SystemExit(0 if len(rows)==3 and all(r['exit']==0 and not r['administrativeDeadline']for r in rows)and before==after else 1)
