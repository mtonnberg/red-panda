# Worker startup: keep Window initialization out of owned Worker runtimes

The unchanged worker fixture reached actual document load, then exhausted its original 8 second assertion allowance. A diagnostic trace located the delay before script requests:26 threads were created at 248–812 ms and 25 came online by 1574 ms, but only 11 reached the worker module entry before the deadline (5019–8480 ms). Requests and queued messages proceeded after actual initialization. This did not establish lost messages or an 8 second blocked Runtime.evaluate.

The patch separates private kind-name, frontend-global, retirement and Worker socket-owner registries from generated Window setup. It defers genuine Window-only readers to their existing Window installer paths. The full original Window bootstrap and generated factory setup still run before allocation in every ordinary Host embedding, including standalone JSDOM and direct WebSocket imports. Only the existing private Node workerData.redPandaWorker/redPandaSharedHost authority on a real non-main thread selects the owned Worker path. Authored VM objects, names, source paths and test flags cannot select it.

Known names classify ordinary lookalikes; they never confer platform brands. The lightweight manifest validates 232 actual generated-source byte digests plus its own pinned digest/version, retaining all 177 previous known-name predicates. Original 116 generated-source compilation/validation and canonical exports/backend identities remain in the genuine Window installer. The frontend-global WeakMap and retirement callbacks each retain one shared authority. Worker Events/Abort, VM allocation, native bytes, task queues, transports and public descriptors keep their real producers.

An isolated import profile measured 645 CJS modules in the original graph (547/534 ms wall/threadCPU in one epoch;980/964 ms in another). The owned-role partition profile measured 36 modules and 250/246 ms, with zero generated Window compileFunction calls before Worker VM creation. Those profiles are diagnostic stage evidence, not final benchmark equivalence; the last normal-Host initialization restoration happened afterward and leaves the owned branch unchanged. The final production Source replay is the actual acceptance evidence.

`integration.patch` contains 20 runtime leaves plus one fixture cleanup leaf. `runtime.patch` and `fixture-cleanup.patch` are separately reviewable. The fixture helper now registers owned HTTP cleanup before a Browser constructor that can fail; original source expressions,1800 ms transfer wait,18 s tests,SyncHTTP 2000 ms and Source 2 s/8 s budgets are unchanged.

## Results and preserved failures

The final production runtime has completed positive coverage of all 14 affected test files across epochs:80 checks from C's seven completed positive files, later Shared 15/15, and Remaining 75/75 (170 distinct matched checks). This is **not** a single clean full 14 file epoch: C as a whole was rejected. The later fixture change affects only Shared cleanup. Exact names/source guards are archived. All own tests used Node 24.22.1; heavy heap enumeration was explicitly excluded, and other SDK/composed/full checks remain for Root.

| Epoch | Actual outcome |
| --- | --- |
| Original composed Source 4 | Worker load 816 ms; assertions 8004 ms timeout,25 started/9 completed. |
| Initial trim profile |193 ms to a genuine CJS circular-import failure; no passing cost claim. |
| Initial 14 file run |106 pass/8 fail/5 cancel: one genuine bare-JSDOM cloning regression, seven missing-oracle setup failures, manual SIGTERM at 59.079 s before the extension message arrived. |
| A |65/65 pass after restoring ordinary Host pre-allocation hooks. |
| B |77 pass/1 genuine first-import WebSocket circular failure/1 Worker resource cancellation at 44.147 s. |
| C |93 pass/2 Sharedfail/7 resource cancellations at 118.161 s. Transfer returned rows[]; another test failed in the original SyncHTTP readiness 2000 ms constructor. |
| Shared diagnostic |Both unchanged expressions match in a separate instrumented quiet epoch; ready/message phases and errors retained. This is not a causal fix or erasure of C. |
| Shared production |15/15 pass,9.38 s, no instrumentation, original contracts. |
| Remaining production |75/75 pass,45.19 s, no instrumentation. |
| Unchanged SourceWorker |Native 1/1 pass(load 84/assert 86 ms); candidate 1/1 pass(load 844/assert 3920 ms), original 2 s/8 s. Five Runtime exception text entries remain unclassified. |

C's readiness failure also exposed a fixture cleanup gap: its server was created before Browser and cleanup registration. The cleanup correction prevents a failed constructor from leaving listening servers; it does not claim to explain the underlying transfer/readiness observations. Three initially suspected orphan processes were proven exited Z zombies; no signals were sent.

## Artifacts and provenance

`source-manifest.json` pins before/after bytes for every leaf against the exact private Source 4 graph. `evidence.tar.gz` preserves all raw logs/reports/statuses, source guards, rejected/interrupted/setup epochs, diagnostic instrumentation patches and actual profiles. The postrun provenance sidecar checks all 6579 shared dependencies against the earlier frozen Source 4 manifest with zero differences/new files, plus 28 Worker subtree/harness sources, actual Node/Native executables, CLI, runner, registration map and fixture transports. It explicitly distinguishes runner-recorded before identities from additional postrun hashes; it does not invent an independent before guard for those later hashes.1846 own runtime/test/native/oracle/reference inputs remain unchanged during final scopes/Source.

Native binary SHA256:9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f. Registration map SHA256:066ad73e170657f43d79ca4f35b0741c18cec15dbed44bb1dba0518bf400c9b8. No new dependencies, native engine import, raster/codec fabrication, source fixture edits, deadline increases or public prototype/toString/heap masking.
