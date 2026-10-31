# Minimal Promise interruption observations, revision 2

This is a completed causal diagnostic, not an acceptance suite or a production change. The ten independent children ran on Node 24.22.1, with a real 200 ms VM budget, 4 second per-child deadline and 45 second overall administrative ceiling. The controller finished in 4.275 seconds. No child reached its external deadline. All children exited and all seven selected Root source hashes were unchanged. This guard does not cover the whole repository or dependencies.

| Child | Exit | Actual final observation |
| --- | ---: | --- |
| default-als | 0 | Actual timeout caught; two later positive reactions and next Host tick reached |
| default-plain | 0 | Same recovery markers |
| after-als | 0 | Same recovery markers |
| after-plain | 0 | Same recovery markers |
| nested-als | 0 | Same recovery markers |
| producer-ownership | 0 | Host delivery and a Host tick did not drain the actual VM queue; a genuine owning VM entry ran both reactions |
| default-hook | 1 | Timeout caught and two positive reactions ran; fatal async-hook corruption before next Host tick |
| after-hook | 1 | Same fatal result with genuine afterEvaluate context |
| poison-kept | 1 | Animation assertions completed with zero traps; later Page.close documentAbort called authored clearTimeout through intersection.js:102 |
| poison-restored | 0 | Animation assertions, Page.close and next Host tick completed with zero traps |

Both hook-mode errors report `async hook stack has become corrupted (actual: 9, expected: 3)` at `popAsyncContext`, `emitAfterScript`, `processImmediate`. The init-only PROMISE hook was enabled before Promise allocation and was not disabled. ALS-only recovery therefore does not establish recovery with production's init-only ownership hook. Moving to afterEvaluate alone does not solve that exact mode.

The checkpoint binding's result flags were not recorded by this diagnostic. The default modes actually invoke the existing public-V8 checkpoint inside the timed VM. This observation must not be represented as a new ran/running/depth flag measurement. No callback-scope addon was built or tested; public node::CallbackScope/MakeCallback interruption recovery remains unproved.

The poison probe intentionally imports the frozen rejected R3 scratch, not current Root. The non-suppressing uncaughtExceptionMonitor records the real teardown stack; Node then exits 1. Restoring descriptors only after the actual animation assertions is legitimate test cleanup for this measured unrelated intersection teardown. This result neither fixes nor hides the separate production intersection timer ownership behavior. Both poison children retain a MaxListeners warning in stderr.

All negative exits and original logs remain unchanged. No budgets, production hooks, private async registries, Root source or native binaries were changed. There is no safety conclusion for a new production checkpoint.
