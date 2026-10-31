# Genuine EventSource streaming transports

`eventsource-runtime.patch` implements independent Window, utility and dedicated/service Worker EventSource interfaces over real incremental HTTP streams. It does not read test reports, endpoint names or captured messages. Each transport owns its genuine AbortController, reader, reconnect task, UTF-8 decoder, current event fields and last-event ID in private Host records. The existing buffered Page.fetch path is not used to simulate streaming.

The public constructor is an actual strict selected-VM function. Its engine-allocated receiver receives canonical EventTarget.setup on that same object (the actual local generated setup in utility worlds); Worker receivers receive genuine private Worker EventTarget backing. Constructor custom newTarget order and nonobject prototype fallback match Native controls. Private successful producer records confer EventSource brands; prototype lookalikes and proxies do not. Public Events/MessageEvents are genuine selected-realm allocations. Window dispatch uses the captured actual generated backend dispatcher after listener-ownership initialization, preserving trusted production and authored callback scope; Worker dispatch uses the existing private Event foundation.

Actual byte streams support UTF-8 split across bytes, initial BOM, CR/LF/CRLF, comments, data joining, event names, IDs including NUL rejection, retry intervals and reconnects. The initial URL remains the public URL through redirects. Measured301/302 reconnects request that initial URL again; the message origin uses the actual final response. Last-Event-ID carries genuine UTF-8 wire bytes, including non-Latin-1 characters. HTTP200+event-stream MIME opens; measured non200/MIME/CORS/unsupported-scheme failures close, while genuine transport failure and stream EOF reconnect with readyState0. Cookies, credentials, CORS and referrers use actual captured document/worker principals and the real cookie jar. Real privileged CLI/CDP headers are applied to actual requests.

Worker streams are genuinely owned by the parent Page through captured private ThreadWorker channels. Authored postMessage cannot select that channel. Native Worker.terminate leaves real existing SSE streams and even an already scheduled reconnect alive; the parent preserves those actual transports until remote closure or owning Page teardown. Window close is the measured main-window no-op; explicit close stops the actual stream; iframe retirement closes its Window stream on the measured later task. Real parser-created callback descendants remain authored for listener cleanup.

## Separate prerequisite

`private-event-utility-backing.patch` is an independently reviewable one-branch correction to existing isolated-world backend recognition. A private Event canonical wrapper authenticates only its exact Host WeakMap implementation; authored implementation-symbol fallback applies only to legacy non-Event canonicals. The main SSE patch excludes this correction and adds only its own same-object setupEventTarget helper to isolated-world.js.

The unmodified current Root baseline, imported without SSE, fails both new real Browser-backed tests. The correction passes both. Actual Native and candidate raw main-to-utility and utility-to-main DOM CustomEvent controls match event realm, target, this, detail and zero own symbols. A fake backend pointing at a real Event plus an authored implSymbol cannot acquire a brand; Proxy controls cause zero traps. See `private-event-utility-backing-tests.patch` and the raw Native/candidate direction reports. Initial failures are preserved.

## Validation and identities

Native binary SHA256: `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
Pinned upstream test source: `948d773786380bae36f046639fc61e2ddddd212a`.

The unchanged `net/eventsource.html` and `net/eventsource_worker.html` pass Native2/2 and final candidate2/2. Candidate final report is `evidence/full-owner-final-candidate.json`, Native report `evidence/full-native.json`. The original source2s load and2s assertion budgets and immutable registration profiles are retained with zero global overrides. Prior successful epochs and failing authored probes remain separate. Canonical9582/9584 were released and bound/listened/closed in `full-final-ports-released.json`; no process or port lease remains.

Final focused serial tests pass20/20 on each of Node24.19.0,24.22.1 and26.13.0, including genuine stream parser/wire records, worker ownership, clone failures/lookalikes, strong provenance and selected-VM creation context before/after null prototypes. Those creation checks use a direct realm comparison, not a heap walk. Two selected existing Worker bootstrap/transfer regressions also pass. Commands use the repository-required `--experimental-vm-modules --test --test-concurrency=1`. No broad suite or PureScript run was performed in this isolated slice.

`final-tested-graph-sha256.json` identifies the exact scratch source and prepared native artifacts. `tested-source.tar.gz` retains that graph; `raw-evidence.tar.gz` retains control sources, drivers, reports, initial failures and logs. `artifact-sha256.json` indexes immutable artifacts. No dependencies or C++ sources changed, and no native rebuild is required. No Root production file was edited.

## Integration

Apply the separate utility-backing correction and its tests, then the SSE runtime and tests patches. All patches passed read-only git apply --check against the frozen Root tree. The immutable WebSocket handoff predates this independent slice. If integrating WebSocket first, preserve both imports, private Worker fields/clients/brokers, private message branches and detach calls, and both adjacent utility installers. The transports and message kinds are disjoint. That combined graph requires Root's own integration validation; results from this independent scratch do not imply a combined graph result.

## Explicit limits

The existing Window generated EventTarget backing symbol remains observable on EventSource instances, unlike Native; the surface test explicitly asserts and records that inherited foundation gap. EventSource state, request, reader, cookie policy and transport records are private. Worker EventTarget has its existing genuine private backing. No proxies, key filtering, prototype grafting, fake instanceof or stored-result lookup is used in production.

This does not establish every EventSource behavior. Network-domain CDP accounting/message events for these new streams are not integrated; the real wire server records establish the observed requests. Node HTTP transport ordering/client-hint/TLS/connection-pool/proxy behavior is not a full Native network fingerprint. Exhaustive redirect-origin taint/referrer policy, authentication, invalid/overflow retry grammar, very large stream limits/backpressure/performance, all URL conversion and retired/navigation/GC combinations, and service-worker-specific Native exposure/lifetime controls need further calibration. Surface/constructor/source positives do not erase these remaining limits or claim full browser replication.
