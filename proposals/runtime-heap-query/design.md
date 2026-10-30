> Historical source-only design. The later isolated implementation, executed controls,
> discarded-guard evidence and remaining parity gaps are in
> [implementation/README.md](implementation/README.md). Production enablement remains separate.

# Direct heap-query binding: integration design, not enabled

Production Runtime.queryObjects is still unsupported. This document proposes a
separate implementation after the named selector; no production heap source,
loader, build command or default test glob is changed here. Root's later validation
passed 586 JavaScript tests, 50 PureScript tests, 13 reference groups and the frozen
41-fixture cohort. This proposal remains source-only; future runtime/build work
requires a separately scheduled isolated diagnostic stage.

The concrete selected-realm anchor, factory-owned DOM wrapper canonicalization,
nontruncating bound/cleanup plan and pending oracle matrix are specified in
[canonicalization.md](canonicalization.md). This remains source-only while root
integrates the separately reviewed runtime checkpoint/task entry binding.

## Evidence and its limits

The identical public HeapProfiler::QueryObjects predicate source that crashed with
the old all-context marker selector passed the named-selector workload on both
exact runtimes. Node24.22.1 completed4cycles/28 selections/41 queries in29.247s;
Node26.13.0 completed the same in32.985s. Snapshot-backed versions also passed,
but took117.271s/109.650s. Cases retain old closed contexts across root/frame
navigation, mutate actual matched objects, include foreign-realm descendants,
stop at Proxy boundaries and exercise actual CDP object groups.

The CDP group test handed a real backend array to the existing object manager
through an owned fixture, rather than enabling queryObjects dispatch. Releasing
the array group invalidated its handle while the prototype's other group survived;
mutation was visible through ordinary Runtime.evaluate, and the successor context
was selected after navigation. Existing invalid-handle behavior differs from the
native reference: Red Panda getProperties returns -32602 `Cannot find object with
given id`, native returned -32000 `Could not find object with given id`.

These are bounded isolated results, not a proof against all GC/lifecycle faults.
No direct-backend timing control claims byte/pixel/full-browser parity. Raw source,
binary and stage-log fingerprints remain in runtime-query-named-direct-node*.json;
the compact direct summary records observed query times and process memory.
The exact successful probe/driver sources and diagnostic overlays are preserved
under experiments/heap-query/named-lifecycle. Its manifest audits all six positive
artifacts against those source bytes. The reconstruction helper is newly written
and unexecuted, distinct from the historical executed sources.

## Proposed source/build boundary

Add an independent context-aware native binding and JS loader; keep them separate
from collections.cc. The binding must use public V8 APIs only and hold no global
persistent object registry. Extend build:native only in a later reviewed change.
A versioned binary path should include platform, architecture and exact Node patch:
`native/build/<platform>-<arch>/node-<exact-version>/heap-query.node`.

The explicit builder must run with the same Node executable as the target runtime,
find headers whose NODE_MAJOR/MINOR/PATCH_VERSION exactly match it, and emit:

- addon kind/schema/backend API version;
- exact process.version, process.versions.modules and full process.versions.v8;
- platform and architecture;
- source SHA256, binary SHA256 and compiler/header provenance;
- hashes of node_version.h/v8-version.h for reproducible SDK provenance.

Before dlopen the loader must validate every runtime/ABI/V8/platform/architecture
field, the source digest and binary digest. After loading, compare compiled
NODE_VERSION and NODE_MODULE_VERSION exports and the binding API/backend identity.
Compiled V8 header base-version exports should match the runtime's V8 base; the
manifest retains the full Node embedder suffix as an exact runtime constraint.
Reject stale/missing/mismatched artifacts explicitly. Never auto-compile, silently
fall back to fake results, or load a replacement binary into an already-running
process; a changed loaded digest requires restart. SDK files need not be present
after deployment merely to use an already validated binary.

## Authority and actual result realm

CDP queryObjects has no independent executionContextId authority. Validate the
prototypeObjectId, resolve its session-owned entry, derive the selected active
page/frame from that entry's contextId, and reject stale/detached entries before
calling native code. Do this before generic Runtime state initialization; a frame
prototype must not accidentally initialize the root page state.

The tested prototype returns an actual Array in the input prototype's V8 creation
context. That is verified for page-authored prototypes. Host-created jsdom/Fetch
prototypes and a foreign prototype wrapped by another CDP execution context remain
unverified ownership cases. The integration should therefore accept a **trusted
selected-realm anchor**, not infer authority from global Array or an arbitrary
object's constructor/prototype getters.

Create a real empty array literal with trusted vm.runInContext('[]', selectedPage.
dom.getInternalVMContext()). Its V8 creation context identifies the selected realm,
even if the page overwrites window.Array. Pass that actual object as a separate
native argument. Native code obtains the anchor's creation Context, invokes the
query with that Context, enters it for Array::New, and creates own entries using
CreateDataProperty. Preserve the real returned objects as elements. Do not change
an array's prototype afterward and do not serialize/reconstruct the objects.

The selected-realm rule must be checked against owned native cross-frame/DOM
prototype oracles before enablement. Backend tests must cover host-created DOM
prototype bridges explicitly; do not silently select Node's default realm. If a
prototype is not a page-created or explicitly owned bridge prototype, fail rather
than treating a remote handle's presence as permission to enumerate Node's root
prototype graph. Any bridge-prototype policy needs its own concrete ownership
registry/validation; it is not established by the current user-prototype tests.

