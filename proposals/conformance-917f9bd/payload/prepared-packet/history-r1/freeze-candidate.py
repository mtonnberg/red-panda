"""Future freeze of real approved Root645 bytes. Static preparation, never auto-run."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shlex
import shutil

r=Path(__file__).resolve().parent
root=Path('/workspace/red-panda')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--gate-receipt',action='append',required=True);args=parser.parse_args()
    assert len(args.gate_receipt)>=2,'Record actual fullworkflow and provider acceptance receipts, reviewed by Root; do not invent successful status'
    gate_paths=[Path(p).resolve(strict=True)for p in args.gate_receipt]
    pins=json.loads((r/'reference/epoch-pins.json').read_text())
    assert sha(r/'reference/application-journal.json')==pins['applicationJournalSHA256']=='149951e87259b49815fa2d2f341c786e38dc4d6ad37a6c89829f167b5d3ed3c0'
    expected=pins['rootAfter645'];assert len(expected)==645
    before={name:sha(root/name)for name in expected};assert before==expected,'Approved actual Root645 changed; new derivative required, no oldHEAD fallback'
    extra_roots=['node_modules','docs/reference','oracle','helpers','automation/src','automation/test','automation/.spago/p']
    extra_before={str(p):sha(p)for folder in extra_roots for p in(root/folder).rglob('*')if p.is_file()and'__pycache__'not in p.parts and'.git'not in p.parts}
    candidate=r/'candidate';assert not candidate.exists(),'Never mutate frozen/partial candidate; failed freezes remain separate'
    node=Path('/workspace/shared/rea-tools/node_modules/node/bin/node')
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
    (r/'controls/gate-receipts.json').write_text(json.dumps({'receipts':gate_receipts,'meaning':'Exact declared gate bytes only; Root must review actual successful fullworkflow/provider outcomes before lease. Receipt presence alone is not acceptance.'},indent=2)+'\n')
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
    files.update(Path(p)for p in extra_before)
    graph={str(p):sha(p)for p in sorted(files)}
    after={name:sha(root/name)for name in expected};assert before==after
    extra_after={str(p):sha(p)for folder in extra_roots for p in(root/folder).rglob('*')if p.is_file()and'__pycache__'not in p.parts and'.git'not in p.parts}
    assert extra_before==extra_after,'Actual Rootdependency/oracle/PS support bytes changed while exporting'
    manifest={'schemaVersion':2,'snapshotKind':'Immutable noGit byte-copy of actual approved RootAfter645 plus exact historical adapted455 external harness','productionCommit':'ACTUAL_WORKTREE_ROOT645_APPLICATION_'+pins['applicationJournalSHA256'],'productionAppByteAuthority':'Exact Root645 and18 artifacts; not gitHEAD. Historical parent commit preserved in application journal.','node':{'path':str(node),'SHA256':sha(node),'versionExpected':'24.22.1; runtime check remains original'},'launcher':{'path':str(launcher),'SHA256':sha(launcher)},'nativeArtifacts':artifacts,'graphSHA256':graph,'pinnedContractSourceSHA256':pinned,'registrationMapSHA256':sha(r/'maps/registration-map.json'),'root645SHA256':expected,'rootBeforeAfterUnchanged':before==after,'gateReceipts':gate_receipts,'plannedRows':455,'concurrency':1,'publicBranding':'Actual RedPanda UA/clientHints; no product overrides or changed assertions','runtimeStatus':'UNRUN; staticcopy/hash only; future explicit long runtime lease required'}
    (r/'candidate-frozen.json').write_text(json.dumps(manifest,indent=2)+'\n');print(json.dumps({'RootInputs':len(expected),'graphInputs':len(graph),'artifacts':len(artifacts),'runtimeStatus':'UNRUN'}))

if __name__=='__main__':main()
