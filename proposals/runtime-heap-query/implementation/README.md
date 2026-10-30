# Isolated real Runtime.queryObjects implementation

This proposal is not installed in production. It uses public V8 HeapProfiler
QueryObjects, actual named VM contexts, real Array allocation in the selected VM,
and weak factory-only raw/public wrapper canonicalization. It does not use Node's
inspector queryObjects or execute selectors in old/default contexts.

`native/heap-query.cc`, `src/native-heap.js`, `src/heap-registry.js`, and
`src/heap-query.js` are the new implementation. `overlay/` preserves the exact
executed common-file variants. `factory-callsites.patch` and `css-factories.patch`
keep heap dispatch/factory notifications separate from the real CSS factories.
These diffs are against the SHA-verified captured source archive, not an assertion
that they apply to a later parent working tree. The parent owns production changes.

## API and ownership

- `queryHeapObjects(prototype, actualContext, limits, expectedContextId?)` returns
  `{objects,visited,rawMatches,milliseconds,publicMatches,filtered}`. `objects` is a
  genuine selected-realm Array containing actual matched public object identities.
- `runHeapQuery(session,params)` validates the actual prototype handle authority,
  derives its page/frame, and hands the Array to the real session remote-object
  manager with requested objectGroup/contextId. Existing group release and stale
  navigation handling are exercised by CDP controls.
- `prepareHeapRealm(page,window)` runs after browser adapters and before authored
  preloads. Generic IDL setup/new, form Proxy, HTMLDDA, Fetch, Streams and CSS
  factories notify the private weak registry at the successful construction point.
  The registry never enumerates or strongly snapshots wrappers before profiler GC.
- `registerHeapRealmAuthority({context,contextId,isActive})` is a host-only hook for
  actual utility worlds; disposal removes its global authority. A second active ID
  for the same VM global is rejected. `registerHeapFactoryValue(publicValue,
  {implementation,globalObject})` records the actual captured factory implementation
  and intrinsically unwraps its owned Proxy targets without author traps. Existing
  compiled-utility hooks can supply these two callbacks. **Combined utility world
  runtime coverage remains pending parent integration.**

The native predicate traverses internal prototypes, excludes its own anchor and
input prototype, stops before Proxy traps, and preserves actual function/object
identities. A direct inheritor of a queried Proxy can match without invoking its
trap. Post-walk canonicalization uses exact weak factory identities, own result
properties, and deduplication. Authored fake DOM-prototype objects retain identity;
no implementation-symbol getter or constructor-name inference determines ownership.

A cross-frame oracle established native match partitioning by actual V8 creation
context, including context maps inherited through foreign prototypes. Final
post-walk code omits a match only when its V8 creation global is a **different
registered** page/actual-world global. It does not reject the prototype merely for
being foreign, nor infer ownership from its constructor. The earlier conservative
prototype guard wrongly rejected locally allocated inherited prototypes; its source
and observations remain preserved as negative evidence.

Host-created bridge objects with unregistered Node creation globals remain exact
factory exceptions rather than guessed realm ownership. Their full cross-world
partition behavior is a remaining gap. Main DOM Object.prototype membership,
form/control public === identities, ordinary fake-prototype identities and sixteen
public wrapper families have positive focused controls, not universal DOM parity.

## Bounds and error contracts

Defaults: 100000 raw matches, 100000 public matches, 2000000 visited objects,
4096 prototype hops, 10000ms cooperative budget. Hard maxima are 500000 results,
5000000 visited, 16384 hops, 60000ms. Host limit options require own data properties
and positive safe integers; unsupported/accessor options are rejected. Overflow,
visit/depth/time failure releases native Globals and throws; it never returns a
prefix. Raw caps count matches before canonicalization/context filtering, so a
small public result can still exceed a raw cap.

