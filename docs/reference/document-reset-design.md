# In-place document reset: proposed ownership and parser design

This is an isolated design, not a production change or a full reset compatibility
claim. Prototype tests and one paired held-blocker control are now recorded;
the prototypes remain uninstalled.
The existing paired evidence is parser-reset-native.json and
parser-reset-candidate.json. The native post-load observation establishes that
open keeps the Document identity, clears its tree/listeners, sets loading, and
shares parser state between subsequent write calls until close.

## Retain the realm and distinguish its parse cycle

The existing Page.documentAbort represents a Window/Document installation
lifetime. Aborting it would also dispose public MutationObservers, Fetch/XHR,
workers, shadow DOM, form/navigation hooks, blob URLs and other realm APIs.
That is too broad for the observed same-Window, same-Document open operation.

Introduce a separate parse-cycle object owned by the classic document record:

```js
{
  generation,
  kind: 'network' | 'write',
  parser,
  controller,
  closeRequested,
  resources,
  resourceAbort,
  readiness,
}
```

Every parser feed, blocker, resume callback and finish callback captures this
cycle and checks record.cycle === cycle in addition to existing realm activity.
Reset aborts only the superseded controller and applies the measured cancellation
policy to its DOM-resource requests. It does not abort Page.documentAbort,
replace JSDOM, replace globalThis, or create a second Document.

Document.open's already implemented parser-script nesting no-op stays ahead of
reset. XML/custom-element dynamic-markup exceptions and inactive-document rules
must be checked explicitly before any mutation. Their gaps are not solved by a
new readyState getter or a false success flag.

## Real persistent write-created parser

The initial parse5.parse wrapper already receives jsdom's configured tree
adapter. Capture its options as a parser factory recipe, not the old adapter's
mutable _currentElement. A new script-created parser uses a fresh instance of
that pinned adapter class targeting the existing Document implementation. Its
document result must be the same implementation and its VM remains the existing
Window VM context. Reuse the current classic script handler and evaluator.

open clears the actual tree, sets DocumentImpl.readyState to loading through
its existing setter, and installs an empty open-ended parser. It does not feed
EOF. Each top-level write sends real input to that parser with EOF false;
therefore start tags, attributes and the open-elements stack survive calls.
close requests one real EOF and then runs the existing genuine Document.close
queue/lifecycle path only when that parser finishes and its blocker is clear.

write-created-parser.mjs is an uninstalled controller prototype. It receives an
actual parser rather than constructing nodes. It supports incremental writes,
real tokenizer pause/resume, cancellation, and EOF requested during a script.
Its enterScript/leaveScript hooks concatenate reentrant writes in call order
and insert their actual bytes at the tokenizer's current position when the
outer script callback unwinds. parse5's own inLoop guard prevents reentering the
tree builder. Completion requires parser.stopped after actual EOF. Neither DOM
records nor parser completion are invented.

The prototype has passed six isolated real-parse5 controller tests. It is not
yet wired into an isolated full runtime.
Written external scripts require a separate observation: resuming a paused
parser only after its real external callback preserves queued input order, but
does not by itself provide native synchronous nested-external execution. This
known gap must remain explicit rather than blocking Node's host event loop.

## Listener erasure needs explicit internal ownership

jsdom's EventTargetImpl stores both authored and host listeners in the same
_eventListeners arrays. Its handler accessors additionally use _eventHandlers
and _registeredHandlers. Clearing only the event-listener dictionary leaves
onload/onclick values alive. Replacing arrays without emptying them also leaves
current-dispatch copies referencing the old array; removal should mutate the
actual registered arrays so ongoing dispatch observes erased listeners.

Source audit identifies host behavior that must survive reset:

- browser.js registers hashchange reconciliation plus navigation DCL/load waits.
- performance.js registers readiness/DCL/load bookkeeping.
- intersection.js and resize-observer.js use scroll/resize/load invalidation.
- frames.js forwards child DCL/load/error through Window listeners.
- jsdom browser/Window.js installs a nextTick Document-load-to-Window-load and
  pageshow bridge. Erasing this bridge breaks real Window load delivery.
- forms.js/mutations.js/observer modules register unload cleanup listeners.

Proposed ownership API: addInternalEventListener/withInternalEventListeners
marks the actual private listener record in a WeakSet while known runtime
installation/late registration executes. It does not infer ownership from
function source, realm, callback names or call stacks. Public listeners from
newDocumentScripts remain authored. Late Page navigation waits and frame
lifecycle forwarding need explicit registration through this API.

During open, walk the actual shadow-including Document subtree, including closed
shadow roots accessible to the engine, before removing nodes. Splice authored
listeners out of each target's real arrays and clear public handler state while
retaining marked host listeners. Public/internal MutationObserver registrations
are separate and remain live: real removals/additions continue generating their
normal records in the existing observer checkpoint scheduler.

The jsdom load bridge needs deliberate ownership. For a first strictly post-load
implementation, erasing its old unmarked callback and installing an owned bridge
with jsdom's actual trusted event helpers is practical. A reset before its
original nextTick registration could produce a duplicate bridge, so the broader
loading-reset path needs a pinned, explicit bridge integration rather than a
heuristic callback match. The raw-CDP control below establishes whether that
broader path can be observed against native.

## Resource queues: replace or retarget every owner coherently

DocumentImpl constructs _queue, _deferQueue, _asyncQueue and _requestManager.
PerDocumentResourceLoader captures those exact objects in its constructor.
Replacing just Document fields cannot work: later scripts would still enter
old queues through the loader. A reset cycle should create fresh resource
queues and a matching per-document loader (or atomically retarget all of its
captured fields), retaining its underlying PageResources transport and cookie
jar. Old callbacks capture their old cycle and cannot finish or resume the new
parser. Old detached elements may still be held by user code; their callbacks
must follow the measured cancellation/event policy, not be repurposed.

