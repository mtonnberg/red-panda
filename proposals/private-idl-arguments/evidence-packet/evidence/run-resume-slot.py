from pathlib import Path
import subprocess,shutil,json,hashlib,time,sys
r=Path(__file__).resolve().parent.parent;e=r/'evidence';base=r/'base';node='/workspace/shared/rea-tools/node_modules/.bin/node';started=time.monotonic();statuses=[]
# This administrative controller bound does not alter any original Browser,
# API, script or test timeout. Execute only after explicit Parent release.
def run(label,cmd,cwd,expected,timeout=30):
 start=time.monotonic();p=subprocess.Popen(cmd,cwd=cwd,stdout=(e/(label+'.stdout.log')).open('w'),stderr=(e/(label+'.stderr.log')).open('w'),start_new_session=True)
 try:code=p.wait(timeout=timeout);timedOut=False
 except subprocess.TimeoutExpired:
  import os,signal
  os.killpg(p.pid,signal.SIGKILL);p.wait();code=p.returncode;timedOut=True
 status={'label':label,'command':cmd,'cwd':str(cwd),'exit':code,'expectedExit':expected,'administrativeTimeout':timedOut,'elapsedSeconds':time.monotonic()-start,'pid':p.pid};statuses.append(status);(e/'resume-slot-status.json').write_text(json.dumps({'complete':False,'elapsedSeconds':time.monotonic()-started,'commands':statuses},indent=2)+'\n');print(json.dumps(status),flush=True)
 assert not timedOut and code==expected,status
 return(e/(label+'.stdout.log')).read_text()
manifest=json.loads((e/'base-manifest.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert all(sha(base/p)==value for p,value in manifest['files'].items())
pattern='geometry captures intrinsic constructors|successful numeric setters|a failed ordinary indexed set'
original=lambda folder:[node,'--experimental-vm-modules','--test','--test-reporter=tap','--test-name-pattern',pattern,'test/range-geometry.test.js']
run('baseline-direct9-r1',[node,'--experimental-vm-modules',str(e/'direct-private-arguments.mjs'),str(base),'baseline'],base,0)
negative=r/'physical-negative'
run('physical-negative-direct9-r1',[node,'--experimental-vm-modules',str(e/'direct-private-arguments.mjs'),str(negative),'physical-negative'],negative,0)
raw=run('physical-negative-original3-r1',original(negative),negative,0);assert '# pass 3' in raw and '# fail 0' in raw
candidate=r/'candidate';assert not candidate.exists();shutil.copytree(base,candidate,symlinks=True)
patch=e/'private-arguments-intervention.patch'
check=subprocess.run(['git','apply','--check',str(patch)],cwd=candidate,text=True,capture_output=True);assert check.returncode==0,check.stderr
subprocess.run(['git','apply',str(patch)],cwd=candidate,check=True)
(e/'candidate-manifest.json').write_text(json.dumps({'files':{p:sha(candidate/p)for p in manifest['files']},'patchSHA256':sha(patch)},indent=2)+'\n')
run('candidate-direct9-r1',[node,'--experimental-vm-modules',str(e/'direct-private-arguments.mjs'),str(candidate),'candidate'],candidate,0)
raw=run('candidate-original3-r1',original(candidate),candidate,0);assert '# pass 3' in raw and '# fail 0' in raw
assert all(sha(base/p)==value for p,value in manifest['files'].items())
(e/'resume-slot-status.json').write_text(json.dumps({'complete':True,'elapsedSeconds':time.monotonic()-started,'commands':statuses,'unchangedBase519Inputs':True,'RootMutation':False,'counterfactualMeaning':'Only disable foundational/Document VM public installer dispatch; existing Attr genuineVM forwarding wrapper remainsVM over originalHost operation. Same other current graph; not a historical full-graph replay.'},indent=2)+'\n')
print(json.dumps({'complete':True,'elapsedSeconds':time.monotonic()-started,'commands':len(statuses),'RootMutation':False}),flush=True)