The current form bridge additionally exposes owned Proxies as public DOM wrappers
while their raw targets inherit HTMLFormElement/HTMLFormControlsCollection
prototypes. Querying those bridge prototypes can therefore expose a raw target
even though the ordinary public wrapper is skipped as a Proxy. Any canonicalization
must use a private factory-owned raw-target-to-public-wrapper registry, preserve
deduplicated public identities, and never infer ownership by reading authored
implementation-symbol getters. Ordinary page-authored objects that merely inherit
a DOM prototype must retain their own identities. This is an unresolved concrete
integration case, not established DOM-prototype support.

## Native implementation contract

A proposed internal API is
`queryObjects(prototype, selectedRealmAnchor, limits)`; limits are trusted host
options, not additional public CDP parameters. Both first arguments require actual
V8 objects; do not coerce values or read constructor/__proto__/Symbol.toStringTag.
Create a QueryObjectPredicate and use the real HeapProfiler::QueryObjects output
vector. Persistent result handles are local to that call and reset on every exit.

For each candidate, traverse actual internal prototypes with GetPrototypeV2.
Stop before calling it on a Proxy. Compare the newly obtained prototype to the
requested object before continuing: this permits a direct child of a requested
Proxy while excluding a Proxy and objects beyond it from queries for its target's
base. Own __proto__ properties/getters do not establish inheritance and must never
be invoked. Exclude the prototype itself. Preserve functions and ordinary objects
when they genuinely match; retain foreign-realm descendants.

Default proposed caps retain the experimental scale:100000 results,2000000 visited
objects,4096 prototype hops per candidate and10000ms cooperative wall time. Validate
finite positive bounded integer limits without coercion. Count before accepting a
new result. When overflow, deadline, empty-handle or prototype-read failure occurs,
record a failure flag and return false from subsequent predicate calls. Do not
throw/allocate an error while inside the heap iterator. After V8 returns, release
all Globals and throw a stable explicit error; never return the collected prefix.

The timeout cannot interrupt GC or force the synchronous V8 enumeration to return.
Once a budget is exceeded the callback can become cheap, but V8 may still finish
its walk. This is a cooperative bound, not an isolation guarantee or hard request
cancellation. A hard deadline requires an external owned-process watchdog. Result
allocation must use the trusted realm and CreateDataProperty to bypass inherited
numeric setters. Failure paths must also release handles and avoid publishing a
partially filled array.

## Error mapping

Observed native protocol contracts are:

| Input/state | Native result |
| --- | --- |
| missing prototypeObjectId | -32602 `Invalid parameters` |
| unknown/nonexistent prototype handle | -32000 `Invalid remote object id` |
| released result group, later getProperties | -32000 `Could not find object with given id` |

Validate public parameter types before native entry. Map missing/wrong-type fields
to the schema error, unknown/released prototype handles to the native invalid-ID
contract, and stale page/frame contexts to an explicit context error. Symbol,
primitive-wrapper, malformed optional-group, host-bridge and cross-context handle
messages need further native observation; do not advertise their exact parity.

Proposed internal codes distinguish argument/context/backend availability from
result/visit/depth/time failures, e.g. ERR_HEAP_QUERY_ARGUMENT, _CONTEXT,
_BACKEND_UNAVAILABLE, _RESULT_LIMIT, _VISIT_LIMIT, _DEPTH_LIMIT and _TIMEOUT.
Native resource bounds have no oracle-backed equivalent yet; expose honest -32000
backend failures with stable messages rather than fake empty/successful arrays.
Do not globally rewrite existing getProperties errors as part of heap enablement;
that currently observed -32602/-32000 mismatch is a separate compatibility change.

## Pending focused oracle and proposal tests

Keep these runtime probes pending until root releases the next diagnostic stage:

- Two live pages/frames, reversed creation/navigation, old retained handles and
  invalid/stale prototype IDs. Verify exact selected names and result ownership.
- A prototype authored in another live realm and retrieved through a different
  CDP realm, plus HTMLElement/Node and Fetch-class host-created prototypes.
  Establish the native result-array realm before deciding bridge ownership policy.
- Query HTMLFormElement.prototype and HTMLFormControlsCollection.prototype against
  native and independent owned forms/controls. Assert members are exactly the
  public wrappers (===), never hidden raw Proxy targets. Include fake-prototype
  objects and hostile implementation-symbol getters, testing any private bridge
  factory registry without treating authored properties as authority.
- Capture the original selected-realm Array/Array.prototype, overwrite window.Array
  with a throwing replacement, and query. Array allocation must not call it;
  the result must retain the captured intrinsic realm's prototype/instanceof.
- Install inherited numeric setters (especially index0), and throwing constructor/
  Symbol.toStringTag getters on relevant prototypes. Verify no construction or
  wrapping getter is invoked; own result indices contain the real identities.
- Authored __proto__ data/getter properties, getPrototypeOf Proxy traps, revoked
  Proxies and a direct inheritor of a requested Proxy. Counter values must reflect
  actual execution; never acknowledge effects without running them.
- Cross-realm identity/mutation/group release using the real CDP object manager;
  ensure result metadata formatting recognizes real arrays without property getters.
- Explicit each-bound failure with no prefix result, followed by a successful
  query to prove cleanup. Do not write GC-timing assertions.
- Exact manifest/header/binary mismatch rejection before loading, and isolated
  repeated lifecycle checks on both pinned Node versions after actual integration.

No backend, result-realm anchor or public Runtime route is enabled by this design.