The reset policy concerns DOM resources managed by these queues, not all
page.fetch calls. Ordinary JS Fetch/XHR/worker requests have different owners.
Their preservation or cancellation must not be inferred merely from a shared
Page object. Iframe disconnection continues through the real DOM detach hooks,
which already own child-frame teardown.

## Module lifecycle is not a one-line reinstallation

modules.js currently has one installation-scoped cache/import-map registry,
seen-script WeakSet, deferred-queue gate, active-task set and ready promise.
Its internal observer starts newly discovered modules after the first begin.
This observer would otherwise start new parser-inserted modules before the
write-created parser's close boundary. Reinstalling the whole adapter could
also duplicate observers, discard the realm's module map or abort legitimate
already-running top-level-await continuations.

Proposed module controller split:

1. Retain realm-level VM context, module map, import maps and public constructors.
2. Add beginParseCycle(newDeferQueue, cycle), with a new graph-initiation gate and
   a readiness promise for roots associated with that parse cycle.
3. Keep the existing internal observer, but classify real parser-inserted script
   implementations against their cycle. Defer those roots to its EOF/defer gate;
   continue handling truly dynamic module insertions through their actual path.
4. Detach old-cycle lifecycle blocking without blanket-canceling already running
   module evaluations. Native controls must settle whether pending old fetches,
   script load/error events, import-map state and module-map reuse persist.

The current Browser captures page.moduleReady during Page.navigate. A new
in-place parse readiness promise therefore needs explicit Page/frame lifecycle
integration rather than silently replacing a value that a pending navigation
already captured. This is a concrete common-runtime integration requirement,
not a request for user permission.

## Replacement control for the earlier timer ambiguity

parser-reset-cdp-control.mjs sends Page.navigate
without awaiting its result, waits for an owned HTTP server to receive the
external script request, keeps its body withheld, then sends Runtime.evaluate
as another raw-CDP command to call open/write/close. It records complete command
responses and a host timeline, including peer cancellation and body release.

A 1000ms host safety release prevents a deadlock if native cannot service that
second command while the parser waits. The control is considered reached only
if the reset response reports loading and oldScriptRan false before the host
released the body. Otherwise the result is explicitly inconclusive. Both modes
use owned port0 HTTP/CDP resources, bounded command deadlines and full cleanup.

## Concrete next integration choices

The design defaults to preserving realm-level adapters and module state while
introducing narrowly owned parse cycles. Before a production patch, the root
needs to choose where to expose host-listener ownership and module-cycle
controllers in its reusable prepareWindow path. The native controls should
resolve cancellation and module-map reuse before their policies are fixed.
No broad adapter abort or unmeasured reset compatibility is proposed.

## Artifacts and bounded validation

document-reset-proposal.json identifies a copied source/native runtime with
uninstalled write-created-parser.js and listener-ownership.js prototypes. Neither
prototype is imported by that runtime yet. The listener prototype implements the
explicit scope/record ownership and in-place erasure described above; it leaves
the actual Window load bridge to the later integration step.

Six real-parse5 controller checks and four actual-JSDOM listener checks are
prepared in write-created-parser-tests.mjs and listener-ownership-tests.mjs.
They cover persistent/split/reentrant input, actual paused EOF, generation
supersession, public-vs-host listener removal, active dispatch erasure, closed
shadow descendants, live MutationObserver delivery, and cross-Window ownership.
After checkpoint 085510c was pushed and the coordinator released diagnostics,
all ten checks passed using the prepared Node executable and
--experimental-vm-modules. Exact arguments, source hashes and totals are in
document-reset-prototype-tests.json. The raw-CDP controls then ran sequentially
against the verified native executable and a fresh copied current candidate.

Native timeline: the held script request and reset command were at 231ms; the
1000ms host safety timer released the body at 1232ms; the reset response arrived
at 1233ms. Its before snapshot was complete, oldScriptRan true and stale true.
Therefore controlReachedBlockedParser is false and native cancellation remains
**inconclusive**. Its later open still returned the same Document, set loading,
and produced the fresh replacement markup. The artifact preserves all actual
CDP lifecycle events, including the reset's second load/DCL notification.

Current-candidate timeline: held request/reset command at 419ms, reset response
at 428ms while the body was still withheld. Its before state was loading,
oldScriptRan false, stale false. The connection remained open after reset
(peerAlreadyClosed false); the host released its body after that response, and
the old script then set oldScriptRan true. This reaches a genuine held-parser
reset in the candidate and establishes that its current reset does not cancel
that request/execution. The native run does not establish the corresponding
cancellation policy, so these observations are not presented as a passing
native comparison or a complete reset fix.

Both controls directly checked Document identity and retained a saved global
Document reference; explicit constructor/Window-prototype identity was not a
separate assertion. The isolated design retains the existing JSDOM/VM context,
but that broader realm guarantee still needs full-runtime integration tests.
Raw timelines, complete responses, events, source hashes and cleanup are in
parser-reset-cdp-native.json and parser-reset-cdp-candidate.json. The frozen
candidate manifest parser-reset-cdp-candidate-snapshot.json pins checkpoint
085510c and every copied source hash. Both controls ended with all owned
contexts, connections, processes/services, timers and HTTP servers closed.

The candidate process also emitted Node's 11-close-listener threshold warning;
the control completed and cleaned up. That warning alone is not evidence of
a retained-object leak. No runtime code was changed to suppress it.

Future integration tests should also run the unchanged upstream document/write,
frames/document_write and custom_elements/reentrant_document_{write,close}
fixtures. Their existing assertions exercise actual realm ownership, persistent
plaintext writes, module close flushing and nested parser close/write behavior.
