#!/usr/bin/env python3
"""Future Python-only freeze; requires actual accepted/installed prerequisites."""
from pathlib import Path
import argparse,json
import controller as gate

p=argparse.ArgumentParser();p.add_argument('--reviewed-request',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
request=json.loads(a.reviewed_request.read_text())
assert request['status']=='REVIEWED_AFTER_ACTUAL_ACCEPTANCE_AND_INTEGRATION'and not a.output.exists()
gate.verify_receipts(request['actualPrerequisites']);gate.configure_additional(request)
env=gate.environment();assert gate.sha(gate.NODE)==gate.NODE_SHA256
assert gate.sha(gate.ROOT/'native/runtime.cc')==gate.RUNTIME_SOURCE
for version,expected in gate.RUNTIMES.items():
 folder=gate.ROOT/'native/build/linux-x64'/('node-'+version);meta=json.loads((folder/'runtime.node.json').read_text());assert gate.sha(folder/'runtime.node')==expected==meta['binarySHA256']and meta['sourceSHA256']==gate.RUNTIME_SOURCE
artifacts=list((gate.ROOT/'native/build/linux-x64').glob('node-*/*.node*'));assert len(artifacts)==18
assert not env.get('RED_PANDA_RUNTIME_ADDON')and not env.get('RED_PANDA_COLLECTIONS_ADDON')
assert json.loads((gate.ROOT/'package.json').read_text())['scripts']['test:protocol']==gate.PROTOCOL_SCRIPT
names=gate.test_files();assert names
spec={**request,'schema':'network-initial-installed-root-remaining-workflow/v1','status':'FROZEN_REVIEWED_ACCEPTED_INSTALLED_GRAPH','root':str(gate.ROOT),'controllerSHA256':gate.sha(Path(gate.__file__).resolve()),'collectorSHA256':gate.sha(Path(gate.__file__).parent/'full_source_collection.py'),'fullCurrentInputs':gate.snapshot(env),'testFiles':names,'tentativeStaticCollection':gate.collect(gate.ROOT,names),'nativeArtifactsSHA256':{str(f.relative_to(gate.ROOT)):gate.sha(f)for f in artifacts},'runtimeSourceSHA256':gate.RUNTIME_SOURCE,'reviewedRequestSHA256':gate.sha(a.reviewed_request),'freezeMeaning':'Static hashing only; remaining four stages UNRUN. Actual installed full-JS pass required; no old129/13 equality or full-JS repeat.'}
gate.verify_spec(spec,env);a.output.write_text(json.dumps(spec,indent=2)+'\n');print(json.dumps({'output':str(a.output),'SHA256':gate.sha(a.output),'inputCount':len(spec['fullCurrentInputs']),'testFiles':len(names),'tentativeLexicalSites':spec['tentativeStaticCollection']['tentativeSiteCount'],'actualTAPUnrun':True}))
