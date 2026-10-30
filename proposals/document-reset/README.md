# Unapplied, strictly post-load document reset proposal

`integration.patch` is a concrete overlay against checkpoint
`085510cd1b546fb0fdee18674761092359bb6b6d`. Production files have not been edited.
`manifest.json` binds its base/proposed source hashes, patch, tests and retained
temporary source copy; `overlay/src` contains the exact tested proposed files.

The proposal applies after the Window's initial real load event. It keeps the
same Window, Document, JavaScript constructors, VM context and Page abort signal.
A new write-created parse cycle uses a real persistent parse5 parser, so writes
share tree-builder/tokenizer state and only close feeds EOF. Reentrant writes
queue actual bytes and reentrant close waits for that parser to unwind.

Explicit internal listener scopes preserve engine registrations while removing
authored event listeners and handler values, including shadow descendants.
MutationObservers continue receiving genuine removal/insertion records. After
the first post-load reset the adapter owns the real Document-to-Window load
bridge; events remain trusted and repeated close is idempotent. Root/frame
lifecycle forwarding follows actual new DCL/load events without clearing the
execution context.

Document and resource-loader queue ownership changes together. New cycles get
fresh resource/defer/async queues and their matching loader/manager. Superseded
parser feeds cannot finish the new parser. Existing ordinary Fetch, pending
module evaluations, module-map/import-map state and other realm adapters remain
alive. Old DOM resource managers with pending work are retained for eventual
Window disposal; no unobserved native open-cancellation policy is invented.

The module controller gains a parse-cycle gate, task set and readiness promise.
New parser-inserted modules wait for that cycle's actual close/defer queue.
Its existing realm module map and single observer survive. Already-running old
dynamic modules can complete independently of fresh-cycle readiness. New native
controls confirm module-map reuse and continuation across a post-load reset.

## Validation

- All **13 new state/lifetime tests pass** in `tests.mjs`: identity, authored
  listener erasure, live observers, split/reentrant input, trusted/idempotent
  lifecycle, real HTTP script/style blockers, deferred modules and cache reuse,
  old top-level-await continuation, ordinary Fetch survival, raw Window close,
  iframe realm/context preservation, hashchange ownership, custom-element
  restrictions/realm exceptions, and disabled scripting.
- All **75 existing** classic-script/module/parser/frame tests pass against the
  final copied runtime; exact output is retained in `existing-tests.txt`.
- `public-scenarios-final.json` matches the saved native post-load reset result,
  including loading, empty tree, removed listeners and persistent child order.
- `module-cycle-native.json` and `module-cycle-candidate.json` match in both
  bounded controls: external module evaluates once across reset, and an already
  running dynamic module plus a fresh module both finish in the retained realm.
- Both unchanged custom-element reentrant write/close fixtures pass on native
  and proposal. `unchanged-fixtures.json` preserves all four fixture verdicts.
  Native uses the source runner's iframe/worker defaults.
- `git apply --check integration.patch` passed against the current working tree.

Commands use the prepared Node 24.22.1 executable with
`--experimental-vm-modules`. The new tests run outside the default test glob
until review. For production integration, copy `tests.mjs` to
`test/document-reset.test.js`, replace its manifest/snapshot Browser import with
the normal `../src/browser.js` import, and retain its owned port0 fixture server.
`build.py` constructs a fresh unintegrated copy; `freeze.py` validates/freezes
the already tested snapshot without rebuilding or changing production.

## Explicit remaining gaps and controls

This is not a complete document.open implementation. Initial loading resets,
fresh blank iframe writes before their first Window load, and writes to inactive
frame Documents retain the prior implementation. Synchronous written external
script execution and network-time nested-inline insertion visibility remain
different from native. Import-map additions after earlier module graphs retain
the existing explicit late-map rejection.

The full upstream document/write fixture still fails its declarative-shadow
fragment-write assertion, and frames/document_write still fails fresh/inactive
frame assertions. `unchanged-fixtures-baseline.json` proves those same failures
on the frozen baseline. They are not presented as passing fixtures or fixed by
this post-load overlay. The first native frame run without enabled frame
resources is separately retained as a configuration mismatch.

The original single-connection held-blocker native result remains inconclusive.
Two further owned second-connection attempts are retained. A direct attach
returned BrowserContextNotLoaded; loading a target on connection two reused a
target identifier in a different realm, where the first fixture's oldScriptRan
global was absent. Neither attempt exercised reset in the actual held realm,
and neither establishes native cancellation policy or explains serialization.

All owned candidate pages/services, native contexts/connections/processes,
HTTP fixture servers and response timers were closed before notifying the root
that runtime diagnostics were quiescent. No native engine production source was
copied; fixtures/public observations and the existing independent runtime are
the behavioral inputs.
