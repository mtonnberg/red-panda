# Remaining browser compatibility inventory

This read-only audit uses pinned target commit
`948d773786380bae36f046639fc61e2ddddd212a` and verified native binary SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
It does not introduce production changes or start heap-enumeration jobs.
[compatibility-remaining-audit.json](compatibility-remaining-audit.json) retains
source/checkpoint hashes and complete lists; its independently rerunnable producer
is [compatibility-remaining-audit.py](compatibility-remaining-audit.py).

## Ranked work

| Priority | Concrete gap | Evidence and next acceptance |
|---|---|---|
|1|Caller group/world contracts before heap-query integration|New non-heap native/candidate controls below establish real differences. Root owns the fixes; rerun those controls after integration.|
|2|Actual isolated JavaScript worlds|A native isolated-world global stays absent in the default world; candidate exposes it. An alternate context ID over the same Window is insufficient. Preserve this explicit gap when assessing prototype/result realms.|
|3|Heap-query bridge ownership and selected result realm|Keep `Runtime.queryObjects` unsupported until actual DOM/Fetch bridge prototypes, canonical form-wrapper identity, selected-realm Array creation and lifecycle controls pass. Existing independent backend experiments are bounded positive evidence, not public route acceptance.|
|4|Freeze and rerun integrated current cohorts|Latest41 and broader32 checkpoints bind earlier distinct source snapshots. Their union covers73 registered paths; component proposals and mutable preflights do not establish a new immutable combined pass rate.|
|5|Revisit historical DOM/SVG/events and newly uncovered CSS/realm behavior|Two explicit16-case default-resource cohorts are provided in `compatibility-next-cohorts.json`; both require paired native controls and unchanged assertions.|
|6|Implement exact external-sheet and other stateful fixture transport|The generic helper lacks external-sheet encodings/delays, SSE, image/status/count families, script charset/count routes and many redirect/timing endpoints. Missing endpoints must be recorded independently from browser API failures.|
|7|Broaden public automation surfaces and CLI flags|Static dispatch covers91 of164 names in the retained native CDP schema. This is a source inventory, not91 verified contracts. Native-only flags and currently absent methods are listed in the JSON; prioritize the observed workflows below.|

## Public CDP caller controls

[protocol-caller-probe.mjs](protocol-caller-probe.mjs) starts one owned native
process and one owned about:blank context, never calls `queryObjects`, and closes
only its resources. Separate runs capture native and candidate responses in
`protocol-caller-native.json` and `protocol-caller-candidate.json`.
[protocol-caller-comparison.json](protocol-caller-comparison.json) extracts the
bounded observations. Both processes returned the final42 heartbeat.

| Control | Native | Candidate at capture |
|---|---|---|
|Omitted result group for `callFunctionOn(receiver)`|Inherits receiver group; release invalidates returned handle|Returned handle survives receiver-group release|
|Explicit result group|Survives release of receiver's other group|Same observed behavior|
|Isolated-world global assignment, then default-world `typeof`|`undefined`|`number`|
|Default-world receiver plus isolated-world object argument|-32000 `Argument should belong to the same JavaScript world as target object`|Executes and returns the isolated value|
|Both objectId and executionContextId|-32602 `ObjectId, executionContextId and uniqueContextId must mutually exclude each other`|Executes|
|Unknown `getProperties` handle|-32000 `Invalid remote object id`|-32602 `Cannot find object with given id`|
|Handle released with its group, later `getProperties`|-32000 `Could not find object with given id`|Group-inheritance control above prevents invalidation|

The native ordinary property response also includes actual `[[Prototype]]`
internal metadata; the candidate returns an empty internalProperties array.
Root was notified before these artifacts were packaged and is implementing the
ordinary group/argument/error corrections. These are preserved pre-fix controls,
not assertions that successor code remains broken. Candidate source was mutable;
the launcher digest does not bind its imports.

## queryObjects contract matrix

Existing `runtime-query-native*.json` public observations establish actual
transitive descendants, exclusion of the prototype itself, mutation through real
returned handles, null-prototype empty results, Proxy stopping without traps,
result-group invalidation and isolated-world context components in object IDs.
Missing parameters return-32602 `Invalid parameters`; unknown prototype handles
return-32000 `Invalid remote object id`. They do not establish every caller or
host-bridge contract.

The next reviewable acceptance cases are:

1. Resolve a session-owned prototype handle first; derive the active root/frame
   and realm from that entry. Reject released, detached, navigated and foreign
   session handles before backend invocation. Do not initialize the default
   Runtime state merely because queryObjects has no explicit context parameter.
2. Return an actual Array in the selected realm with genuine original members,
   including foreign-realm descendants. Verify `Array.prototype` identity and
   `instanceof` in root, frame and isolated worlds. Use a trusted selected-realm
   anchor; authored `window.Array`, constructor and prototype getters must not
   choose the host/default realm.
3. Probe host-created `Node`, `Element`, HTMLFormElement, collection and Fetch
   prototypes independently. Public form wrappers are Proxies while raw targets
   inherit bridge prototypes: canonicalization needs a private factory-owned
   identity mapping. A page object inheriting a DOM prototype must retain its own
   identity; copied implementation symbols must not confer ownership.
