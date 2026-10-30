# Bounded document.write proposal

Production files were not edited. `integration.patch` and `overlay/src/` contain
four independent source changes. `manifest.json` identifies the frozen base by
every source hash, not just its then-current HEAD `7b30c27`: the base includes
the coordinator's uncommitted fresh-frame/checkpoint/serializer integration.
The `/tmp` base and proposal contain copies of both native add-ons and exact
Node24.19/24.22/26.13 manifests; dependency bytes remain the original node_modules.
`proposal.json` freezes proposed source, patch and evidence hashes.

## Observed failures and behavior

The unchanged `document/write.html` fails its declarative-shadow assertion on
the copied base. `frames/document_write.html` fails retained inactive-document
identity/write-no-op assertions. Both unchanged fixtures pass on the final
proposal with iframe/worker/stylesheet loading enabled and the original external
runner harness. Source fixture hashes and errors are retained in the baseline
and proposed fixture JSONs. No upstream production implementation was copied.

Four bounded public native controls establish retained frame DOM references,
inactive markup operations doing nothing, written declarative shadow creation,
inert ordinary innerHTML in a connected custom element, and script execution
before fragment insertion. A fifth establishes inactive defaultView and nested
contentWindow are null, old nodes remain isConnected, and stale focus does not
change the parent's activeElement. The candidate matches those five JSON
results. Native executable SHA256 and resource arguments are recorded in
`native.json` and `inactive-view-native.json`. All probes use owned port0
servers and report cleanup. Navigation deadline is 5000ms in the public controls;
unchanged-fixture navigation deadline is 3000ms. These are bounded observations,
not a full document.write specification claim.

## Implementation

* `shadow.js` adds a single consumed fragment-parser permit for document.write.
  Its real parse5 script-pop path uses existing classic evaluation before the
  actual fragment splice. Public isConnected remains false in the detached tree.
  The private attached preparation flag is restored immediately. Nested ordinary
  innerHTML does not inherit the permit.
* `classic-scripts.js` splices the real parsed fragment after execution and
  rechecks active document/anchor ownership. Nested written nodes remain detached
  until the outer splice, naturally matching the native visibility timeline.
  Retired loader queues drop their DOM delivery callbacks, still remove the
  actual request and drain the real queue. The real request manager cancels
  pending transports. No synthetic load, readiness or EOF is emitted.
* `frames.js` delegates native Window.close cleanup, skipping only pinned
  jsdom's destructive empty-body replacement. Real trees/references survive;
  timers, requests, listeners and ports still close. Registry-retired numeric
  child Window accessors are removed before native close recursion. The real
  inactive Document's defaultView is then null. The temporary private body
  hook is restored even on errors, and public mutation continues to work.
* `document-reset.js` makes registered inactive HTML markup operations no-op
  after relevant existing XML/custom-element restrictions. Actual live parsers
  and their close/readiness lifecycle are unchanged.

## Validation

`focused-tests.txt`: 10/10 new tests, including native contract comparisons,
actual timer shutdown, retained-tree MutationObserver identity, an actual held
external script plus already-fetched stylesheet queue race, script once/clone
flags, removed insertion anchors, real script exceptions and ordinary inert HTML.
`regression-tests.txt`: 151/151 existing tests across frame/focus/shadow/reset,
classic checkpoint/parser/write/stream, module and selector integration, run
against copied proposal source with `--test-concurrency=1`.

Commands (replace snapshot with proposal.json.snapshot if recreated):

```sh
node --experimental-vm-modules --test proposals/document-write/tests.mjs
node --experimental-vm-modules proposals/document-write/capture.mjs SNAPSHOT proposals/document-write/proposal-fixtures.json document/write.html,frames/document_write.html
node --experimental-vm-modules proposals/document-write/native-probe.mjs candidate SNAPSHOT proposals/document-write/proposal-controls.json
node --experimental-vm-modules proposals/document-write/inactive-view-probe.mjs candidate SNAPSHOT proposals/document-write/inactive-view-proposal.json
```

The tests accept DOCUMENT_WRITE_SNAPSHOT to validate another source snapshot.
The exploratory pre-guard proposal's real queued stylesheet test fails with
`TypeError: Cannot read properties of null (reading '_virtualConsole')` in
jsdom's onErrorWrapped after teardown. The final queue guards fix that lifetime
failure. An earlier exploratory null-defaultView revision also exposed native
Window.close recursion through retired numeric frame accessors (`null.close`);
retiring those accessors fixes cleanup. Neither intermediate result was treated
as native behavior or a passing validation. Two first test failures were test
polling mistakes (body was not yet created); the poll now checks body presence.

## Boundaries

This does not implement the full document.write algorithm. Synchronous nested
external writes, early-loading document.open reset policy, written module and
every custom-element parser edge remain outside these bounded controls. Root
Window teardown retention and all inactive-document baseURI/origin details are
not characterized here. Private hooks depend on pinned jsdom/parse5 internals.
No new full-project, PureScript or multi-Node runtime claim is made by this
proposal; the coordinator owns combined production validation.
