> Historical source-only design. The later isolated implementation, executed controls,
> discarded-guard evidence and remaining parity gaps are in
> [implementation/README.md](implementation/README.md). Production enablement remains separate.

# Heap-query result realm, public DOM identity and bounds

Source-only integration plan. Neither the production heap API nor a new native
heap runtime is enabled here. The named-selector direct/snapshot lifecycle proofs
remain historical experiments; selected-realm anchor/DOM-prototype/bound tests
below have not run. Root is separately integrating the checked runtime binding
for genuine task entries/checkpoints. Its source/builder ownership is unchanged.

## Request authority and real result array

Validate the public parameter schema and resolve prototypeObjectId within its
session before initializing generic Runtime state. Derive the actual live page/
frame context from that remote entry, checking its document generation. Do not
select the root or newest inspector context by convenience. An actual isolated
world needs an actual owned VM context; an object-ID namespace alias alone cannot
establish a separate result realm. Existing world/group protocol fixes are outside
this heap patch and must remain separately tracked.

Obtain a trusted real array anchor with vm.runInContext('[]', exactContext). This
literal uses the realm's array intrinsic even if window.Array is overwritten.
Require a real non-Proxy Array at native entry and obtain its V8 creation Context.
Do not read constructor, __proto__, Symbol.toStringTag, or user property getters.
The native query and Array::New run in this trusted context. Entries are created
with CreateDataProperty, bypassing inherited numeric setters; do not reassign the
result's prototype. The result contains the actual matched objects, never copies.

The authoritative realm for a prototype created in one live realm but returned
through another context's CDP handle still needs its native oracle. The selected
remote context is the proposed authority, not a claimed observed cross-world
contract. Host-created DOM/Fetch prototypes need the explicit bridge ownership
registry below rather than silently creating Node-default arrays.

Register permitted bridge prototypes during trusted realm preparation, before
page code, keyed by the actual prototype objects and an opaque document/context
owner token. Accept page-authored prototypes in live owned realms and explicitly
registered public bridge prototypes. Do not authorize arbitrary Node-host
prototypes merely because an extension exposes a remote handle for one. Reject
stale/private/unowned prototype inputs explicitly; do not fake an empty result.
Foreign-realm descendants that truly inherit an authorized prototype retain their
real identities. Prototype authorization is not a license to filter those actual
descendants into a convenient count.

## Factory-owned public wrapper registry

Current src/form-controls.js wrap(raw,implementation,collection) creates a public
Proxy, then replaces implementation[wrapperSymbol]. The raw target inherits
HTMLFormElement/HTMLFormControlsCollection prototypes and is seen by the direct
predicate; the public Proxy is skipped at a Proxy boundary. Returning that raw
target would therefore expose a different identity from document/forms APIs.

At this exact trusted factory, register the known raw target and the actual public
Proxy immediately after creation and before publishing it. Maintain private
WeakMap identities in both directions; metadata carries an opaque owner token,
kind and weak public reference, not an enumerable page field. Owner metadata must
not introduce a strong global Page/Window registry. The factory entry point is
host-only and must not be exported on Window or callable by page scripts.

Registration is idempotent for the same pair. A second different public wrapper
for an existing raw target must be resolved by factory identity rules or rejected
as a real invariant failure; silently choosing the latest wrapper would conceal
an existing DOM identity bug. Historical mappings remain weakly available while
objects live, including after document closure, so a later query never falls back
to leaking a known private raw target. Stale-result wrapping policy needs its own
native lifetime observation; explicit failure is preferable to leaking a target.

Never recover canonical identity from implSymbol, wrapperSymbol, own properties,
constructor checks, getPrototypeOf traps or authored getters. A fake object made
with Object.create(HTMLFormElement.prototype) remains that exact ordinary object;
it was not registered by the factory. Do not turn it into a DOM wrapper or omit it.
Only an exact private raw-key lookup authorizes replacement with a public wrapper.

Forms are the first confirmed factory, not the entire DOM bridge inventory.
Generated collection/legacy-platform factories such as HTMLCollection, NodeList,
RadioNodeList, NamedNodeMap and DOMStringMap must be inspected and registered at
their actual final-public-wrapper creation sites before their prototype queries
are claimed. Do not assume every generated wrapper is a Proxy or that every raw
wrapper needs replacement. Identity pairs need no canonical rewrite.

Registration must occur after trusted adapter composition has chosen the final
wrapper. A generic IDL.setup hook installed beneath the custom form setup could
otherwise register its intermediate generated Proxy, then conflict with the form
adapter's final Proxy. Use the final factory boundary/explicit custom-factory
callsite, including constructor paths that bypass setup; do not resolve that
ordering problem by reading a mutable wrapperSymbol after heap enumeration.

The query prototype itself is never rewritten from a public Proxy to its target.
Querying a requested Proxy must retain native direct-inheritor semantics. Ordinary
authored Proxies keep the observed stop-at-Proxy rule; factory canonicalization is
not a general Proxy-unwrapping facility.

