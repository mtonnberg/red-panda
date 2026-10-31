#!/usr/bin/env python3
# UNRUN until Parent grants this exact independent readiness gate.
from pathlib import Path
import hashlib,json,os,signal,subprocess,time,sys
root=Path(__file__).resolve().parents[1];out=root/'evidence/first';out.mkdir(exist_ok=False)
node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node');fixture=Path('/workspace/shared/registration455-adapted-plan-20261031/fixtures/adapted');env=os.environ.copy();env['PROBE_EPOCH']='first'
paths=list((root/'src').glob('*.js'))+list((root/'native').rglob('*.cc'))+list((root/'native/build').rglob('*.node'))+list((root/'native/build').rglob('*.json'))+list((root/'helpers').glob('*'))+list((root/'test').glob('*.js'))+[node,root/'red-panda-launcher',root/'package.json',root/'package-lock.json',fixture/'testing.js',fixture/'domimplementation.html',root/'node_modules/jsdom/lib/jsdom/living/nodes/DOMImplementation-impl.js',root/'node_modules/jsdom/lib/jsdom/living/nodes/Document-impl.js']
frozen=Path('/workspace/shared/registration455-adapted-plan-20261031')
paths += [root/'scripts/reference-server.mjs',frozen/'candidate/scripts/reference-server.mjs',frozen/'candidate/test/cdp-client.js']+list((frozen/'harness/scripts').glob('*.mjs'))
paths=[p for p in paths if p.is_file()]
def guard():return{str(p):hashlib.sha256(p.read_bytes()).hexdigest()for p in paths}
record={'kind':'independent-createHTMLDocument-readiness-first','before':guard(),'stages':[],'basis':'frozen Native Doc8 actual observations; no custom Node/module patch dependency'};start=time.monotonic();status='started'
stages=[('syntax',[str(node),'--check','src/document-xml.js']),('new-three',[str(node),'--experimental-vm-modules','--test','--test-concurrency=1','test/domimplementation-readiness.test.js']),('candidate-eight',[str(node),'helpers/probe.mjs','candidate']),('source-fixture',[str(node),'helpers/source-fixture.mjs'])]
try:
 for name,cmd in stages:
  child=None
  try:
   with(out/(name+'.stdout')).open('wb')as stdout,(out/(name+'.stderr')).open('wb')as stderr:
    child=subprocess.Popen(cmd,cwd=root,env=env,stdout=stdout,stderr=stderr,start_new_session=True)
    try:code=child.wait(timeout=max(1,40-(time.monotonic()-start)))
    except subprocess.TimeoutExpired:
     os.killpg(child.pid,signal.SIGTERM)
     try:child.wait(timeout=2)
     except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
     raise
   row={'name':name,'command':cmd,'exitCode':code}
   if code==0 and name=='candidate-eight':
    raw=json.loads((root/'runs/first/candidate.json').read_text());rows={x['name']:x for x in raw['evaluation']['result']['value']['rows']};created=rows['factory-readiness']['value'][:4];life=rows['factory-lifecycle']['value'];ok=all(x['value']['state']=='complete' for x in created)and all(life[x]['state']=='complete'for x in ['immediate','microtask','later'])and life['events']==[];row['boundedReadinessAcceptance']=ok
    if not ok:code=1
    row['otherNamedAndParserGaps']='raw retained; not promoted'
   if code==0 and name=='source-fixture':
    raw=json.loads((out/'source-fixture.json').read_text());ok=raw['status']=='source-asserted';row['actualSourceAcceptance']=ok
    if not ok:code=1
   record['stages'].append(row);print(json.dumps(row),flush=True)
   if code:status='stopped-first-failure';break
  finally:
   if child and child.poll()is None:os.killpg(child.pid,signal.SIGKILL);child.wait()
 else:status='bounded-readiness-and-source-passed'
except Exception as e:record['controllerError']=repr(e);status='controller-failure'
finally:
 record.update(status=status,after=guard(),durationSec=time.monotonic()-start);record['stable']=record['before']==record['after'];(out/'report.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'status':status,'stable':record['stable'],'durationSec':record['durationSec']}));sys.exit(0 if status=='bounded-readiness-and-source-passed'and record['stable']else 1)
