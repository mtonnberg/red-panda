from pathlib import Path
import json,hashlib,subprocess,time,os,signal
root=Path.cwd();out=root/'.cache/validation/phase20'/os.environ.get('PHASE20_LABEL','focused');out.mkdir(exist_ok=False);roots=['src','test','native','bin','scripts','automation/src','automation/test','docs/reference','node_modules','proposals/shared-worker','proposals/eventsource','proposals/websocket-quota','proposals/css-layout','proposals/audio-core','proposals/web-crypto','proposals/urlpattern','proposals/text-encoder','proposals/document-write','proposals/images','proposals/payment-request','proposals/window-open','.cache/lightpanda-reference/browser-948d773786/src/browser/tests']
def snap():
 paths=[p for name in roots for p in(root/name).rglob('*')if p.is_file()and'__pycache__'not in p.parts]+[root/'package.json',root/'package-lock.json',root/'automation/spago.yaml',root/'automation/spago.lock',root/'.cache/validation/phase20/run-sdk.py']
 return{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest()for p in sorted(set(paths))}

before=snap();(out/'focused-source-before.json').write_text(json.dumps(before,indent=2)+'\n');files=['test/shared-worker-transports.test.js', 'test/shared-workers.test.js', 'test/wasm-streaming.test.js', 'test/worker-document-response.test.js', 'test/request-metadata.test.js', 'test/fetch-redirect-taint.test.js', 'test/worker-blob-urls.test.js'];command=[os.environ.get('PHASE20_NODE','node'),'--experimental-vm-modules','--test','--test-concurrency=1',*files];start=time.monotonic();timedOut=False
with(out/'focused.log').open('w')as f:
 p=subprocess.Popen(command,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
 try:p.wait(timeout=300)
 except subprocess.TimeoutExpired:
  timedOut=True;os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
after=snap();(out/'focused-source-after.json').write_text(json.dumps(after,indent=2)+'\n');status={'command':command,'exit':p.returncode,'seconds':time.monotonic()-start,'timedOut':timedOut,'unchanged':before==after,'inputs':len(before),'changed':[p for p in set(before)|set(after)if before.get(p)!=after.get(p)]};(out/'focused-status.json').write_text(json.dumps(status,indent=2)+'\n');print(json.dumps(status));raise SystemExit(0 if p.returncode==0 and not timedOut and before==after else 1)
