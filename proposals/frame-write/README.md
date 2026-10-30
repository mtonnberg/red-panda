# Unapplied fresh blank iframe write proposal

`integration.patch` changes four modules, with exact base/proposed hashes in
`proposal.json` and the final tested sources in `overlay/src`. The baseline is
the copied combined source identified by `manifest.json`; production files were
not changed. `integration.mjs` is an opt-in, hash-guarded source overlay for
coordinated testing with the messaging proposal.

Fresh about:blank iframe writes previously used jsdom's inert fragment path
while the placeholder Document's asynchronous close was pending. Scripts stayed
as text and repeated plain-text writes replaced preceding text. This proposal
uses the existing genuine persistent write-created parser in the actual child
Document and VM context.

The literal empty placeholder completes through the real Document.close path,
after its actual empty module graph starts. Its previous queued close cannot
later overwrite the written parser's loading state. The native load-to-frame
bridge is adopted from the explicit empty-placeholder registration phase.
Window factory load-bridge tasks retain explicit host ownership through
AsyncLocalStorage; actual event dispatch suspends that ownership so authored
callbacks and their descendants remain public. No callback source/realm
heuristics are used. Later resets preserve those genuine load bridges.

Before write returns, parse5's real already-consumed pending character token is
emitted to its real tree builder. This makes plain text immediately visible
without adding delimiters, EOF, fabricated nodes, records or readiness getters.
Actual pending tokenizer state continues across split tags/entities and writes.

## Evidence

- Five focused tests pass for actual child scripts/realm identity, plaintext and
  split markup, placeholder retirement, single written lifecycle, public
  listener erasure and deferred module close.
- All 141 copied existing tests pass: frame, reset, classic/module/parser,
  input, selectors, iframe/shadow focus and shadow DOM. Exact output is in
  `existing-tests.txt`.
- All three owned native/proposal controls match exactly in `native.json` and
  `proposal-native-controls.json`: actual initial readyState complete, text and
  script visibility before close, retained child Window/Document, trusted
  DCL/load, two iframe loads (initial placeholder plus written Document), and
  module execution only after close. Native uses explicit iframe/worker flags.
- The messaging agent independently reported the unchanged broadcast_channel
  fixture passing with the messaging overlay plus the initial version of this
  parser overlay. Final native lifecycle calibration preserved its real script
  execution path; combined final-source validation belongs to integration.

The snapshots and source/patch/test hashes are retained for review. New tests
run outside the default production glob until integration. To adopt them, copy
`tests.mjs` to a normal test file and use the ordinary ../src/browser.js import.
`build.py` rebuilds from the immutable captured baseline; `freeze.py` verifies
and freezes the already tested source without rebasing against mutable root.

## Separate configuration finding

The reported data_url_iframe timeout and cross_realm_identity null.form were
caused by the preflight's empty browserArgs, which left CLI iframe resources
disabled. Baseline 085510c and current combined source both pass with iframe
resources enabled, and both reproduce the same failures with resources empty.
The four captures are baseline.json, current.json, baseline-disabled-frames.json
and current-disabled-frames.json. They are not engine regressions or timing
claims, and this patch does not change default resource policy.

Inactive/navigated-away Document retention, arbitrary early network-loading
resets, synchronous written external execution and broader document.write
compatibility remain separate gaps. Empty-placeholder completion is skipped
when authored scripts or pending resources are present. No harness/source
fixture changes or assertion flags substitute for implementation.
