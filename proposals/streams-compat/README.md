# Independent streams/codec regression proposal

This is an isolated proposal; production src/streams.js and all common files are
unchanged. Apply streams.patch only after review. It proposes src/streams.js,
new src/stream-codecs.js and eleven focused tests in test/streams-compat.test.js.
There are no dependency/native-builder changes. The separate V8 checkpoint
experiment is not part of this patch and does not fix the scheduling gap.

## Observed behavior and implementation

The broader32 checkpoint retained four native stream/codec fixture passes and a
compression fixture failure. Direct owned random-port CDP probes then confirmed:

- TransformStream ignores both supplied queue strategies and completes queued
  writes without a reader, even with zero/negative/NaN requested watermarks.
  TextEncoderStream and TextDecoderStream also complete unread writes.
- A fatal decoding error is one selected-realm TypeError object shared by both
  sides and subsequent writes. Node-origin errors previously became fresh objects
  on every adapter rejection. A weak conversion cache preserves actual identity.
- Released/closed/locked stream errors have the exact measured native messages.
- Both codec constructors accept brotli, while br and invalid/case-changed labels
  reject. String/primitive chunks reject as non-BufferSources, with one stored
  TypeError on write/read/following writes; close receives a fresh TypeError.

The proposal uses actual Node WebStreams for generic/text transforms, with real
decoding state and eager readable queueing to match the measured native behavior.
Ordinary ReadableStream/WritableStream pull and writer pressure remain real and
are covered by the existing tests. Codecs use genuine Node zlib/Brotli streams
behind real readable/writable streams. Writes wait for the actual native engine
callback, so corrupt input rejects the offending write. Output bytes originate
from the engine. Brotli uses measured quality5/window22; hello matches native
bytes, and full output is independently decoded.

Gzip decompression independently parses real incremental header/trailer framing
around raw inflate, checks header CRC when present, output CRC32 and ISIZE, and
rejects trailing data/second members. Other formats validate actual consumed byte
counts. Bytes already delivered to waiting readers remain delivered before a
trailing-data failure. BufferSources are copied using actual view internal-slot
getters before output promise assimilation can detach the input. No authored
buffer/offset/length getters are trusted as native view metadata.

Readable cancellation retains the measured codec quirk: the engine still runs;
attempting to enqueue actual output after cancellation stores a TypeError. This
is exercised with real compression output, rather than acknowledging a skipped
effect. Private disposal hooks are weakly keyed by each real stream side, so discarding
the codec wrapper does not lose cleanup for a still-live locked pipeline.
Disposal destroys engines, rejects pending operations and releases real pipe locks.
An explicit review probe confirmed an existing limitation: tracked upstream
controllers can error before Node's internal pipe cancellation calls source.cancel;
the callback is not guaranteed. That failed stronger assertion is preserved in
review-pipe-cancel.probe.mjs and streams-broader-disposal-review.json.

## Validation and open fixture results

The frozen Browser candidate is reconstructed from the broader checkpoint's
085510c source snapshot, with only the two proposed stream sources changed.
Exact binary/source hashes are in frozen-source-manifest.json. Its v1 manifest
pins the earlier four-fixture run before minor later refinements.

All15 unchanged existing stream tests plus11 new tests pass on exact Node24.22.1
and26.13.0 (26/26 each). They cover locks, actual pull/writer pressure, real Fetch
Response(stream)/clone/abort, pipelines, actual realm/controller/error identity,
worker-like VM installation, all four compression formats, optional gzip headers,
corruption/trailing/truncation, rejections, cancellation, detached input and
concurrent pending reads. Raw outputs are preserved in
docs/reference/streams-broader-proposal-tests-node{24,26}.json. run-tests.py is the
executed sequential bounded runner; its cache setup is separate from production.

The unchanged decompression_stream.html fixture passed against the isolated
candidate. The other three unchanged native-passing fixtures become UNOBSERVED
after their concrete stream failures are removed: untracked classic async blocks
make assertions after Red Panda has cleared document.currentScript. Their native
counterparts retain the executing script through the microtask checkpoint.
No assertion attribution is faked and these fixtures are not counted as passes.
streams-broader-proposal-conformance.json preserves that result; later checkpoint
retries on both runtimes preserve the same three UNOBSERVED outcomes.

The original compression_stream.html native failure remains in the broader
checkpoint: its hardcoded /echo_brotli HTTP route was unavailable, causing five
405s and round-trip assertions to fail. It was not rerun on reserved port9582,
and no target-engine failure was inferred from that missing route. The independent
codec tests verify Brotli round trips using genuine independent decompression.

## Explicit limits

This does not establish every codec error string, native output bytes beyond the
recorded fixtures, callback timing, queue resource limits or all hostile view/
prototype cases. Eager transform queues can retain unread output; no bounded
memory guarantee is claimed. Generic TransformStream cancellation still differs
from the measured native Error: StreamNotReadable behavior. Existing broader
realm/prototype/transfer limitations remain. Scheduler/checkpoint changes and the
native heap-query proposal are separate work.
