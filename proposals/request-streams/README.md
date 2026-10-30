# Independent Request stream-body proposal

This reviewable patch is based on the current uncommitted Fetch value work, not an older committed version. It adds `src/request-stream-state.js`, scoped call-site changes in Fetch/Streams, and ten tests. Production/common files were not edited during investigation. Apply `request-streams.patch` only after reconciling any later root edits; `base/` and `candidate/` retain exact source snapshots. `git apply --check` passes against the captured current baseline. No Browser installer, dependency, native build, configuration, or Puppeteer code changes are needed. Restart the Node process after applying normal ES module edits.

## What is implemented

Request construction accepts a genuine realm ReadableStream without reading duplex, preserves the exact original source as `.body`, and does not synthesize a content-type. Body bytes are extracted on first actual use. A source that is still open, errored, locked, or has an unsupported queued chunk fails with the measured realm TypeError without inventing completion, locking it, or marking the Request used.

The private weak registry observes successful operations on real controllers/readers. It records actual enqueued values and tracks closure, errors, pending reads, cancellation, and externally invoked reads. It neither accesses Node's undocumented stream symbols nor stringifies source objects to guess queue state. The genuine native controller desiredSize getter detects asynchronous source errors without adding promise handlers, rereading then getters, or changing returned promises.

For a known closed queue, every real queued chunk must convert successfully before any mutation. String chunks encode actual UTF8; ArrayBuffer and views use the existing body extraction with actual byte ranges. Actual Node reader.read operations then drain the real queue. A direct body consumer retains the real reader lock and marks only its own Request used synchronously. Existing NativeRequest body consumers parse/return the resulting actual bytes in the page realm.

Native clone semantics differ from ordinary tee: clone synchronously drains the closed queue, releases the actual lock, leaves the original Request unused and `.body` identity unchanged, and stores an independent byte snapshot for the original and copy. A subsequent real source read/cancel invalidates the original cached-read path with the measured disturbed/locked error. Real fetch uploads also drain and release the source but do not cache bytes on the caller's Request. The caller remains unused; the emptied source queue is observable through a real reader.

The registry is keyed by weak maps, retains original chunk identity while it remains genuinely queued, clears references on consumption/error/cancellation/disposal, and keeps its controller reference weak. Releasing a pending reader removes the abandoned pending-read observation, so later enqueues remain available instead of disappearing from the mirror. No fixture-specific data, fabricated callback, synthetic HTTP response, or constant assertion result is included.

## Public native evidence

Verified native binary SHA256: `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.

`docs/reference/request-streams-native-observation.json` and `request-streams-extraction-native-observation.json` retain two public vectors with real loopback HTTP uploads. Construction, immediate and final lock/used flags, identity, errors, cloning, carry/override, original-source reads, and server-received bytes are recorded. Native string/BufferSource chunks are accepted; array chunks fail without consuming the real queue.

The final isolated source vectors match all recorded state/error/result/byte fields: see `request-streams-final-source-differential.json`. Raw HTTP headers are retained but explicitly excluded from this scoped equality check because the isolated adapter uses Node's network branding while the native browser uses its own production headers. Content-type absence and exact received bytes are independently asserted by the upload tests. This is not a claim of full HTTP header compatibility.

The probe is reproducible with an owned output path:

```
node docs/reference/request-streams-native-probe.mjs /tmp/request-observation.json
node docs/reference/request-streams-native-probe.mjs /tmp/extraction-observation.json docs/reference/request-streams-extraction-expression.js
```

All public probes use owned random-port servers. They close owned clients, contexts/browsers, and HTTP servers in finally blocks.

## Unchanged fixture and regression results

The unchanged pinned `net/request.html` fixture passes both native and the isolated proposal with original testing.js assertions. Native branch inputs are the same: Lightpanda/1.0 test UA, __lp_external_runner, iframe+worker resources, canonical9582, and100ms settle. `docs/reference/request-streams-fixture-comparison.json` retains exact source, binary, tool, fixture, and harness hashes, raw requests, errors, and outcomes. Both have no console errors. Port9582 was explicitly handed off from root and released after owned cleanup.

Ten new tests pass, including actual upload byte validation, invalid chunks remaining in the real queue, cached clone independence, genuine source drainage, asynchronous completion/errors, and released pending-reader behavior.

The final sequential run of the new tests plus existing Fetch/value/Streams suites is **51/52 passing**. The one failure is retained explicitly: existing test/fetch.test.js169 expects the obsolete `ReadableStream request bodies are unsupported` message for uploading `new Response('upload').body`; the proposal rejects that currently untracked producer with `Failed to read ReadableStream body`. No existing test or upstream assertion was weakened or edited. This proposal should not be described as a completely green full-suite change until root resolves that expectation/producer gap.

## Remaining gaps and evidence limits

The synchronous mirror is established for streams created through the installed realm ReadableStream constructor and public controller/reader operations. Internally produced/adopted response bodies, native transforms/codecs, tee branches, pipe/async-iterator machinery, and calls bypassing the installed adapter do not yet have complete producer instrumentation. Sources whose queues cannot be established reject explicitly rather than returning empty or stale bytes. This includes the old test's new Response(...).body upload source. General stream producer integration is a follow-up requirement, not a passing compatibility claim.

The existing constructor still has broader RequestInit dictionary-order behavior outside this task's duplex correction. Cross-realm transfer/adoption, all possible stream chunk types, source-cancel corner cases, and every Request textStream producer combination are not exhaustively probed. Ordinary buffered Request/Response bodies retain their existing transport and parsing path. No upstream engine production source was imported.
