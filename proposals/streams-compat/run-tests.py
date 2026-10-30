#!/usr/bin/env python3
from pathlib import Path
import subprocess,json,time,hashlib
root=Path(__file__).resolve().parents[2]
for version,node in [('24','/workspace/shared/rea-tools/node_modules/node/bin/node'),('26','/workspace/shared/node26/node_modules/node/bin/node')]:
 started=time.monotonic()
 try:
  p=subprocess.run(['bash','experiments/heap-query/run-probe.sh',node,'--test','--test-timeout=10000','.cache/streams-broader-candidate/test/streams.test.js','.cache/streams-broader-candidate/test/streams-proposal.test.js'],cwd=root,capture_output=True,text=True,timeout=20)
  report={'node':node,'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr}
 except subprocess.TimeoutExpired as e:report={'node':node,'timeout':True,'stdout':str(e.stdout),'stderr':str(e.stderr)}
 report['elapsedSeconds']=round(time.monotonic()-started,3);report['manifestSHA256']=hashlib.sha256((root/'proposals/streams-compat/frozen-source-manifest.json').read_bytes()).hexdigest()
 (root/f'docs/reference/streams-broader-proposal-tests-node{version}.json').write_text(json.dumps(report,indent=2)+'\n')
 print(version,report.get('exitCode','timeout'),report['stdout'],report['stderr'],flush=True)
 if report.get('exitCode',0)<0:break
