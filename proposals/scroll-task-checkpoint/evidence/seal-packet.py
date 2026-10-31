from pathlib import Path
import json,hashlib,shutil,difflib,subprocess
p=Path.cwd();v=p/'scroll-checkpoint';target=Path('/workspace/red-panda/proposals/scroll-task-checkpoint');assert not target.exists()
sha=lambda f:hashlib.sha256(f.read_bytes()).hexdigest()
rows=json.loads((p/'evidence/focused-final-status.json').read_text());assert len(rows)==3 and all(row['exit']==0 for row in rows)
source=json.loads((p/'evidence/focused-final-manifest.json').read_text());assert all(sha(v/n)==h for n,h in source.items())
leaves=['src/scroll-events.js','test/scroll-task-checkpoint.test.js','docs/reference/scroll-task-checkpoint/profiles.json','docs/reference/scroll-task-checkpoint/native-profiles.json'];target.mkdir()
patch=[];manifest={}
for name in leaves:
 f=v/name;out=target/'candidate'/name;out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,out);before=Path('/workspace/red-panda')/name;baseline=before.read_text() if before.exists() else ''
 patch.extend(difflib.unified_diff(baseline.splitlines(True),f.read_text().splitlines(True),fromfile='a/'+name if before.exists() else '/dev/null',tofile='b/'+name))
 manifest[name]={'before':sha(before) if before.exists() else None,'after':sha(f)}
(target/'integration.patch').write_text(''.join(patch))
(target/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
shutil.copytree(p/'evidence',target/'evidence')
readme='''# Scroll tasks retain the positive timer checkpoint

Positive Window timers now queue a genuine Host Immediate after their native deadline. Scroll-event delivery still ran directly from Host timer callbacks. When both10ms and20ms deadlines became overdue together, raw scrollend could overtake the authored10ms pause continuation, ending a cohort before a genuine subsequent scroll.

The causal comparison uses the exact current Root graph, Native, and a counterfactual that changes only Window timers back to original104. All three quietly pass the unchanged scroll-events-first expression. A separate held-out35ms overdue-registration control produces first4/after8 events only on the current graph; Native and original-timer counterfactual retain first2/after6. The separate dispatch-overdue control matches on all three and is not claimed as a reproduction. Raw actual results are retained.

The narrow runtime change sends real scroll-event deadlines through the same captured Host Immediate checkpoint. It retains10/20ms native delays, genuine Event creation/dispatch, private per-Document state and existing coalescing. The owner tracks native timers and queued Immediate handles separately and cancels both on disposal. No fixture branches, extra delay, public timer replacement, Native import, golden change or deadline increase occurs.

The final seven-file matrix passes60/60 on each exact Node24.22.1,24.19.0 and26.13.0. It includes unchanged viewport15 controls, layout11, Window lifecycle12, positive Window tasks5, resize9, frame integration3 and new5 controls (counts are also recorded in actual logs). New held-out controls compare actual Native output. Actual document abort, Page.close and replacement navigation occur after real due scroll deadlines have queued their callbacks; fixtures assert nonzero scroll state before cancellation, and new-document events remain active. Full542 own-input and6579 shared-dependency guards are unchanged.

The initial focused epoch is rejected and retained:58/60 on each SDK. The copied scratch omitted an existing geometry-sizing reference; the first new navigation fixture also had no scrollable extent and incorrectly expected a nonzero scroll event. Window cancellation half-controls were correspondingly weak. Only these owned fixture extents/assertions and the exact missing reference copy were corrected; runtime, original golden expressions, waits and deadlines stayed unchanged. Initial manifests/tests/logs remain in evidence/initial-focused-epoch and original focused logs.

This packet does not claim a new full-suite run, universal browser task ordering or elapsed-time parity. Root performs composed validation. All runtime work ran in the explicitly leased isolated copy; no Root production source/test was edited.
'''
(target/'README.md').write_text(readme)
result=subprocess.run(['git','apply','--check',str(target/'integration.patch')],cwd='/workspace/red-panda',capture_output=True,text=True);(target/'apply-check.json').write_text(json.dumps({'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr},indent=2)+'\n');assert result.returncode==0
files={str(f.relative_to(target)):sha(f) for f in sorted(target.rglob('*')) if f.is_file()};(target/'package-manifest.json').write_text(json.dumps(files,indent=2)+'\n')
print(json.dumps({'path':str(target),'patchSHA256':sha(target/'integration.patch'),'sourceManifestSHA256':sha(target/'source-manifest.json'),'packageManifestSHA256':sha(target/'package-manifest.json'),'leaves':leaves,'inputs':len(files)}))
