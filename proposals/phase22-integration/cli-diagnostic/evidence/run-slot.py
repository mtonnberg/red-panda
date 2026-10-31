from pathlib import Path
import hashlib,json,os,subprocess,time
root=Path(__file__).resolve().parent.parent;graph=root/'captured-graph';e=root/'evidence';node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');capture=json.loads((e/'capture.json').read_text());sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def guard():
 result={name:sha(graph/name)for name in capture['copiedSHA256']}
 for p in sorted((graph/'native').rglob('*')):
  if p.is_file():result['native/'+str(p.relative_to(graph/'native'))]=sha(p)
 for name in ['test/cli-transports-diagnostic.test.js']:result[name]=sha(graph/name)
 for name in ['evidence/run-slot.py','evidence/capture.json']:result[name]=sha(root/name)
 result['driverNode']=sha(node);return result
start=time.monotonic();before=guard();(e/'slot-before.json').write_text(json.dumps(before,indent=2)+'\n');assert all(before[name]==value for name,value in capture['copiedSHA256'].items())
cmd=[str(node),'--experimental-vm-modules','--test','--test-concurrency=1','--test-name-pattern=saved-script CLI','test/cli-transports-diagnostic.test.js'];environment={**os.environ,'PATH':str(node.parent)+':'+os.environ['PATH'],'CLI_DIAGNOSTIC_OUTPUT':str(e/'subcommand-phases-initial.json')}
r=subprocess.run(cmd,cwd=graph,env=environment,capture_output=True);(e/'slot.stdout').write_bytes(r.stdout);(e/'slot.stderr').write_bytes(r.stderr);after=guard();(e/'slot-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'command':cmd,'exit':r.returncode,'seconds':time.monotonic()-start,'inputs':len(before),'stable':before==after,'boundary':'Saved-script test only (3 original local child invocations); other4tests are filtered, not claimed passing. Original15000ms childdeadline/stdin/assertions/childspawnargs are unchanged. Actual complete pipes/exit/deadline live in raw subcommand phases.'};(e/'slot-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if before==after and r.returncode==0 else 1)
