# Frozen audio timeline optimization

Patch SHA256:
`e3507b66ab01311729f686e7de24272a92f34d2a5e5a3565e26b8cf367fa0163`.
Composed audio-core.js SHA256:
`c75aa0006433c7821bb55da0a613d8d546afe9e34b2352f7e6d6fd8e62009a12`.

Five paths: narrow audio-core body hunks, one test, and three Native contract docs.
`git apply --check` passes current Root. The patch and leaf preserve Root's new
stable implementationForWrapper import. Its whole DSP body was asserted identical
to the exact77390 profiling baseline before composing the optimized body. No
other source files were rebased during profiling; no Root production edits.

Root baseline audio SHA6e6a3073, profiled optimization84e2943c. Source manifest
contains complete hashes. The unchanged source fixture is webaudio/audio_graph.html
SHA10b6ad114dbac171e38167a6a62c4cd55021e545e825bd4ba03a712206b53a64.

The actual causes were repeatedly sorting the whole timeline with a VM comparator,
scanning thousands of non-curves for point overlap, creating target records on
every sample visit, and evaluating empty timelines through new closures. Stable
binary upper-bound insertion preserves exact time/sequence order; an accurate
private curve count skips only impossible point overlaps; actual immutable target
events replace temporary copies; empty timelines return their unchanged value.
Every event and sample remains, graph traversal/DSP is unchanged, and there is no
node/event/time/depth cap, silent fallback, recorded sample output or deadline edit.

Measured evidence:

- Actual source2000ms load+2000ms assertion contract: exact baseline timeout2417ms;
  optimized passes, load1402ms/assertion2ms, no diagnostics/exceptions. Same input,
  registration resource flags, actual Native harness branch and ephemeral static
  fixture origin. Reports include full configuration and source hashes.
- Combined diagnostic2000 targets+2000 .value setters+2000 gain nodes:
  scheduling776→48ms, total2239→1280ms with CPU profiler enabled. Same real samples.
  Automation-only scheduling651→16ms; chain allocation was only~14ms initially.
  Raw CPU profiles retain actual function costs; these are observations, not new
  deadlines or test performance assertions.
-35 focused audio checks pass:32 first-run passes and3 corrected-input retries.
  Initial3 failures were missing scratch fixture-root paths, not sample/assertion
  failures. The corrected run executes all three unchanged original fixtures,
  including offline compressor fingerprint and the actual large audio graph.
  Heap-enumeration checks were explicitly excluded.
- New bounded Native test passes. Seven full observations are exactly identical
  on a separate original-baseline copy and optimized copy. Six match Native
  completely. The seventh curve-readd rendered-data discrepancy is genuinely
  preexisting: Native all1, both independent versions retain8→10. Raw Native
  expectations are unchanged. The test verifies six exact rows plus the seventh
  error; it does not claim that seventh rendered behavior is implemented.

Exact serial commands, from the isolated scratch:

```
node --experimental-vm-modules evidence/profile-audio.mjs evidence/audio-baseline-profile
node --experimental-vm-modules evidence/profile-audio.mjs evidence/audio-optimized-profile
node scripts/conformance.mjs --root /workspace/red-panda/.cache/lightpanda-reference/browser-948d773786/src/browser/tests --binary /workspace/shared/audio-graph-performance-recovery/bin/red-panda.js --isolate --fixture-profile static --source-load-contract --registration-map proposals/fixture-routes/evidence/registration-map.json --port 0 --test webaudio/audio_graph.html --report evidence/audio-graph-optimized-source-contract.json
node --experimental-vm-modules --test --test-concurrency=1 --test-skip-pattern='public audio values|metadata remains' test/audio-core.test.js test/audio-graph.test.js test/audio-waves.test.js test/audio-media.test.js test/audio-compressor.test.js
RED_PANDA_REFERENCE_TESTS_ROOT=/workspace/red-panda/.cache/lightpanda-reference/browser-948d773786/src/browser/tests node --experimental-vm-modules --test --test-concurrency=1 --test-name-pattern='unchanged|untouched' test/audio-compressor.test.js test/audio-media.test.js test/audio-waves.test.js
node --experimental-vm-modules --test --test-concurrency=1 test/audio-timeline-performance.test.js
```

All raw inputs, Native binary/probe hashes, initial failures, exact baseline copy
manifest, source-contract reports and CPU profiles are retained. Final composed
Root alias header is for integration; Root's planned35/focused/source22/full runs
will validate that composition. No broad/full/PS/heap suite or canonical ports
were used here. All owned processes and ephemeral ports are stopped.
