"""Minimal future installed655 derivative of actual652 live/check helpers."""
from pathlib import Path
import argparse,hashlib,importlib.util,json,os,re,subprocess,time,urllib.request
ROOT=Path('/workspace/red-panda');BASE=Path(__file__).resolve().parent
FULL=ROOT/'.cache/validation/feature41-full/controller.py'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
def run(kind):
 p=argparse.ArgumentParser();p.add_argument('--epoch',required=True);p.add_argument('--source-inputs',required=True);p.add_argument('--source-inputs-sha256',required=True);p.add_argument('--source-map-key',required=True);p.add_argument('--service-inputs',required=True);p.add_argument('--service-inputs-sha256',required=True);p.add_argument('--optional-standalone-check',action='store_true');a=p.parse_args()
 assert re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*',a.epoch)
 assert kind!='check'or a.optional_standalone_check,'Optional skeleton only; do not duplicate retirement full syntax180'
 source_file=Path(a.source_inputs).resolve(strict=True);service_file=Path(a.service_inputs).resolve(strict=True)
 assert sha(source_file)==a.source_inputs_sha256 and sha(service_file)==a.service_inputs_sha256
 expected=json.loads(source_file.read_text())[a.source_map_key];assert len(expected)==655 and all(isinstance(k,str)and re.fullmatch('[a-f0-9]{64}',v)for k,v in expected.items())
 def exact_source():
  actual={str(f.relative_to(ROOT)):sha(f)for folder in ['src','test','native','bin','scripts']for f in(ROOT/folder).rglob('*')if f.is_file()and'__pycache__'not in f.parts};actual.update({n:sha(ROOT/n)for n in ['package.json','package-lock.json']});return actual==expected
 assert exact_source(),'Future actual installed655 source is required; no current652/oldPID fallback'
 assert sum(n.startswith('native/build/')for n in expected)==18
 assert sha(ROOT/'docs/reference/audio-past-time/controls.mjs')=='97566cd6a3e2dd21bbcb7ab1ef742f216ce3830c35375c787e223cbe5706df96'
 assert sha(FULL)=='33bce83408ee97992b10a0d20c5418ce8decf93434d911af4d7820cc382a4873'
 spec=importlib.util.spec_from_file_location('frozen_full_helpers',FULL);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 facts=json.loads(service_file.read_text());assert facts['sourceInputsSHA256']==a.source_inputs_sha256 and facts['launcherWorkdir']==str(ROOT)and'TTY'in facts
 expected_service=facts['process'];service=m.identity(expected_service['pid']);assert service
 for k in ['pid','startTicks','pgrp','sid']:assert service[k]==expected_service[k],('Future service identity changed',k)
 assert (Path('/proc')/str(service['pid'])).stat().st_uid==os.geteuid()
 assert (Path('/proc')/str(service['pid'])/'cmdline').read_bytes()==b'\0'.join(v.encode()for v in facts['argv'])+b'\0'
 output=BASE/'receipts'/a.epoch;output.mkdir(parents=True,exist_ok=False)
 record={'kind':kind,'sourceEpoch':'Actual required installedRoot655; future service identity required, no guessedTTY/PID','sourceInputs':{'path':str(source_file),'sha256':sha(source_file),'key':a.source_map_key},'serviceInputs':{'path':str(service_file),'sha256':sha(service_file)},'service':facts,'capSeconds':90,'runtimeState':'Actual source bytes, GitHEAD metadata is not byte authority','parentWorkflow':'Optional check superseded when retirement fullsyntax180 executes; no automatic duplicate'}
 try:
  record['procCwd']=str((Path('/proc')/str(service['pid'])/'cwd').readlink());assert Path(record['procCwd']).resolve()==ROOT.resolve()
 except OSError as error:record['procCwd']={'notIndependentlyReadable':str(error),'launcherAttestation':facts['launcherWorkdir']}
 record['launcherGitHEAD']=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
 record['health']=json.load(urllib.request.build_opener(urllib.request.ProxyHandler({})).open('http://127.0.0.1:9222/health',timeout=5));assert record['health']['status']=='ok'
 env=m.environment();before=m.snapshot(env);before.update({str(source_file):sha(source_file),str(service_file):sha(service_file),str(FULL):sha(FULL),str(Path(__file__)):sha(__file__)})
 (output/'inputs-before.json').write_text(json.dumps(before,indent=2)+'\n');child=None;owned={};command=['npm','run','example:puppeteer'if kind=='live'else'check'];record['command']=command
 try:
  with(output/('example.log'if kind=='live'else'check.log')).open('xb')as log:
   started=time.monotonic();child=subprocess.Popen(command,cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT,stdin=subprocess.DEVNULL,start_new_session=True,preexec_fn=m.no_core);leader=child.pid;initial=m.identity(leader);assert initial and initial['pgrp']==leader and initial['sid']==leader and leader!=service['pid'];owned[(leader,initial['startTicks'])]=initial;record['initialIdentity']=initial
   while child.poll()is None and time.monotonic()-started<90:
    for row in m.members(leader):assert row['pid']!=service['pid'];owned[(row['pid'],row['startTicks'])]=row
    time.sleep(.05)
   record['ownedBeforeCleanup']=m.observed_remainder(leader,owned);assert all(row['pid']!=service['pid']for row in record['ownedBeforeCleanup']);record['ownedAfterCleanup']=m.cleanup(leader,owned);record['exit']=child.wait(timeout=5);record['seconds']=time.monotonic()-started
 finally:
  if child is not None and child.poll()is None:m.cleanup(child.pid,owned)
  after=m.snapshot(env);after.update({str(source_file):sha(source_file),str(service_file):sha(service_file),str(FULL):sha(FULL),str(Path(__file__)):sha(__file__)});(output/'inputs-after.json').write_text(json.dumps(after,indent=2)+'\n')
  record.update(inputsUnchanged=before==after,inputs=len(before),source655Exact=exact_source(),serviceSameStart=(m.identity(service['pid'])or{}).get('startTicks')==service['startTicks']);(output/'status.json').write_text(json.dumps(record,indent=2)+'\n');print(json.dumps(record),flush=True)
 assert record['exit']==0 and record['seconds']<90 and record['inputsUnchanged']and record['source655Exact']and record['serviceSameStart']and not m.live(record['ownedBeforeCleanup']+record['ownedAfterCleanup'])
