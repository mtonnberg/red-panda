"""Future freeze of real approved Root645 bytes. Static preparation, never auto-run."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import tarfile
import io

r=Path(__file__).resolve().parent
root=Path('/workspace/red-panda')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--production-ref',required=True);parser.add_argument('--root-full-receipt',required=True);parser.add_argument('--provider-provenance',required=True);args=parser.parse_args()
    production='917f9bdd1192d917de9c5caf4c54ca90619daf20'
    assert args.production_ref==production,'Only reviewed pushed production917 identity is authorized by this derivative'
    commit=subprocess.check_output(['git','-C',str(root),'rev-parse',args.production_ref+'^{commit}'],text=True).strip();assert commit==production
    full=Path(args.root_full_receipt).resolve(strict=True);provider=Path(args.provider_provenance).resolve(strict=True)
    assert sha(full)=='9d2aa1d743c4999033fcef559faa845f785af68703e0fd91fc6dd1493e028c21'
    actual_full=json.loads(full.read_text());assert actual_full['status']=='PASS'and actual_full['inputsUnchanged']and not actual_full['futureStages']
    assert [row['name']for row in actual_full['stages']]==['protocol','purescript','reference','syntax','strict']
    assert all(row['status']=='PASSED'and row['exit']==0 and row['inputsUnchanged']for row in actual_full['stages'])
    for row in actual_full['stages']:assert sha(Path(row['rawLog']['path']))==row['rawLog']['sha256']
    stable=json.loads((full.parent/'source-stable.json').read_text());assert stable['unchanged']and stable['inputs']==13174
    assert sha(provider)=='431bb0cade72adb8c95806920d29b4ec9ce7dc36220eebb033cfa86464ac955f'
    negative=json.loads(provider.read_text());assert negative['status']=='STOPPED_FIRST_NONZERO_TIMEOUT_OR_MISSING_OBSERVATION'and len(negative['unrunStages'])==10
    assert [row['name']for row in negative['stages']]==['identity','collision','proxy-reservations']
    assert negative['stages'][2]['administrativeTimeout']and negative['stages'][2]['returnCode']==-15
    # Experimental provider failure is retained provenance, never a PASS requirement.
    gate_paths=[full,provider]
    pins=json.loads((r/'reference/epoch-pins.json').read_text())
    assert sha(r/'reference/application-journal.json')==pins['applicationJournalSHA256']=='149951e87259b49815fa2d2f341c786e38dc4d6ad37a6c89829f167b5d3ed3c0'
    expected=pins['rootAfter645'];assert len(expected)==645
    before={name:sha(root/name)for name in expected};assert before==expected,'Approved actual Root645 changed; new derivative required, no oldHEAD fallback'
    committed=subprocess.check_output(['git','-C',str(root),'archive',production,'src','test','native','bin','scripts','package.json','package-lock.json'])
    with tarfile.open(fileobj=io.BytesIO(committed),mode='r:')as source_archive:
        tracked={member.name:hashlib.sha256(source_archive.extractfile(member).read()).hexdigest()for member in source_archive.getmembers()if member.isfile()}
    assert all(tracked.get(name)==digest for name,digest in expected.items()if not name.startswith('native/build/')),'Pushed917 tracked source differs from approved Root645'
    extra_roots=['node_modules','docs/reference','oracle','helpers','automation/src','automation/test','automation/.spago/p']
    extra_before={str(p):sha(p)for folder in extra_roots for p in(root/folder).rglob('*')if p.is_file()and'__pycache__'not in p.parts and'.git'not in p.parts}
    candidate=r/'candidate';assert not candidate.exists(),'Never mutate frozen/partial candidate; failed freezes remain separate'
    node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node')
    assert sha(node)=='e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb','Production stockNode24 bytes changed; custom provider is not the census runtime'
    candidate.mkdir()
    for relative in expected:
        target=candidate/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(root/relative,target)
        assert sha(target)==expected[relative]
    artifacts={}
    for manifest in sorted((candidate/'native/build').rglob('*.node.json')):
        data=json.loads(manifest.read_text());binary=manifest.with_suffix('');stem=binary.name.removesuffix('.node')
        source={'runtime':'runtime.cc','heap-query':'heap-query.cc','collections':'collections.cc'}[stem]
        assert sha(candidate/'native'/source)==data['sourceSHA256']
        assert sha(binary)==data['binarySHA256']
        for file in [binary,manifest]:artifacts[str(file.relative_to(candidate))]=sha(file)
    assert len(artifacts)==18
    shutil.copytree(root/'node_modules',candidate/'node_modules',symlinks=False,ignore=shutil.ignore_patterns('.git'))
    launcher=candidate/'red-panda-launcher';launcher.write_text('#!/bin/sh\nexec '+shlex.quote(str(node))+' --experimental-vm-modules '+shlex.quote(str(candidate/'bin/red-panda.js'))+' "$@"\n');launcher.chmod(0o755)
    (candidate/'.source-epoch').write_text('Actual RootAfter645 application journal '+pins['applicationJournalSHA256']+'\n')
    (r/'harness/node_modules').symlink_to(candidate/'node_modules',target_is_directory=True)
    gate_receipts={str(p):sha(p)for p in gate_paths}
    (r/'controls/gate-receipts.json').write_text(json.dumps({'productionFullPASS':{'path':str(full),'sha256':sha(full)},'experimentalProviderNonacceptanceProvenanceOnly':{'path':str(provider),'sha256':sha(provider),'acceptance':'NOT_PASSED; remaining10stagesUNRUN; never required successful for stock production census'},'meaning':'ProductionfullPASS is required. Experimental provider failure remains explicit independent work and is never promoted to acceptance.'},indent=2)+'\n')
    branding={}
    for name in ['src/browser.js','src/navigator.js','package.json']:
        file=candidate/name;branding[name]={'SHA256':sha(file),'sourceLines':[{'line':i+1,'text':line}for i,line in enumerate(file.read_text().splitlines())if 'this.userAgent = browser.options.userAgent'in line or "brand: 'RedPanda'"in line or '"version"'in line]}
    (r/'controls/current-production-branding-source.json').write_text(json.dumps({'kind':'STATIC actual approved Root645 source, no runtime observation','sources':branding,'publicUAOverrideAppliedByRunner':False},indent=2)+'\n')
    plan=json.loads((r/'plan.json').read_text());registration=json.loads((r/'maps/registration-map.json').read_text());source_root=Path(registration['sourceRoot'])
    pinned={name:sha(source_root/name)for name in sorted(set(registration['sourceSHA256'])|{'src/browser/Runner.zig'})}
    for name,wanted in registration['sourceSHA256'].items():assert pinned[name]==wanted
    for fixture in registration['fixtures']:assert sha(r/'fixtures/adapted'/fixture['path'])==fixture['sha256']
    files={p for folder in [candidate,r/'harness',r/'fixtures',r/'maps',r/'controls',r/'reference',r/'historical']for p in folder.rglob('*')if p.is_file()and'__pycache__'not in p.parts}
    files.update([r/name for name in ['plan.json','freeze-candidate.py','run-census-stop-setup.py','orchestration.py','census-controller-stop-policy.json']]);files.add(node);files.update(gate_paths);files.update(root/name for name in expected)
    files.update(p for p in full.parent.rglob('*')if p.is_file())
    files.update(p for p in provider.parent.iterdir()if p.is_file()and(p.suffix=='.log'or p.name=='report.json'))
    files.update(Path(p)for p in extra_before)
    graph={str(p):sha(p)for p in sorted(files)}
    after={name:sha(root/name)for name in expected};assert before==after
    extra_after={str(p):sha(p)for folder in extra_roots for p in(root/folder).rglob('*')if p.is_file()and'__pycache__'not in p.parts and'.git'not in p.parts}
    assert extra_before==extra_after,'Actual Rootdependency/oracle/PS support bytes changed while exporting'
    manifest={'schemaVersion':3,'snapshotKind':'Immutable noGit byte-copy of actual approved RootAfter645 plus exact historical adapted455 external harness','productionCommit':production,'productionAppByteAuthority':'Actual approved Root645 and18 artifacts copied; tracked source separately compared to pushed917. Applicationjournal149951 remains byte authority; no olderHEAD export.','node':{'path':str(node),'SHA256':sha(node),'versionExpected':'24.22.1; runtime check remains original'},'launcher':{'path':str(launcher),'SHA256':sha(launcher)},'nativeArtifacts':artifacts,'graphSHA256':graph,'pinnedContractSourceSHA256':pinned,'registrationMapSHA256':sha(r/'maps/registration-map.json'),'root645SHA256':expected,'rootBeforeAfterUnchanged':before==after,'productionFullPASSReceipt':{'path':str(full),'sha256':sha(full)},'experimentalProviderNegativeProvenanceOnly':{'path':str(provider),'sha256':sha(provider),'acceptance':'NOT_PASSED','remainingUnrun':10},'plannedRows':455,'concurrency':1,'publicBranding':'Actual RedPanda UA/clientHints; no product overrides or changed assertions','runtimeStatus':'UNRUN; staticcopy/hash only; future explicit long runtime lease required'}
    (r/'candidate-frozen.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'RootInputs':len(expected),'graphInputs':len(graph),'artifacts':len(artifacts),'runtimeStatus':'UNRUN'}))

if __name__=='__main__':main()