The profiler's GC/heap walk is synchronous and blocking. Its collection phase
cannot be forcibly interrupted; the deadline makes subsequent callbacks cheap and
checks result construction/canonicalization, but is not a hard process deadline.
The preserved subprocess probes use external kill deadlines and core size zero.
Small exact-runtime controls record per-call times; historical named-lifecycle
records also retain process memory/time measurements. Those are workload evidence,
not production latency/memory guarantees.

Public schema errors map to -32602 Invalid parameters; unknown prototype handles
map to -32000 Invalid remote object id. Internal bounds map to explicit -32000
with stable `data.kind`; actual-world aliases map to -32601 unsupported. Existing
ordinary Runtime error/group contracts belong to the parent and are not globally
rewritten here. Missing/stale backend artifacts fail explicitly before dlopen.

## Reproduction

The executed historical location is `.cache/heap-query-production/base`.
`frozen-source-base.tar.gz` contains 72 source/config files, verified byte-for-byte
against `frozen-base-manifest.json`; binaries are excluded and must be rebuilt.
`prepare-frozen.mjs` is a newly written reproducibility helper (not the historical
preparer); its own execution status is recorded separately. It copies private jsdom
sources and links the other installed dependencies so factory patching cannot alter
the main process's jsdom cache. The installed dependency fingerprint is preserved.

Prepare a separate empty destination; copy the new `src/*.js`, `native/heap-query.cc`
and `overlay/` onto the baseline. Build its captured collections/runtime with its
own builders and the exact SDK, then run this explicit heap builder:

```sh
/workspace/shared/rea-tools/node_modules/node/bin/node proposals/runtime-heap-query/implementation/build-native.mjs \
  --headers /workspace/shared/rea-tools/node_modules/node/node_modules/node-linux-x64/include/node \
  --output .cache/heap-query-production/base/native/build/linux-x64/node-24.22.1/heap-query.node
```

Use Node26.13.0 and its exact headers for node-26.13.0; do not reuse a different
patch-level binary. Loader controls and standalone small controls use the additional
`.cache/heap-query-production/native/heap-query-node24.node` (or node26) copies.
All probe commands run from the repository root through
`timeout --signal=KILL <seconds>s bash experiments/heap-query/run-probe.sh <node> ...`.
Run sequentially: small-control.mjs (30s), loader-control.mjs (30s),
browser-control.mjs (60s), cdp-control.mjs (120s). Only after Node24 passes run Node26.
The current controls intentionally import the fixed historical frozen location.
Other destinations require an explicitly labeled harness path adaptation.

The builder validates exact Node/V8-base/ABI SDK macros, retains compiler command
and SDK header hashes, and writes exact runtime/platform/architecture/API/backend,
source and binary hashes. The loader validates these fields before dlopen and
compiled Node/ABI/V8-base/backend exports afterward. It never auto-builds. A loaded
binary replacement requires process restart. SDK headers need not ship at runtime.

## Provenance and known limitations

See `validation-manifest.json` for final source/probe/log/result hashes and exact
completed results. Retained failures include initial beforeParse context selection,
an incorrect creation-realm filter for fake DOM-prototype objects, a wrong oracle
helper import path (UNOBSERVED), and the discarded prototype-owner guard. The early
CSS oracle imported the production Browser indirectly through reference-server.mjs,
which polluted shared CSS prototypes with another engine module's private objects;
the corrected oracle uses reference-driver.mjs and retains that distinction.

CSS oracle counts remain different even though each measured public identity and
actual sheet prototype membership succeeds: native sheets/rules/declarations are
2/2/3 versus candidate 1/1/10 in the minimal fixture. No count parity is claimed.
Hidden engine CSS allocations are tagged only at actual known factories. The CSS
owner is independently reviewing the real parsed-sheet prototype alignment.

Actual isolated-world dispatch, host bridge realm partitioning, exhaustive DOM/
Fetch wrapper identity, root ordinary remote metadata behavior and broader lifecycle
stress after full production integration remain open. This proposal proves a real
bounded API for the exercised main/frame cases; it does not establish complete
Lightpanda Runtime parity or browser replication.
