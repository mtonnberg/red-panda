"""Unrun, Native-first correctness observations; no candidate or production edit."""
from pathlib import Path
import json,hashlib,subprocess,os,signal,time,resource
p=Path(__file__).resolve().parent;root=p.parent.parent;out=p/'baseline-r1';node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node')
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
def snapshot():
 files=[f for d in ['src','test','native'] for f in (root/d).rglob('*') if f.is_file()]
 files += [f for f in p.glob('*') if f.is_file()]+[node,root/'scripts/reference-server.mjs']
 return {str(f):sha(f) for f in sorted(set(files))}
def core_zero():resource.setrlimit(resource.RLIMIT_CORE,(0,0))
out.mkdir(exist_ok=False);before=snapshot();(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n');rows=[];start=time.monotonic()
env=dict(os.environ,NODE_USE_ENV_PROXY='1')
for key in ['NO_PROXY','no_proxy']:env[key]=','.join(filter(None,[env.get(key),'127.0.0.1','localhost','0.0.0.0']))
for name,args,cap in [('Native',[str(p/'native-probe.mjs'),str(out/'Native.json')],20),('baseline',[str(p/'baseline-probe.mjs')],8),('host-fatal',[str(p/'baseline-probe.mjs'),'host-fatal'],4)]:
 with (out/(name+'.stdout')).open('xb') as stdout,(out/(name+'.stderr')).open('xb') as stderr:
  child=subprocess.Popen([str(node),*args],cwd=root,env=env,stdout=stdout,stderr=stderr,start_new_session=True,preexec_fn=core_zero)
  try:code=child.wait(timeout=min(cap,35-(time.monotonic()-start)));expired=False
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
 rows.append({'name':name,'pid':child.pid,'exit':code,'deadline':expired,'capSeconds':cap})
 (out/'steps.json').write_text(json.dumps(rows,indent=2)+'\n')
 if name!='host-fatal' and (expired or code):break
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'scope':'observations, no acceptance/candidate claim','rows':rows,'unchanged':before==after,'guardInputs':len(before),'seconds':time.monotonic()-start,'outerSeconds':35,'noCandidate':True};(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
raise SystemExit(0 if len(rows)==3 and before==after and not any(r['deadline']for r in rows) else 1)
