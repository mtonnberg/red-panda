from pathlib import Path
import subprocess,os,json,time,hashlib,signal
root=Path(__file__).resolve().parent.parent;node='/workspace/shared/rea-tools/node_modules/node/bin/node'
env=dict(os.environ,NODE_USE_ENV_PROXY='1');prior=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]))
aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]';env.update({key:','.join(filter(None,[prior,aliases])) for key in ['NO_PROXY','no_proxy']})
paths=sorted(set([p for tree in [root/'src',root/'native',root/'helpers',root/'node_modules'] for p in tree.rglob('*') if p.is_file() and '__pycache__' not in p.parts]+[root/'test/location-factory.test.js',root/'package.json',root/'package-lock.json',Path(node),Path('/workspace/red-panda/scripts/reference-server.mjs'),Path('/workspace/red-panda/test/cdp-client.js'),Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux')]))
def snapshot():return {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
before=snapshot();(root/'evidence/conversion-control-v2-before.json').write_text(json.dumps(before,indent=2)+'\n');started=time.monotonic();rows=[]
commands=[('native-conversion-v2',[node,'--experimental-vm-modules','helpers/location-conversion-intrinsics-v2.mjs','native','evidence/native-conversion-intrinsics-v2.json']),('candidate-conversion-v2',[node,'--experimental-vm-modules','helpers/location-conversion-intrinsics-v2.mjs',str(root),'evidence/candidate-conversion-intrinsics-v2.json'])]
for label,command in commands:
    with (root/('evidence/'+label+'.log')).open('x') as log:
        process=subprocess.Popen(command,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try:code=process.wait(timeout=max(1,13-(time.monotonic()-started)))
        except BaseException:
            os.killpg(process.pid,signal.SIGTERM)
            try:process.wait(timeout=0.3)
            except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);process.wait()
            raise
    rows.append({'label':label,'command':command,'exit':code,'elapsedSeconds':round(time.monotonic()-started,3)});print(json.dumps(rows[-1]),flush=True)
after=snapshot();(root/'evidence/conversion-control-v2-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'rows':rows,'inputs':len(before),'unchanged':before==after,'elapsedSeconds':round(time.monotonic()-started,3)}
(root/'evidence/conversion-control-v2-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status))
