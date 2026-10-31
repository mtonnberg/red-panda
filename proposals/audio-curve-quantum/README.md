# Frozen independent curve quantum/current-value followup

NEXT SLICE ONLY. Root's full checkpoint is frozen; this patch has not been applied.
Event interface realm v2 remains independent and is not required here.

Patch SHA256:
`d3e9f2a04a7a1293c7c63145bd8a70377acfe8e1874020091a4e038a42d499c8`.
Audio-core base/result SHA256:
`c75aa0006433c7821bb55da0a613d8d546afe9e34b2352f7e6d6fd8e62009a12`
→`eabe3d5108edca694e186ef72d7ab385a47da10cbfec06aefa964db90b234b3e`.

15 paths: narrow audio body/state changes, strengthened existing timeline test,
new exact-control test and Native contract docs. `git apply --check` passes frozen
Root without mutating it. No Root runtime/test/docs/reference files were edited.

Causal result:

The original curve-readd sample discrepancy was unrelated to cancel or overlap
failure.24 actual Native controls proved a sole future-start curve may use the
quantum-start value throughout a128-frame block. Adding a second earlier/later
event enables per-sample processing. Boundary starts, spanning curves, explicit
k-rate and read/no-read variants distinguish the real algorithm. The existing
measured sampleAccurateParam helper now controls gain and offset processing too.
All samples continue through genuine paramValue/timeline/DSP; no vector replay,
case-name branch or artificial silence is used.

Further38 Native controls proved .value is the last actual intrinsic value
computed by the audio kernel. It is not timeline reevaluation at currentTime.
The scalar cache belongs to existing Host parameter records. Gain caches when
actually pulled (even silent input), not when disconnected. Started constant
sources process parameters even disconnected; no-start/future-start/zero interval
retain intrinsic state. A partial/stopped active interval calculates the whole
parameter quantum, then masks only actual audio output. The intrinsic cache
excludes modulation. Scheduling/cancel/hold alone preserve it; direct.value
updates it before a subsequent overlap error, matching actual Native mutation.

Validation completed during Root freeze:

-62/62 new actual Native rows match exactly:24 quantum rendering,12 partial/value,
  8 processing/setter lifetime,10 start/stop/modulation edges,8 cancel/hold cache.
- The original7 timeline observations now match Native completely. The old
  curve-readd exclusion and wrong-output boundary are removed from the test;
  actual unchanged Native expectations are asserted in full.
- Six focused Node24.22.1 tests pass, covering all69 rows. Log:
  evidence/curve-quantum-focused.log.
- Baseline rendering matched8/24 quantum rows and2/12 initial value rows. Raw
  contrary baseline outputs and every subsequent calibration remain retained.

Exact commands, isolated scratch and serial:

```
node evidence/probe.mjs evidence/<name>-expression.js evidence/<name>-native.json
node evidence/candidate-probe.mjs evidence/<name>-expression.js evidence/<name>-cached.json
node --experimental-vm-modules --test --test-concurrency=1 test/audio-curve-quantum.test.js test/audio-timeline-performance.test.js
```

Names: curve-quantum, curve-value, param-value-lifetime, param-value-edges,
param-value-cancel. The owned probe verifies Native binary SHA256
9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f and records input/probe
hashes. Full source SHA manifest and every raw result are included. All servers
used ephemeral ports, all processes stopped. No canonical ports, source-budget
fixture, broad/full/PS or heap-enumeration suite ran during Root's freeze.

Scope is offline GainNode.gain and ConstantSource.offset. Other parameter classes
and the existing realtime clock-only profile retain earlier value behavior. There
are no new public allocations/prototype/realm/brand changes, no native binding or
dependency additions, no graph-depth/event/sample caps and no fixture assertion
changes. Composed broad audio/source-budget/PS/heap validation is deferred until
Root releases its current checkpoint; this handoff does not claim those checks.
