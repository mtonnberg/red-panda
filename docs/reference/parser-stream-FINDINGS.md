# Genuine incremental parser feeding

The controller is now integrated in `src/classic-scripts.js`. The proposal
artifacts below preserve the pre-integration investigation; the patch is retained
as historical evidence and must not be applied again. The default parser tests
now import the production adapter directly. The combined parser, forms, classic
scripts, modules, frames and mutation-observer regression run passes 103 tests.
The source document is buffered by the transport; this streams parser work.

`src/parser-stream.js` exports:

```js
createParserStream(parser, markup, {
  chunkSize: 4096,
  threshold: 16384,
  active: () => true,
  signal,
  onComplete,
  onError,
});
```

The returned controller has start(), resume(), abort(), completion and a readonly
state snapshot. Completion reports complete/aborted/error distinctly. The
diagnostic counters count actual tokenizer writes and UTF16 code units fed;
they are not DOM or observer counts.

Sources at or below16384 UTF16 code units retain one synchronous tokenizer
write. Larger sources receive bounded4096-unit writes with real setImmediate
task yields. This allows real observer microtasks and other queued work between
parsing slices. Tokenizer hibernation preserves split tags, entities and Unicode
surrogate pairs. A paused tokenizer receives no new input until resume drains
its existing buffered remainder; feeding then continues beyond that chunk.
Only the final source slice sets the tokenizer EOF flag. Completion requires
actual parser EOF rather than merely reaching a character counter.

Abort cancels a pending continuation task, pauses the tokenizer and reports
aborted without invoking onComplete or inventing EOF. The active predicate and
AbortSignal are checked before further work. Asynchronous parser failures report
through onError/completion; a first synchronous write failure still propagates
to its caller.

## Native control

The unchanged upstream `mutation_observer/parser_chunks.html` contains3000
`<i>` nodes. Its SHA-256 is
`24dfb63953064a691d41b0d81c491bac8bff599ee1419c33bc593ffc7aaaedec`.
An owned port0 HTTP fixture server and raw CDP were used against the verified
official binary with SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
The native unchanged harness passed, recording actual batch lengths
`[1020,1024,961,4]`, first readyState `loading`, and exact I-node count3000.
The raw local observation is preserved in `parser-stream-native-control.json`.
The context, socket, owned process and fixture server were closed.

The implementation does not copy those counts or fabricate MutationRecords.
Its character budget is an independent bounded scheduling choice, not a claim
to reproduce native's exact record-budget boundaries.

## Reviewable integration without production edits

`docs/reference/parser-stream-integration.patch` is an **unapplied** proposal for
the existing classic-script adapter. It connects five lifecycle points:

1. Start the controller where the adapter currently writes the complete markup.
2. Resume the controller after a real script/style blocker instead of only
   resuming the tokenizer and checking EOF once.
3. Abort the controller when the document adapter is disposed.
4. Let disabled-JavaScript documents use the same genuine DOM feed while the
   existing scripting eligibility checks prevent execution and script fetching.
5. Require the live Window document implementation to equal the captured
   document before further parser/resource work. This prevents a queued host
   setImmediate feed after raw window.close deletes window.document, even when
   a saved raw close function bypasses the adapter's cleanup hook.

The classic adapter retains blocking-script/style detection, its existing
evaluator, actual resource loading, Document.close gating and frame ownership.
onComplete runs its existing finishParser; onError currently reports pageError.
Production adoption should also decide how fatal asynchronous parser errors
reject a pending navigation rather than leaving it to time out.

The temporary test helper checked each substitution against the pre-integration
source before importing an ignored adapter. That helper was removed when the
tests switched to the production adapter. The original proposal copy and its path
remain recorded in `parser-stream-proposal.json`. The current
`parser-stream-probe.mjs` checks an unchanged copy of the integrated runtime and
does not regenerate or overwrite those historical proposal artifacts.

## Completed verification

After the root released its coordinated diagnostic pause,
`/workspace/shared/rea-tools/node_modules/node/bin/node --experimental-vm-modules --test test/parser-stream.test.js`
passed all 14 focused tests on Node 24.22.1. They cover:

- One synchronous small-document parse and exactly one completion callback.
- Real parse5 output equivalence across split entities/tags/UTF16 boundaries.
- Actual tokenizer pause/resume with buffered remainder and later input.
- Public MutationObserver deliveries from real parser work while loading,
  at least three bulk slices, and an exact3000-node total.
- Real HTTP script/style blockers, held EOF close, inline document.write
  visibility/order, disabled scripting and actual srcdoc child contexts.
- Abort, Window close, cancellation of future DOM work and explicit validation.
- DOM counts sampled immediately after close and compared with later ticks,
  including a saved raw close bypassing the adapter hook while page.closed and
  the Page abort signal remain unchanged.
- A real pending unused preload HTTP request disconnecting on ordinary Window
  close, with neither late load nor error dispatched afterward.

The original candidate probe copied the then-current src/native/package files to an owned
temporary runtime, replaced only its classic adapter with the proposal, and
served unchanged upstream fixtures on an owned port0 HTTP server. The proposal
source SHA-256 is
`96467fd2d7e497a9f8067455671d195d720dded8165b1c1956e6f96c8d189d73`.
Its base classic adapter SHA-256 is
`a26770f72f6e230168beacfefdf24466f3cf7c9678ef75228aa5e6dac39c8442`.
The candidate-only script requires that pre-integration base and checks all
substitutions before constructing the copy.

All seven unchanged fixture assertions passed in the final sequential run:
parser_chunks, async_text, clone_already_started, dynamic_inline, load_event,
load_event_timer and preload. The parser fixture recorded genuine batch lengths
`[475,586,585,585,585,189,4]`, first readyState `loading`, and both counted and DOM
I-node totals 3000. No page or console errors were captured. Exact fixture hashes,
source-copy path, and individual outcomes are in
`parser-stream-proposal-results.json`; the retained copy is also identified by
`parser-stream-proposal.json`. The seven elapsed times, including a 100ms
settling interval per fixture, were 390,144,144,153,187,131,134ms.

The original attempt is preserved separately in
`parser-stream-proposal-first-attempt.json`: its parser fixture navigation timed
out while the same six classic fixtures passed. Both full-runtime attempts used
the same 5000ms navigation deadline. A subsequent single-fixture diagnostic with
a 3000ms deadline completed with actual parser EOF, no paused tokenizer, no
blocker or outstanding script requests, and the same DOM/batch results. The
cause of the original timeout is unestablished. No timeout cause or broad timing
guarantee is inferred from the successful retry. Native controls were reused
from the recorded artifacts, without another native process launch.

The prototype's candidate probe used Red Panda's ordinary user agent, so its
seven successful assertions ran the harness's other-browser branch. They must
not be treated as a paired native-branch conformance result. The later frozen
41-fixture comparison explicitly sets `Lightpanda/1.0` on both targets and
verifies `testing.IS_TEST_RUNNER === true`; its parser result is the integration
conformance evidence. The current standalone probe also selects and checks that
branch. Historical raw proposal outcomes remain unchanged.

All owned candidate pages and HTTP servers were closed. Integration validation
is recorded separately from these original proposal results.

The source document remains buffered by the Page transport; this prototype
streams parser work, not socket bytes. Complete parser microtask checkpoints,
external-script document.write reentrancy and document.open/reset need additional
native comparisons. The default task/chunk quantum is bounded and configurable,
not an exact native scheduling guarantee.
