# Independent Request/Response stream producer proposal

Use `combined.patch` when v1 Request-stream work is not applied. Use `after-v1.patch` only when `proposals/request-streams/request-streams.patch` is already applied. Both represent the same final source. The combined patch passes `git apply --check` against root's current Fetch/Streams baseline; the incremental patch passes against the exact v1 source copy. No production/common files were edited during investigation. No Browser installer, startup configuration, dependency, native builder, or Puppeteer changes are required.

`base/`, `v1-base/`, `candidate/`, `test-base/` and `test/` preserve the reviewed inputs/results. `manifest.json` records hashes. The isolated core snapshot is `/tmp/red-panda-request-producers-proposal-zkc3ufag`; its exact collection binding/manifest/source and rendering backend are copied under native/, and it does not import root's evolving classic checkpoint/runtime helper.

## Actual body model

The patch retains v1's real closed Request source extraction: original source identity; duplex getter ignored; no inferred content-type; real queued byte conversion before mutation; immediate own used/lock state on successful consume; real reader draining; source lock retained for direct consumption and released for clone/network extraction. Open/unobserved/errored/invalid-chunk Request sources reject explicitly without inventing completion.

The producer extension addresses common actual sources instead of classifying them as unsupported:

- Buffered Request/Response construction snapshots real input bytes. Body getters lazily instantiate stable real realm ReadableStreams with actual Uint8Array queue values and real closure. DOM Blob/File bytes use the pinned DOM implementation's actual backing buffers. BufferSources use the existing actual view-slot extraction. FormData serializes actual string/file entries into a valid random-boundary multipart byte sequence; header and body use that same captured sequence. Native-observed boundary shape is four dashes plus twenty lowercase hex characters.
- The owning buffered body's bytes remain a separate cache, as measured in native. A child Request can upload and empty the exposed queue without marking the owner used or destroying its cache. A real manual read/cancel or a retained source lock makes the owner's later consumer reject as disturbed/locked. Own consumers drain/lock the real exposed queue and parse the actual cached bytes.
- `new Request(bufferedOriginal)` copies metadata and actual captured body bytes without Undici's automatic source transfer. Original/copy streams are independent. Fetching a buffered original leaves it unused and readable, matching the native public control.
- Network provenance comes from actual bytes read from the real response, after status/CORS checks. Buffered-body source creation does not infer contents from a URL or fabricate successful HTTP data. Actual raw response/abort algorithms remain responsible for owning response consumption; an exposed source receives real controller errors when its signal aborts. Weak controller references, completion cleanup and finalization remove added source abort listeners without registering a strong iterable stream list.
- Generic/default TransformStream, TextEncoderStream, TextDecoderStream and codec factories register their actual controllers and successful enqueues. Actual writer-close fulfillment and controller close/terminate establish closure; errors/cancellation clear mirrored entries. Generic chunks retain their real identities. Failed calls on closed/released writers do not erase valid queued output. Codec data is still produced/validated by the existing real zlib/Brotli engines.

The weak registry only mirrors observed successful operations on actual queues and performs actual reader operations when extracting bytes. It does not inspect undocumented Node stream symbols, serialize unknown queues into guessed content, invoke dummy callbacks, or substitute fixture outputs.

## Verified native Response distinctions

Pinned native distinguishes a stream body from a buffered body:

- Response consumption really waits for an open stream to close. It marks its own used state and acquires the source reader immediately. It accepts only actual Uint8Array chunks, retains the lock on success and releases it on errors. The implementation reads the actual source, validates actual chunks and propagates the actual source error.
- Cloning an explicitly stream-backed Response produces a null/empty-body copy while leaving the original stream untouched. This holds for closed, open, string-valued and errored sources. A locked/disturbed source rejects cloning. Buffered Response clones retain their full actual bytes. This measured native quirk is modeled by the real body variant and metadata copying, not by a fixture path or scripted return value.
- The native public ReadableStream.tee method is absent. The old Node-dependent extension is hidden. Private buffered-body cloning no longer needs an exposed tee on realm streams; its known body snapshots produce actual independent queues. There is no claim of successful public tee conformance from previously available Node functionality.

The original unclosed-Response probe timed out at its bounded10s Runtime.evaluate deadline. It is retained as a pending/unobserved probe, not counted as an API failure. The subsequent per-case bounded probe records open-source pending state, explicitly closes the owned source and records actual fulfillment. Its ten-case state/error/result vector matches the candidate exactly.

## Evidence and validation

Verified reference binary SHA256: `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`, pinned upstream `948d773786380bae36f046639fc61e2ddddd212a`. No upstream production engine code was imported.

`docs/reference/request-streams-phase2-differential.json` compares92 public native controls in seven retained vectors. It covers construction/identity, immediate/final flags, byte conversion, invalid/open/error sources, actual source queue drainage, clones, copies, buffered owners, body producers, real HTTP uploads, and real gzip/Brotli bytes. All92 match with exactly two disclosed comparison normalizations:

1. Actual HTTP headers remain in raw reports but are excluded from this scoped API comparison because the isolated Node transport has different network branding.
2. Fresh multipart boundary tokens are replaced only for comparison. Every other serialized byte is compared; independent tests also compare the exact source-owner bytes with actual server-received bytes without normalization.

All64 relevant sequential JavaScript tests pass:42 existing tests,10 v1 tests and12 new producer tests. Existing test assertions were updated only where public native controls disproved their old assumptions: unsupported upload becomes actual byte echo; original buffered Request remains unused after fetch and retains actual body data; explicit-stream Response clone is empty; public tee is absent. Upstream fixture assertions and testing.js were not changed.

Final exact-source unchanged fixture reports:

- `docs/reference/request-streams-phase2-final-request-fixture-comparison.json`: native PASS, candidate PASS, canonical9582.
- `docs/reference/request-streams-phase2-final-response-fixture-comparison.json`: native PASS, candidate PASS, owned random port.

Both preserve the original testing.js native branch via test-only Lightpanda/1.0 UA and __lp_external_runner, equal iframe+worker resource profile and100ms settle. Each has no console/page errors and retains source, tool, fixture, harness and native binary hashes. The canonical port was explicitly handed off and released; all owned processes/contexts/servers are closed.

## Review limits

This is a tested body/producer proposal, not a full-browser compatibility claim. Full root validation and broader cohorts remain root integration work. The old v1 checkpoint and its51/52 outcome are preserved; they describe the earlier unsupported internally-produced-body gap, which this extension addresses.

Queues created outside the installed constructors/producers, calls bypassing the adapters, arbitrary external Node streams, and pipe/async-iterator provenance without recorded production remain explicitly unknown for synchronous Request extraction. Reflection-perfect equivalence of the retained Node prototype chains is not established. More close-before-await/cancel/cross-realm combinations remain to be probed. The broader RequestInit dictionary access-order model is unchanged except for duplex.

The cached byte model adds allocations: encoded body cache, transport body and exposed queue can each hold a copy. Existing16MiB transport and64KiB keepalive checks remain; memory/performance equivalence is not established by these functional tests. Exact multipart formatting for every unusual field/header combination is also not exhaustively established. Negative/pending controls and original raw reports are retained rather than relabeled as compatibility passes.
