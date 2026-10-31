# UNRUN until Parent grant. Actual 10s API/load limits are unchanged.
import json,pathlib,hashlib,subprocess,time,signal,os
p=pathlib.Path(__file__).resolve().parent;r=pathlib.Path('/workspace/red-panda');s=pathlib.Path('/workspace/shared/animation-private-owner-20261031');out=p/'native-causal-r2';out.mkdir(exist_ok=False);sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest();base=json.loads((p/'private-owner-static-r1/base-source.json').read_text());candidate=json.loads((p/'private-owner-static-r1/candidate-source.json').read_text());deps=json.loads((r/'proposals/phase23-first-gate-dacebc/dependencies.json').read_text());node='/workspace/shared/rea-tools/node_modules/node/bin/node'
def snapshot():
 result={}
 for label,folder,names in [('Root',r,base),('candidateR1',s,candidate),('dependencies',r,deps)]:
  for name,h in names.items():value=sha(folder/name);assert value==h,(label,name);result[label+'/'+name]=value
 for f in [pathlib.Path(node),p/'reaction-boundary-expression.js',p/'native-causal-r2.mjs',pathlib.Path(__file__)]:result[str(f)]=sha(f)
 return result
before=snapshot();(out/'source-before.json').write_text(json.dumps(before,indent=2)+'\n');start=time.monotonic();command=[node,str(p/'native-causal-r2.mjs'),str(out/'Native.json')]
with(out/'raw.log').open('xb')as log:
 child=subprocess.Popen(command,cwd=r,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:code=child.wait(timeout=20);expired=False
 except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait();expired=True
after=snapshot();(out/'source-after.json').write_text(json.dumps(after,indent=2)+'\n');report=json.loads((out/'Native.json').read_text())if(out/'Native.json').exists()else{};values=report.get('result',{}).get('result',{}).get('value',[]);status={'command':command,'nodePID':child.pid,'exit':code,'administrativeDeadline':expired,'seconds':time.monotonic()-start,'expectedRows':4,'actualRows':len(values),'sourceUnchanged':before==after,'guardInputs':len(before),'RootEdits':False};(out/'status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if code==0 and not expired and len(values)==4 and before==after else 1)
