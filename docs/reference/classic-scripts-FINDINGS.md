# Independent classic-script lifecycle

The source baseline was copied into
`/tmp/red-panda-classic-baseline.z5bsVy`, with its src/native/package files made
read-only before investigation. The probe imports that copy. An optional adapter
is integrated only through a test-process wrapper around its prepareWindow;
neither the baseline files nor the live common runtime are edited.

`classic-scripts-probe.mjs` serves unchanged upstream fixtures on an owned port0
HTTP server and compares them against the verified reference executable whose
SHA-256 is `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
It waits for document completion, allows100ms for queued tasks before invoking
the original harness, and then polls its original testing.assertOk method.
The external-runner flag selects the harness's documented external-runner path;
assertions and fixture bodies are unchanged. Every owned context, page, socket,
reference process and fixture server was closed. These are bounded local CDP
observations, not REA evidence-envelope artifacts.

The JSON artifacts record fixture SHA-256 values, frozen Browser/module source
digests, adapter digest, diagnostics and verdicts:

| Unchanged fixture | Frozen baseline | With adapter | Native reference |
| --- | --- | --- | --- |
| async_text.html | FAIL | PASS | PASS |
| clone_already_started.html | FAIL | PASS | PASS |
| dynamic_inline.html | FAIL | FAIL: observer order | PASS |
| load_event.html | FAIL | PASS | PASS |
| load_event_timer.html | PASS | PASS | PASS |
| preload.html | FAIL | PASS | PASS |

See `classic-scripts-baseline.json` and `classic-scripts-adapter.json`. Native
dynamic_inline can fail if the harness is invoked before its timer has settled;
the explicit completion check and100ms settling interval avoid interpreting that
probe-timing artifact as an engine result. The remaining candidate failure is a
different, deterministic ordering mismatch described below.

## Implemented behavior

`installClassicScripts(page, window)` in `src/classic-scripts.js` installs during
beforeParse, after installModuleScripts. It returns `{ dispose }`. Install it for
the main document and actual child-frame facades. It needs the Page fetch
transport for preload bodies and uses documentAbort/window.close for cleanup.

- Dynamically created scripts have force-async enabled. Setting async clears
  that flag and reflects the Boolean attribute. Prepared parser scripts are not
  force-async; unstarted empty parser scripts retain it.
- A document-scoped parse5 parser pauses at real blocking external classic
  scripts. Their bytes still come through the existing jsdom/Page transport.
  Document.close is held until parsing reaches EOF. Actual trusted source load
  or error resumes parsing; a page-created load event cannot release the parser.
  Future DOM elements therefore remain absent while a blocking script is
  pending, rather than merely altering the async getter to satisfy a fixture.
  A parser inline script also waits for an earlier pending external stylesheet;
  its existing resource queue applies that stylesheet before executing it.
- Connected empty scripts can execute when direct Text children are added or
  changed. Dynamic inline classic execution is synchronous, restores the
  inserting currentScript/write context, and delegates through the current
  `_innerEval` handler. The adapter never overwrites that evaluator.
- Src mutation uses normal preparation exactly once. Existing jsdom cloning
  steps already propagate alreadyStarted, so they remain untouched. The clone
  fixture's earlier failure was caused by the original dynamic script being
  deferred, not by a missing clone flag.
- Default dynamic external scripts use the async resource queue; explicit
  async=false preserves fetch-independent execution order. Parser async/defer
  and the separate module/import-map scheduler retain their execution paths.
- Script preload hints start an actual Page.fetch request. Duplicate hints
  share it, and one matching script adopts the fetched body using normal
  decoding/evaluation. URL/crossorigin/referrerpolicy metadata keys prevent
  mismatched adoption. Load/error events follow the real fetch result. Unused
  bodies never execute and never enter the document load-blocking queue.
- Abort/window close cancels owned requests and preload work. Stale scripts do
  not execute, dispatch resource events or resume a disposed parser.

Private hooks compose prior functions and apply only to registered documents:
ScriptImpl `_eval`, `_fetchInternalScript`, `_childTextContentChangeSteps`,
`_attrModified`, `_dispatch`; PerDocumentResourceLoader.fetch;
DocumentImpl.close; parse5.parse; and LinkImpl attach/attribute/dispatch hooks.
The per-realm async descriptor and window close wrapper are also installed.
Unregistered jsdom documents use their prior implementation unchanged.

## Verification and remaining limits

`node --experimental-vm-modules --test test/classic-scripts.test.js` passes19
focused tests. They use owned ephemeral HTTP servers and check actual blocked
network responses, incomplete parsing, async/ordered execution, exceptions,
unstarted text changes, cloning, preload fetch counts/body adoption/nonblocking
behavior, cancellation, disabled JavaScript, child-frame identity and evaluator
composition. The latter test installs a separate `_innerEval` wrapper and proves
that both parser and dynamic scripts still pass through it.

The remaining dynamic_inline failure is precise:

```text
expected inline-0,after-0,inline-1,after-1,promise,mutation,timer
actual   inline-0,after-0,inline-1,after-1,mutation,promise,timer
```

jsdom queues a MutationObserver microtask even when a mutation has no interested
observers. In the fixture, inserting the parent element queues that microtask
before the Promise callback; a later observed child mutation uses the earlier
checkpoint. Fixing this requires independent MutationObserver scheduling work.
This adapter preserves the real mismatch instead of marking the assertion passed.

Complete stylesheet blocking rules, microtask checkpoint semantics,
document.open/reset integration, speculative/module preload scanning, streaming
HTTP document input, and additional CSP/SRI/CORS validation remain outside this
adapter. The initial document body is already buffered by the Page transport;
only its parsing pauses. Its private hooks target pinned jsdom26/parse5 APIs.
This is a reviewable improvement of the measured subset, not complete HTML script
processing or full Lightpanda replication.
