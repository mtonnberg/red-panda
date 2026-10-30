# Unsafe heap-enumeration experiments — not browser functionality

**Do not integrate or load these into a browser/server process.** Both attempted
implementations crashed in owned subprocesses using the application's real Page,
Runtime inspector and repeated navigation/teardown. Runtime.queryObjects remains
explicitly unsupported. These files preserve independent experiments and negative
evidence; they are outside production imports/build scripts and default tests.

The native Lightpanda reference implements queryObjects. Its observed semantics
and the actual independent failures are recorded in
[the reference notes](../../docs/reference/runtime-query-contract.md).

Files:

- heap-query.cc: public HeapProfiler TakeHeapSnapshot/GetObjectId/FindObjectById
  experiment. Internal map/prototype graph edges distinguish actual inheritance
  from an authored __proto__ property. Returns actual objects/realm Arrays, not
  reconstructed copies. The application lifecycle stress crashes on Node 24 and 26.
- direct-unsafe.cc: public HeapProfiler::QueryObjects predicate experiment; avoids
  inspector commands and stops before Proxy prototype traps. Application teardown
  stress also crashes on Node 24. No production implementation uses this variant.
- build.mjs and loader.js: experimental standalone build and exact
  Node/V8/ABI/platform/source/binary verification. Importing does not build or
  load native code. Default build output is inside ignored .cache.
- probe.mjs/validation.mjs: partial, isolated validation that passed before the
  application-level failure was established. Their passing is not a safety claim.
- browser-lifecycle-probe.mjs: application-level Browser + Runtime + navigation
  stress; this is the important failing reproduction. Requires the existing
  collection addon already built for the exact Node version.
- jsdom-lifecycle-probe.cjs: simpler partial-success probe without the full Page.
- single-browser-probe.mjs: stage-labeled single-Page probe that passed once;
  it does not replace repeated teardown testing.

Always use run-probe.sh for any future native execution. It sets the child's core
limit to zero. Do not inspect process-memory dumps. The wrapper only executes the
provided argv; it does not interpolate arguments into shell code.

Reproduce a snapshot build explicitly using an exact Node version and its headers:

```sh
node experiments/heap-query/build.mjs --output .cache/heap-query-experiment/snapshot.node
bash experiments/heap-query/run-probe.sh node --expose-gc experiments/heap-query/browser-lifecycle-probe.mjs "$PWD/.cache/heap-query-experiment/snapshot.node" 6
```

The second command is expected to be unsafe, so run it only in an owned bounded
subprocess and retain exit signal/stderr. Use an external SIGKILL deadline as well;
the snapshot phase is synchronous and cannot be forcibly interrupted by the
helper's cooperative progress callbacks. Do not run crash probes in a shared
browser, test-runner or parent process.

The direct variant can be compiled separately with g++ C++20, shared/PIC flags,
exact Node headers and NODE_GYP_MODULE_NAME=red_panda_heap_query_direct. The generic
browser lifecycle probe accepts its .node path too. The direct source has no
production loader or manifest. No dependency, current native builder, collections
source, Runtime dispatch or CDP code is changed by these files.

The snapshot helper's positive contract tests can be invoked explicitly with
`node --test experiments/heap-query/validation.mjs`; they intentionally remain
outside the default test glob. They are incomplete and cannot justify integration
in the presence of the application crashes.