4. Preserve observed Proxy stopping and trap silence, including revoked proxies,
   direct descendants of a requested Proxy, and own `__proto__` data/accessor
   decoys. Do not silently traverse through proxies to their targets.
5. Register the result array and property/call-derived handles in the requested
   result group. Release that group without releasing the prototype's other
   group. Include the newly observed ordinary callFunctionOn inheritance case.
6. Repeat real query/mutation/group/release across root navigation, frame removal,
   document reset and retained old contexts on both pinned Node versions. Hard
   external deadlines and explicit overflow failures must remain visible; never
   publish a truncated successful array.

Named-context backend diagnostics previously completed4cycles/41queries on each
runtime, unlike earlier crashing marker-selector experiments. The retained
runtime-query contract/design documents describe those distinct milestones. No
new heap runtime work was duplicated here; root/MCP owns the next checkpoints.

## Registration and route audit

All574 fixture hashes and158 distinct registration-source hashes still match the
original inventory.216 active literal htmlRunner calls resolve455 unique HTML
fixtures.321 are tagged and134 are untagged; the runner enumerates directory
children without requiring tags or recursion. Conditional compilation/native test
selection was not compiled during this static audit.

| Exact registration profile | Unique fixtures |
|---|---:|
|iframe+worker,2000ms, no feature/preload|440|
|stylesheet only,2000ms|5|
|beacon+iframe,2000ms|1|
|image only,2000ms|1|
|iframe+worker plus exact inject preload,2000ms|1|
|iframe+worker,8000ms, no experimental feature|4|
|iframe+worker plus serviceworker,2000ms|2|
|iframe+worker plus serviceworker,8000ms|1|

The14 option-override calls expand to15 nondefault fixtures. Resource overrides
replace the whole struct: stylesheet-only does not also enable iframe/worker.
The four8s nonexperimental paths are dedicated Worker2, SharedWorker1 and the
ServiceWorker-disabled control1. Enabled service worker/cache controls remain
separate configurations. The injection literal is
`window.__injected = true; window.__injectValue = 42;`.

A blanket455 run with the current uniform runner defaults cannot prove these
profiles. The generic runner records `fixtureSpecificOptionsVerified:false` and
has no per-selection injection/feature table. Native registration2000/8000ms
budgets also differ from larger instrumented diagnostic deadlines; record both.
Keep canonical9582 origin requirements and transitive resource hashes explicit.

Across the eight named retained checkpoints,226 distinct registered paths have
selected fixture evidence and229 do not. Latest41+broader32 cover73, leaving382
outside those two snapshots. These are selected-checkpoint counts only: later
component/native preflights, unit tests and current mutable changes are not
silently counted as immutable fixture passes.36 historical native-passing
candidate nonpasses remain outside those73; concrete paths are listed in JSON.

The original broader32 compression native failure coincided with five missing
`POST /echo_brotli`405 responses. Root subsequently implemented the genuine route
and raw-byte/decode regression: `compression-route-native-recheck.json` now
passes the unchanged native fixture, and `dom-values-integration-preflight.json`
records candidate success. Preserve the older missing-route failure as evidence;
it is no longer an unresolved browser diagnosis.

Exact missing route checks and source line locations are retained, with an
explicit warning: literal href/src strings can be value-only tests, and generated
or transitive requests can evade the static scan. Endpoint presence alone does
not prove status/body/header/chunk/timing equivalence.

## Next cohorts and CLI scope

[compatibility-next-cohorts.json](compatibility-next-cohorts.json) provides exact
hash-bound selections: historical DOM/SVG/events16; CSS/realm/custom elements16;
external stylesheet5; and10 paths split by their registration options. None is
claimed executed by this audit. Log unsupported routes and nonpassing native
controls; do not drop them to improve a pass count.

The current CLI already defaults to no dump and5,000ms; real native and candidate captures confirm those option values. They do not establish identical timeout/exit behavior: native can emit a pending-navigation result with status0 and error:null at the wait deadline. The isolated `cli-proposal.patch` covers optional bare dump, wait-script-file, conditional wait readiness, fixed HTTP headers and verbatim text output; it remains separate from production until root applies it. Remaining work includes `networkidle`/`networkalmostidle`, real `--terminate-ms`, `--with-frames`, image resource loading and locale/timezone controls. The pinned help and new actual held-frame controls establish that implicit predicate readiness returns before frame load; the current source still defaults to load until the proposed integration is applied. Hard termination must be real execution
termination, not merely a rejected wait. HTTP headers/proxy/cache/transport caps,
resource filters, metrics and other native common flags are separately listed as
parser gaps; their existence in help does not supply a verified implementation.

The164-command schema also includes currently absent Fetch interception,
Accessibility, LP automation helpers, file inputs, dialog handling, network-body
and cookie operations. Some accepted dispatches currently return empty success
without effects, including emulated media and cache-disabled controls. Pair each
chosen workflow with an actual native observation before expanding claims.
