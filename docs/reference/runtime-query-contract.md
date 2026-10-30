# Runtime.queryObjects: native contract and isolated lifecycle experiments

Status: **unsupported in Red Panda**. No heap-query implementation is integrated.
Neither a partial result nor a canned object count is supplied. Experimental
sources are quarantined under experiments/heap-query and are excluded from the
production builder/imports and normal test/*.test.js glob.

The verified reference is Lightpanda
`1.1.0-nightly.11326+948d77378`, SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
Owned data/about:blank pages were queried over raw CDP. No target engine
production source was copied.

## Observed native behavior

- Runtime.queryObjects({prototypeObjectId,objectGroup?}) returns
  `{objects:{type:'object',subtype:'array',className:'Array',description:'Array(n)',objectId}}`.
- Querying an owned base prototype finds an immediate child, an intermediate
  prototype, and that intermediate's child. The base itself is excluded.
- These are live object handles: mutating a returned array member changes the
  original object visible to Runtime.evaluate.
- A genuine prototype chain is required. An authored own data property named
  __proto__ pointing at the base does not make its owner a match.
- A proxy and a descendant beyond that proxy are excluded when querying the
  proxy target's base. Querying the proxy itself returns its direct inheritor.
  No getPrototypeOf trap is invoked in either case.
- An owned null-prototype object with no descendants produces a real empty array.
- Releasing the result's object group invalidates its handle; getProperties then
  returns -32000 `Could not find object with given id`.
- An invalid prototype handle returns -32000 `Invalid remote object id`.
  Missing prototypeObjectId returns -32602 `Invalid parameters`.
- An isolated-world prototype handle and result array both retain the isolated
  world's object-ID context component. General cross-frame/context ordering and
  lifetime details were not exhaustively probed.

Raw requests, responses and error strings are preserved in
runtime-query-native.json, runtime-query-native-contracts.json and
runtime-query-native-proxies.json.

## Independent attempts and negative evidence

The snapshot experiment uses public V8 HeapProfiler APIs. It takes a real heap
snapshot, gets the prototype's object ID, follows reverse internal object-map /
map-prototype edges, resolves actual objects through FindObjectById, and creates
an actual Array in the prototype's creation realm. The graph does not mistake an
own __proto__ data property for the internal prototype. Bounds throw explicit
errors rather than returning a truncated array. No persistent result handles,
serialized copies or inspector.queryObjects command are used.

Initial plain jsdom probes passed 5 teardown cycles on Node 24.22.1 and 3 on
Node 26.13.0. Focused contract/loader/lifecycle tests also passed 3 tests on Node 24.
Those limited passes did not establish application safety. A single application
Page with realm-selector inspector, a small query and teardown passed once;
runtime-query-browser-stage.json records the exact stage timestamps (~1.4s query).

Expanded application lifecycle probes then **crashed with SIGSEGV on both Node
24.22.1 and Node 26.13.0**, including navigation, Runtime inspector context
selection, real Page setup and native collection support. This was a bounded
six-cycle stress target; the number of completed cycles is unknown because the
process crashed before emitting its final result. The exact tested source hash
and signals are preserved in runtime-query-node24-bounded-stress.json and
runtime-query-node26-bounded-stress.json. Earlier broad Array/Function prototype
probes timed out at 180 seconds and were SIGKILL'd; those separate observations
are in runtime-query-node24-stress.json and runtime-query-node26-stress.json.
Per-candidate deadline checks were added afterward; they did not prevent the
application crashes.

The alternate experiment uses the public HeapProfiler::QueryObjects API with a
real QueryObjectPredicate, bypassing inspector commands and snapshots. It uses
GetPrototypeV2 for non-proxies and stops at proxies to match the native oracle.
Its Node 24 application teardown probe also **crashed with SIGSEGV** before
reporting a final result; runtime-query-direct-node24.json records this. The
source was separately compiled for Node 26 but not executed there after the
Node 24 failure established that it was unsuitable.

The crash's precise native cause is not established. These results do not prove
an upstream Node/V8 defect or isolate the failure to one GC/profiler operation.
They established that neither approach was safe with the old marker selector in
the tested environment; later changed-selector evidence is recorded below. No attempt was made to hide the failure behind a partial
array, count, retry or fabricated success.

## Limits and reproducibility

Snapshot construction is synchronous and blocks the Node isolate. The progress
callback and per-scan/per-candidate deadline checks are cooperative; they cannot
preempt every phase of V8's snapshot construction or an individual lookup. Small
plain-jsdom queries measured about 0.9–1.3 seconds; full-browser single-query
measurement was about 1.4 seconds. The initial plain probes finished around
211–215MB RSS, compared with about 114MB before the probe. These figures are
observations from different process stages, not a peak measurement, a leak proof,
or a general resource guarantee. Resolving many object IDs individually also has
substantial cost, and broader queries timed out.

Default experimental bounds are 100000 matches, 2000000 snapshot nodes, 10000000
snapshot edges and a 10000ms cooperative budget. The snapshot itself must be
constructed before its node/edge counts can be checked. The heap belongs to the
whole Node isolate, not a separately isolated browser engine. Any future design
must enforce page/context authority before accepting a prototype handle and must
pass the real application teardown reproduction, not just plain VM tests.

The experiment README gives explicit build/probe commands. No existing native
builder, dependency manifest, collection addon, Browser or CDP source was edited.
Future owned crash probes must use the provided run-probe.sh wrapper, which sets
core-dump size to zero, plus an external deadline. No matching core files were
found in the repository/owned cache/readable temporary paths after these probes;
no process-memory dump contents were inspected. runtime-query-provenance.json
records source/probe hashes and runtime/header versions for future investigation.

A later controlled minimization is recorded in runtime-query-counterfactuals.md.
It rules out HTMLDDA/full Browser installation as necessary and isolates the
reproduced trigger to marker function calls into older closed inspector contexts
after heap activity. Current-context-only and lexical-only controls pass their
bounded runs. The next named-context selector avoided all marker execution and instead matched
an exact host WeakMap context/name association to inspector notifications. Mapping
controls passed six cycles and 42 exact selections on each pinned runtime. With
that changed selector, snapshot and direct-backend diagnostics each passed four
cycles, 28 tracked selections and 41 real queries on both Node24.22.1 and26.13.0.
Snapshot elapsed times were117.271s/109.650s; direct times were29.247s/32.985s. These
are bounded isolated results with retained old contexts, actual identity/mutation,
foreign-realm descendants, Proxy stopping and real object-group lifecycle. They do
not establish universal GC safety or implement the public queryObjects route.

Root subsequently integrated only the independently reviewed name selector and
reported 586 JavaScript tests, 50 PureScript tests, 13 reference groups and the
frozen41-fixture cohort passing. Production heap enumeration remains unsupported.
Actual DOM/Fetch bridge ownership, Proxy-backed public form-wrapper identity and
selected-realm array-anchor cases remain open before production heap integration.

Exact executed positive probes/drivers and diagnostic overlays are preserved in
experiments/heap-query/named-lifecycle with SHA provenance and reconstruction
instructions. Its new preparer is explicitly unexecuted. The source-only binding
proposal is proposals/runtime-heap-query/design.md. Historical preparation and
negative-provenance manifests remain unchanged; the newer named result summaries
record subsequent milestones.
