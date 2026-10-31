# Frozen audio cost margin followup

NEXT SLICE ONLY: apply after frozen curve/current-value patch d3e9f2a0.
No current Root runtime/test/docs/reference files were edited during full freeze.

Patch SHA256:
`cc7c8a777b9a34b37f74c5ea334bb7ef2a1f8c37f78fcc307294de53abd137fb`.
Audio base/result:
`eabe3d5108edca694e186ef72d7ab385a47da10cbfec06aefa964db90b234b3e`
→`6ed9052252afcf1aab0dc76d017cf985de5e0b0d87986b21bf4ea333526aea36`.

Five paths: audio-core body hunks, one new numerical regression test and three
doc/contract files. Apply-check passes against a separate pristine d3e source
copy. It intentionally requires d3e; current Root remains c75 until next slice.

General algorithms, without output shortcuts:

- A fresh Host-owned cursor advances through all automation events in a single
  synchronous render quantum. It retains the exact original event anchor value,
  anchor time and active target; returned per-frame values never become a new
  approximation anchor. Future ramps/active curves remain pending. The cursor is
  discarded before between-quantum mutations; arbitrary-time callers stay pure.
- A non-sample-accurate parameter is evaluated once at its identical quantum
  time. The real last-computed intrinsic cache still receives the actual result.
- Empty gain modulation no longer creates Host lists/Float32 zero buffers. The
  arithmetic still adds positive zero, including its signed-zero/NaN behavior.

Existing mix operations, Float32 stores, graph nodes and every gain multiplication
remain. No in-place reuse, identity-gain skip, event removal, node/sample/time cap,
arbitrary depth policy, vector substitution or deadline/fixture edit is introduced.
A more complicated buffer-ownership alternative was considered and not adopted.

Measured validation, all serial:

- Instrumented actual d3e diagnostic: combined2000 targets/setters/gain nodes
  1593→218ms; automation-only render761→27ms;2000-gain render679→176ms. Every whole
  rendered-buffer digest and actual cache value is identical. Raw profiles retain
  actual costs (baseline paramValue1188ms/graph732ms across cases; optimized
  graph158ms and paramValue no longer a dominant sample).
- Actual unchanged audio_graph fixture under its original2000ms load+2000ms
  assertion contract passes at600ms load/8ms assertion, no diagnostics/exceptions.
  Full source/profile/harness metadata is retained. This is an observed run, not
  a new threshold or guaranteed benchmark.
- All69 actual Native observations pass on exact Node24.19.0,24.22.1,26.13.0:
  six focused tests per runtime, cost-native69*.log. Native expectations unchanged.
-14 varied graphs match a separate frozen d3e source copy byte-for-byte and
  cache-for-cache on all three runtimes:20 channel-buffer digests, signed zero,
  NaN payloads/infinity/subnormals, computed NaN, large gains, varying targets,
  ramps, curve hold, ties, feedback, modulation and suspended-quantum mutation.
  Final numerical contract test passes on all three runtimes.
-209 small word/zero/NaN arithmetic controls also match per runtime. The unused
  in-place normalization experiment is diagnostic only, not production behavior.

Exact commands, isolated scratch:

```
node --experimental-vm-modules evidence/profile-audio.mjs evidence/d3e-cost-baseline
node --experimental-vm-modules evidence/profile-audio.mjs evidence/d3e-cost-stage1
node evidence/float32-operation-control.mjs evidence/float32-operation-control-<runtime>.json
node /workspace/shared/audio-cost-d3e-control/evidence/run-varied.mjs evidence/varied-cost-expression.js evidence/varied-v3-d3e-<runtime>.json
node evidence/run-varied.mjs evidence/varied-cost-expression.js evidence/varied-v3-stage1-<runtime>.json
node --experimental-vm-modules --test --test-concurrency=1 test/audio-curve-quantum.test.js test/audio-timeline-performance.test.js
node --experimental-vm-modules --test --test-concurrency=1 test/audio-cost-margin.test.js
node scripts/conformance.mjs --root /workspace/red-panda/.cache/lightpanda-reference/browser-948d773786/src/browser/tests --binary /workspace/shared/audio-cost-margin-recovery/bin/red-panda.js --isolate --fixture-profile static --source-load-contract --registration-map proposals/fixture-routes/evidence/registration-map.json --port 0 --test webaudio/audio_graph.html --report evidence/cost-source-graph.json
```

The initial numerical test helper compared VM comparison arrays against Host
arrays and failed on prototype identity despite identical hashes; it now creates
ordinary Host comparison arrays. That failure and corrected logs remain. All
other inputs/outputs/source hashes are immutable in the evidence manifest.

No broad/full/heap suite or multicore compilation ran during Root freeze.
Profiling and actual source replay waited for the explicit fullA lease release.
All ports were ephemeral and owned processes have stopped. Broader composed
source22/audio/PS/full validation remains required for the later integration.
