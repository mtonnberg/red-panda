from pathlib import Path
import hashlib,json,os,signal,subprocess,time

scratch=Path(__file__).resolve().parent.parent
root=Path('/workspace/red-panda')
node='/workspace/shared/rea-tools/node_modules/node/bin/node'
fixture=root/'.cache/lightpanda-reference/browser-948d773786/src/browser/tests'
native=Path('/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux')
mapping=root/'proposals/fixture-routes/evidence/registration-map.json'
output=scratch/'evidence'
env=dict(os.environ,NODE_USE_ENV_PROXY='1')
prior=','.join(filter(None,[env.get('NO_PROXY',''),env.get('no_proxy','')]))
aliases='0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]'
env.update({key:','.join(filter(None,[prior,aliases])) for key in ['NO_PROXY','no_proxy']})
env['PATH']=str(Path(node).parent)+':'+env.get('PATH','')
started=time.monotonic();rows=[]
paths=sorted(set([p for tree in [scratch/'src',scratch/'native',scratch/'bin',scratch/'helpers',scratch/'test',root/'scripts',root/'test',root/'node_modules',fixture] for p in tree.rglob('*') if p.is_file() and '__pycache__' not in p.parts]+[scratch/'package.json',scratch/'package-lock.json',mapping,native,Path(node)]))
def snapshot(): return {str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
before=snapshot();(output/'source-location-before.json').write_text(json.dumps(before,indent=2)+'\n')
assert before[str(native)]=='9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f'
assert before[str(mapping)]=='066ad73e170657f43d79ca4f35b0741c18cec15dbed44bb1dba0518bf400c9b8'
assert before[str(fixture/'testing.js')]=='23e2ebbd851e64a68b1e357a38ed2e6d5d5f72217cb2e14671c4d3eecf6c861b'
for label,binary in [('native',native),('candidate',scratch/'bin/red-panda.js')]:
    command=[node,str(root/'scripts/conformance.mjs'),'--root',str(fixture),'--binary',str(binary),'--isolate','--fixture-profile','upstream','--source-load-contract','--websocket-port','9584','--registration-map',str(mapping),'--port','9582','--test','window/location.html','--report',str(output/('source-location-'+label+'.json'))]
    with (output/('source-location-'+label+'.log')).open('x') as log:
        process=subprocess.Popen(command,cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        try: code=process.wait(timeout=max(1,18-(time.monotonic()-started)))
        except BaseException:
            os.killpg(process.pid,signal.SIGTERM)
            try: process.wait(timeout=0.5)
            except subprocess.TimeoutExpired: os.killpg(process.pid,signal.SIGKILL);process.wait()
            raise
    report=json.loads((output/('source-location-'+label+'.json')).read_text())
    rows.append({'label':label,'command':command,'exit':code,'counts':report['counts'],'elapsedSeconds':round(time.monotonic()-started,3)})
    print(json.dumps(rows[-1]),flush=True)
after=snapshot();(output/'source-location-after.json').write_text(json.dumps(after,indent=2)+'\n')
status={'rows':rows,'inputs':len(before),'unchanged':before==after,'changed':[p for p in set(before)|set(after) if before.get(p)!=after.get(p)],'elapsedSeconds':round(time.monotonic()-started,3)}
(output/'source-location-status.json').write_text(json.dumps(status,indent=2)+'\n')
print(json.dumps(status),flush=True)
