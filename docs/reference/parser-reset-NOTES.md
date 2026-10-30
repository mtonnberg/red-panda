# Document reset and parser reentrancy investigation

This investigation uses source tracing and bounded public runtime observations.
The coordinator released five sequential native/candidate cases after its fixed
conformance cohort finished. No native engine production implementation has been
inspected or copied. Raw results are preserved in parser-reset-native.json and
parser-reset-candidate.json, including all script/HTML hashes and errors.

## Concrete source paths to verify

The integrated classic adapter now captures a Document implementation and checks
it against window.document before continuing a streamed parse. This handles a
closed or replaced Window document. A call to jsdom DocumentImpl.open removes
children from the **same** implementation, however. It does not currently abort
the classic record's parser stream, clear its script blocker, cancel its unused
preloads, or guard existing resource callbacks with a new parser generation.
Therefore the identity guard alone cannot establish that old input is abandoned
after an in-place document reset. The prepared delayed-blocker case checks
actual abandoned resource cancellation and later DOM/execution state.

The pinned jsdom DocumentImpl.write path creates a new div and sets innerHTML
for each call made from a script. It then inserts its children after the script
saved in _writeAfterElement. This does not maintain a tokenizer across split
tokens or a tree-builder stack across writes. Repeated calls also reuse the
same insertion predecessor. Outside a script and while readyState is complete,
each nonempty write clears and reparses the whole Document. The prepared cases
measure the resulting behavior rather than treating the source trace as a
conformance verdict.

The existing classic inline evaluator saves/restores _currentScript and
_writeAfterElement around the composed _innerEval callback. External scripts
use jsdom's existing resource/evaluation path. Any improvement must preserve the
actual VM realm and evaluator, script eligibility, trusted load/error events,
abort handling, and same-document currentScript restoration.

## Why a reset needs more than clearing DOM

Document's _queue/_deferQueue/_asyncQueue are also referenced by its existing
PerDocumentResourceLoader. Replacing only the Document fields would leave new
resource loads using obsolete queues. The module adapter installs its initial
deferred-queue gate and keeps a Document-level observer/cache/ready promise;
indiscriminately replacing queues could strand its initial graph or allow an
old pending graph into the reset document. An isolated proposal must distinguish
the classic parser lifetime from the wider Window/Document installation
lifetime and document any additional integration required for modules.

## Prepared bounded observations

parser-reset-cases.mjs contains five small scenarios:

1. External-script sequential writes, persistent nesting, split tokens, nested
   inline execution, immediate DOM visibility and currentScript restoration.
2. document.open called while an inline parser script is executing.
3. Post-load open/write/write/close, readyState, identity, and listener removal.
4. A task resetting a document while a real delayed external blocker is pending,
   then checking fresh/stale markup, old script execution, and request closure.
5. An external writer introducing another blocking external script, checking
   that original trailing input does not parse ahead of that blocker.

parser-reset-probe.mjs can run those exact sources against a SHA-verified native
binary or an explicitly supplied isolated candidate source/native copy. Native
uses one owned process and a fresh context/target per case. HTTP uses an owned
port0 server. Both modes preserve source hashes and observable JSON results and
clean up pages, connections, delayed response timers and processes they own.
It records observations; it does not inject pass flags or replace the target
engine's assertion logic.

## Bounded results

The verified native SHA-256 was
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
All five observations completed without timeout. Native and candidate resources
were closed before the coordinator started its next full regression suite.

| Case | Native observation | Candidate observation |
| --- | --- | --- |
| Sequential external writes | DOM IDs follow write-call order; separate calls do not preserve section nesting or a split token | Sibling write order reverses; the same section/split-token limitations are observed |
| Inline parser script calls open | Same Document returned; the open call is a no-op; written node and original tail survive | Same Document returned, but original/written nodes and tail are cleared |
| Post-load open/write/write/close | open sets loading and removes document/window listeners; subsequent writes share a parser; both children remain | readyState stays complete; listeners remain; separate writes discard preceding content |
| Task reset with a delayed external script | Timer executes after complete and the old external script already ran | Timer executes while loading and old script still runs afterward |
| Written nested external | Inner external executes before outer document.write returns; trailing root source is not parsed early | Outer write returns first; original trailing source parses before the inner external runs |

The task-reset case does **not** establish a paired stale-feed control: its
before state differs between engines. Its actual results are preserved without
claiming that native cancellation of a still-pending parser was observed.

Native's external fragment-per-call behavior is narrower than a full HTML
streaming parser. Therefore no persistent parser rewrite is proposed for that
path based only on public specifications. A written inline script's own nested
write is also visible at different instants: native reports the nested node
absent immediately after that nested call, then present before the outer call
returns; candidate exposes it immediately. That gap remains explicit.

## First independent proposal

parser-write-proposal.mjs builds an isolated source/native copy and checks each
source substitution before writing parser-write-integration.patch. It does not
edit production. This first proposal targets only the confirmed call-order and
inline-open discrepancies:

- Preserve the actual preceding write's insertion cursor, including nodes
  created by a nested written script, while respecting detached boundaries.
- Track synchronous execution of an active parser script through the existing
  composed evaluator/resource callback. Dynamic nested inline scripts inherit
  that nesting; unrelated async scripts do not receive it merely because some
  other parser script is pending. open returns the existing Document on that
  stack without clearing it.

The native evaluator, currentScript restoration, resource fetching, parser
tokenization, clone flags and trusted event path remain composed in place.
The proposal does not advertise complete document.open support. Post-load
readyState/listener reset and module/resource/parser generation ownership need
a separate lifetime design. Synchronous nested external script execution and
the nested-inline insertion visibility difference also remain unresolved.

After the coordinator released execution, all five focused checks passed on
Node 24.22.1:

```sh
/workspace/shared/rea-tools/node_modules/node/bin/node --experimental-vm-modules --test docs/reference/parser-write-tests.mjs
```

They cover native-observed external call order/currentScript restoration,
the exact direct-inline open observation, stylesheet-delayed inline parser
nesting, a dynamic inline script nested inside an external parser script, and
unwinding the new nesting guard before a later post-load open. The last test
checks only that the new no-op branch has unwound; it does not claim full reset
support.

The five public scenarios then completed sequentially against the isolated
proposal, without timeout, using parser-reset-probe.mjs. Raw outcomes are in
parser-write-proposal-results.json. The external DOM IDs now match the native
call order and the direct inline-open result matches the entire native result.
Native's fragment-per-call section/split-token results remain intact. The
broader post-load reset, pending-parser reset scheduling, synchronous written
external execution and nested-inline insertion-visibility differences remain
in that artifact and are not presented as passing native comparisons.

The unapplied proposal is parser-write-integration.patch; its exact source
SHA-256 is
`bf6b9d6d32f64ea74fe7aefe8d3d070398ee44bdc997bebf2a890167ededf187`
against classic adapter base
`96467fd2d7e497a9f8067455671d195d720dded8165b1c1956e6f96c8d189d73`.
The inspectable isolated source is identified by parser-write-proposal.json.
All owned pages and HTTP servers were closed before notifying the coordinator
that its next runtime checks could proceed. Production/common files remain
unchanged by this proposal.
# Integration status

The bounded write-order/parser-script-open patch is now applied to production.
The five focused checks were converted to `test/parser-write.test.js` and import
the production Browser directly. The combined parser, form, module, frame and
mutation regression run passes 113 tests. Proposal files below preserve the
pre-application investigation. Post-load reset and nested written external
script gaps remain open.
