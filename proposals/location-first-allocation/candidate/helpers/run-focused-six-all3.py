from pathlib import Path
import subprocess,os,json,time,hashlib,signal
root=Path(__file__).resolve().parent.parent
env=dict(os.environ,NODE_USE_ENV_PROXY='1');prior=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]))
aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]'
env.update({key:','.join(filter(None,[prior,aliases])) for key in ['NO_PROXY','no_proxy']})
nodes=['/workspace/shared/rea-tools/node_modules/node/bin/node','/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node','/workspace/shared/node26/node_modules/node/bin/node']
paths=sorted(set([p for tree in [root/'src',root/'native',root/'helpers',root/'node_modules'] for p in tree.rglob('*') if p.is_file() and '__pycache__' not in p.parts]+[root/'package.json',root/'package-lock.json',root/'test/location-factory.test.js',*map(Path,nodes)]))
def snapshot():return {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
before=snapshot();(root/'evidence/focused6-all3-before.json').write_text(json.dumps(before,indent=2)+'\n');start=time.monotonic();rows=[]
for index,node in enumerate(nodes):
    command=[node,'--experimental-vm-modules','--test','--test-concurrency=1','test/location-factory.test.js']
    with (root/('evidence/focused6-all3-'+str(index)+'.log')).open('x') as log:
        process=subprocess.Popen(command,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:code=process.wait(timeout=max(1,17-(time.monotonic()-start)))
        except BaseException:
            os.killpg(process.pid,signal.SIGTERM)
            try:process.wait(timeout=0.3)
            except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
            raise
    rows.append({'command':command,'exit':code,'elapsedSeconds':round(time.monotonic()-start,3)});print(json.dumps(rows[-1]),flush=True)
after=snapshot();(root/'evidence/focused6-all3-after.json').write_text(json.dumps(after,indent=2)+'\n')
status={'rows':rows,'inputs':len(before),'unchanged':before==after,'elapsedSeconds':round(time.monotonic()-start,3)}
(root/'evidence/focused6-all3-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
