This bounded independent Selection slice preserves genuine existing jsdom Selection/Range objects and actual DOM boundaries. It adds measured direction state, character/word movement, synchronous selectionchange production, private receiver/argument brands, and main/frame/utility realm integration. Range layout/geometry is untouched.

Apply `integration-current.patch` (four files: new `src/selection.js`, new focused tests, narrow browser and world-session imports/install calls). No dependency or native-addon changes are required. The narrow integration was rebased onto current Root, including its text-track/CSS additions, without editing Root production. Combined Root validation remains separate from this frozen scratch.

Final evidence:

- 13 focused tests pass on prepared Node24.22.1, covering actual identity/live Range state, reentrancy, real synchronous events without queued duplicates, captured conversions/private event construction, UTF-16 movement, ASCII word scanning over actual text, genuine tree traversal, deletion, copied-symbol/proxy rejection, frame-local values/borrowed methods, actual teardown boundaries, and utility wrappers sharing real physical state.
- All nine primary Native control groups match structurally, including shape/brands, direction, event timing and state, 420 enum combinations, Unicode code-unit/word movement, element/text/empty-node traversal, movement of existing ranges, invalid calls, and detached/shadow endpoints.
- Four of five extra groups match: nine argument/default/brand cases, direction and event edge cases, word classes, and comments/empty elements. The fifth group is an explicit remaining containsNode mismatch described below.
- All five substantive realm observations match, together with both setup responses. These use an actual same-origin HTTP parent/frame and an actual utility context. Borrowed collapse/extend and modify(extend) ignore foreign-document endpoints; own-frame methods and modify(move) operate on actual foreign state. Utility Selection, Range, node and event wrappers retain real world identity and share document state with main.
- The unchanged upstream `selection.html` passes Native and final candidate with unchanged `testing.js`/fixture hashes, real nonzero harness observations, 15-second diagnostic deadline, 100ms settling, iframe/worker flags, ephemeral fixture origin, and one owned isolated browser. This is a diagnostic compatibility result, not a throughput or full-browser parity claim.

Implementation details that matter for review:

- The original Selection prototype/implementation, generated wrapper identities, Range allocation and live DOM mutation machinery remain in use. Private factory provenance validates actual interfaces; authored prototypes/copied implementation symbols do not become brands.
- Events are produced from genuine internal Event allocation with the measured default isTrusted:false. They dispatch after actual association/direction updates, including successful same-position associations. Live Range boundary changes alone do not dispatch. No fixed event counts, delayed duplicate events, layout surrogates or authored marker properties are used.
- Character movement follows observed UTF-16 units (including surrogate halves); word movement scans the observed ASCII word class. Tree movement uses the actual private DOM tree and real node lengths. Unsupported measured movement granularities are no-ops.
- Selection association hooks are scoped to installed document realms. Teardown disables event delivery while the actual DOM teardown determines retained Range boundary state. There is no pending async Selection task or mutable invocation-depth frame to survive VM interruption.
- Utility integration reuses genuine generated Selection/Range/Node/Event wrappers and a document-backed getSelection() binding. It does not substitute the main wrapper into a utility prototype.

Remaining bounds:

- `containsNode(partial=false)` retains the existing jsdom behavior. Native differs on 10/32 rows in the extra matrix, involving ancestor and boundary-adjacent nodes; all 32 partial=true rows match. Exact rows are retained in `verification.json`. The implemented partial test uses actual boundary intersection and fixes the unchanged fixture's parent-content case. No special case was added for the observed Node identities.
- The full IDL argument-conversion/error-message matrix, other cross-document borrowed operations, global binding descriptor placement, mutation/reparenting/shadow cases beyond the controls, and retained-world behavior beyond the focused owned teardown check are not exhaustively calibrated. Existing delegated generated methods continue their existing argument conversions.
- No sentence/line/paragraph layout movement or Range geometry is implemented by this patch. Native's measured unsupported movement names remain no-ops.
- Earlier about:blank and opaque data-URL frame probes are preserved as setup failures. Native's opaque data URL frame had null contentDocument; those errors are not positive frame evidence. Final frame controls use the owned same-origin HTTP fixture.

The immutable patch/leaves, full scratch source graph, exact native binary and helper identities, probe/report hashes, bounded commands and outcomes are in `integration-manifest.json`, `source-freeze.json`, and `verification.json`. No broad/heap/PureScript suites were run by this worker; Root owns final serial combined validation.