## Canonicalization outside the heap walk

Do not call JavaScript or create page-visible objects from the V8 heap predicate.
Its job remains actual internal-prototype traversal, Proxy cutoffs, real handle
collection and bound flags. A private JS canonicalizer must never be invoked
inside HeapProfiler::QueryObjects.

Also avoid taking a strong snapshot of every registered wrapper before the query.
That would keep otherwise unreachable DOM objects alive through the profiler's
GC and manufacture extra matches. Instead query real objects first, root only the
actual matches in the unpublished native array, then canonicalize those matches:

1. Read each own data entry of the genuine result array with captured host
   intrinsics; do not use page iterators or indexed prototype getters.
2. Look up its exact raw identity in the private WeakMap. If absent, retain that
   exact object. If present, resolve the registered public object. An unavailable
   registered public identity is an explicit invariant/lifetime error; never
   return the private target, silently omit it or fabricate a replacement Proxy.
3. Deduplicate by actual identity using captured host Set methods, without Proxy
   traps. Write final entries through captured Reflect.defineProperty with own
   data descriptors or a native finalizer using CreateDataProperty. Trim actual
   array length through its intrinsic array operation. Inherited setters and
   prototype getters must not execute.
4. Publish the real array through the existing session object manager only after
   the whole operation succeeds. On any failure, discard the unpublished result;
   no prefix array, count or successful empty result is exposed.

This keeps allocation in the selected realm and preserves real public identities
without user calls inside the heap iterator. The synchronous host path must not
return the page array as an async Promise value before wrapping it in a protocol
record, which could assimilate an authored inherited then getter.

HTMLDDA needs strict identity handling: it is a genuine V8 object despite falsy
truthiness and typeof undefined. Never drop a candidate with !value, ==null or a
typeof-object test. Use native IsObject/strict checks and exact WeakMap/Set keys.
Remote array metadata must use array brands/internal length, not constructor or
Symbol.toStringTag getters; ordinary Runtime wrapping issues remain separate work.

## Explicit limits and cleanup

Trusted internal options propose maxRawResults=100000, maxPublicResults=100000,
maxVisited=2000000, maxPrototypeDepth=4096 and a10000ms cooperative wall budget.
Validate finite bounded positive integers without coercion. These are resource
limits, not newly invented public CDP parameters or oracle-backed native limits.

Count every visited candidate, each prototype hop and each accepted raw match.
Exceeding any raw limit fails the whole call even if later canonical deduplication
would produce fewer public entries. Count final public identities separately.
Check the deadline during traversal and canonicalization/result construction.
Once a predicate limit triggers, retain a failure flag and stop accepting matches;
do not allocate/throw script exceptions from inside the heap iterator. After V8
returns, release all Global handles and throw the stable explicit backend error.
Every early error, canonicalization failure and allocation failure must release
temporary handles and avoid registering a session object/result group.

GetPrototypeV2 walks actual internal prototypes and stops before reading a Proxy.
Compare each obtained prototype to the requested object before continuing, so a
direct inheritor of a requested Proxy remains a match. No constructor/__proto__/
Symbol.toStringTag getter or user predicate participates. Both actual no-match
success and real failures must remain distinct.

The wall bound cannot interrupt V8 GC/QueryObjects or one synchronous allocation.
V8 can continue its walk after the predicate records a timeout. This is a
cooperative limit; hard deadlines require owned-process isolation/watchdogs.
The measured isolated query timings/memory are not a production resource promise.
Before production enablement, repeat real lifecycle checks with the new task/
checkpoint integration and canonical wrappers; the older stress did not combine
those later changes.

## Required next oracle/proposal checks (unexecuted)

- Global Array overwritten by a throwing function/Proxy; original realm Array
  captured before mutation. Verify actual selected-realm prototype/instanceof.
- Inherited index0/index1 setters and throwing constructor/Symbol.toStringTag/
  __proto__ getters. Construction, canonicalization and remote wrapping must not
  call them; own result entries preserve identities.
- HTMLFormElement.prototype and HTMLFormControlsCollection.prototype: connected,
  detached, constructor-created and iframe forms/controls. Every public member
  must be exactly the wrapper returned by the normal DOM API, never the raw target.
- Ordinary fake-prototype objects, hostile implementation-symbol getters and
  authored/revoked Proxy chains; counters remain untouched and ordinary identities
  survive. Querying a public Proxy itself still finds its real direct inheritor.
- A prototype borrowed through a different live page/frame/world handle; establish
  native result-array authority. Include host-created DOM and Fetch prototypes
  and explicit rejection of unavailable actual worlds/unowned host prototypes.
- Each raw/public/visit/depth/time limit: explicit whole-call error, then a valid
  successful call proving cleanup. No GC-timing assertions or truncated fallback.
- Real CDP object-group mutation/release, stale prototype handles, retained old
  contexts, navigation/disposal and the newly integrated real checkpoint scheduler
  on both exact Node versions, always isolated with core0/external deadlines.

No item above is represented as a passing runtime result by this source-only plan.
