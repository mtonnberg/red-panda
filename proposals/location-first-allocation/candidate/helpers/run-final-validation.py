from pathlib import Path
import subprocess,os,json,time,hashlib,signal
root=Path(__file__).resolve().parent.parent;negative=root/'counterfactual-final-host-retarget'
env=dict(os.environ,NODE_USE_ENV_PROXY='1');prior=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]))
aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[prior,aliases])) for key in ['NO_PROXY','no_proxy']})
nodes=['/workspace/shared/rea-tools/node_modules/node/bin/node','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node','/workspace/shared/node26/node_modules/node/bin/node']
properFiles=sorted(set([p for tree in [root/'src',root/'native',root/'helpers',root/'node_modules'] for p in tree.rglob('*') if p.is_file() and '__pycache__' not in p.parts]+[root/'package.json',root/'package-lock.json',root/'test/location-factory.test.js',*map(Path,nodes)]))
negativeFiles=sorted([*negative.glob('src/**/*.js'),negative/'test/location-factory.test.js',negative/'package.json',negative/'package-lock.json'])
def snapshot(paths):return {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
properBefore=snapshot(properFiles);negativeBefore=snapshot(negativeFiles)
for label,data in [('proper',properBefore),('negative',negativeBefore)]:(root/('evidence/final-'+label+'-before.json')).write_text(json.dumps(data,indent=2)+'\n')
start=time.monotonic();rows=[]
operations=[('proper-'+str(index),[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/location-factory.test.js'],root) for index,node in enumerate(nodes)]+[('negative',[nodes[0],'--experimental-vm-modules','--test','--test-name-pattern=first actual Location front','test/location-factory.test.js'],negative)]
for label,command,cwd in operations:
    with (root/('evidence/final-'+label+'.log')).open('x') as log:
        process=subprocess.Popen(command,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:code=process.wait(timeout=max(1,17-(time.monotonic()-start)))
        except BaseException:
            os.killpg(process.pid,signal.SIGTERM)
            try:process.wait(timeout=0.3)
            except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
            raise
    rows.append({'label':label,'command':command,'exit':code,'expectedNegative':label=='negative','elapsedSeconds':round(time.monotonic()-start,3)});print(json.dumps(rows[-1]),flush=True)
properAfter=snapshot(properFiles);negativeAfter=snapshot(negativeFiles)
for label,data in [('proper',properAfter),('negative',negativeAfter)]:(root/('evidence/final-'+label+'-after.json')).write_text(json.dumps(data,indent=2)+'\n')
status={'rows':rows,'properInputs':len(properBefore),'properUnchanged':properBefore==properAfter,'negativeInputs':len(negativeBefore),'negativeUnchanged':negativeBefore==negativeAfter,'elapsedSeconds':round(time.monotonic()-start,3)}
(root/'evidence/final-validation-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
