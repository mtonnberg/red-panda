# WebCodecs unsupported-backend state machines

This independent proposal supplies actual AudioDecoder/VideoDecoder and
AudioEncoder/VideoEncoder state machines, EventTarget interfaces, normalized
isConfigSupported promises, input queues, flush promises and task cancellation.
No media backend is registered: valid support queries honestly return false,
queued configuration fails asynchronously with NotSupportedError, and no encoded
or decoded output is fabricated. This matches the measured pinned Native target.

Apply `recovery/integration-current.patch` after the value-types delta, its
private-slot followup and the Audio owner's shared registerPlatformFactoryKind
export. That shared classification-only export must be supplied once; this
proposal does not duplicate it or add more hardcoded geometry-kind names.
The patch passes an apply check against current Root. Browser/worker adaptations
preserve Root's newer code but remain source-only until parent integration.
The executed snapshot is `/workspace/shared/webcodecs-codecs-20261031`, based on
the earlier frozen value-types graph plus privacy and the shared-export
prerequisites. Source manifests distinguish those compositions from Root HEAD.

The classes are compiled in real Window/frame/worker VMs. Host-owned null-prototype
slots, normalized work snapshots, callback ownership and pending flush records
remain outside selected VM Object.prototype results. Public methods cross a
brand/field-only bridge; no private full-slot or queue-control object is returned
by VM helpers. Exact successful factory records publish private implementation
provenance. Authored lookalike objects remain visible to genuine heap queries.
Private schema constants are frozen. Known interface names only classify ordinary
prototype/tag lookalikes; genuine branding always requires private provenance.

Configuration and support queries use measured property lookup/conversion order,
known/default fields, actual copied ArrayBuffer descriptions, real realm Promises,
codec-specific Opus bounds and observed error contracts. Empty/invalid configs
reject; unsupported formats do not become supported by acknowledging a request.
Decoder input accepts genuine encoded chunks, requires an initial key chunk,
increments actual queue size, and clears owned work on reset/close/error. Reset
and close cancel actual scheduled configuration and reject pending flushes with
AbortError. Configuration failure closes before invoking its real error callback;
flush handlers run afterward, followed by a coalesced trusted dequeue event.
Callback exceptions go through genuine Window error reporting.

Borrowed HTTP-frame controls preserve method-realm Promises and ordinary
synchronous DOMExceptions, receiver-realm asynchronous errors and reset AbortError
objects. The initial data-URL/contentWindow experiment hit Native opaque-origin
access restrictions; actual child CDP contexts had the APIs. That setup outcome
remains preserved instead of being called missing child support. The corrected
owned same-origin HTTP controls match both engines.

Validation is deliberately separated by source epoch:

- The earlier state/slot composition passed64 combined Node24 checks across
  processors, values, private heap controls, existing heap worlds, platform codec
  and workers. It predates the narrow borrowed AbortError-realm and static
  descriptor corrections.
- The final15 processor checks pass on Node24.22.1, Node26.13.0 and Node24.19.0.
  They enforce **504 actual Native rows**, real Worker task execution, actual
  heap privacy, callback exception reporting and borrowed frame realms. Source
  hashes remain unchanged throughout those final runs.
- All3 unchanged codecs/encoded_chunk/video_color_space fixtures pass on the
  final candidate with actual iframe/worker flags and the original harness.
  Native positives come from the preceding scoped coverage/probe evidence.
  Diagnostic15s and document-complete/100ms settling are distinct from source2s
  performance; this is not the complete registration/WPT matrix.

Real AudioData/VideoFrame producers and successful encoder inputs are not yet
integrated. Encoders reject unregistered media inputs; the trusted producer hook
does not brand authored objects. Actual decoding/encoding, exhaustive format
options, complete utility-world availability, all detached-frame task lifetimes
and hard asynchronous execution deadlines remain outside this bounded result.
The Worker regression proves actual thread/state/byte execution; it does not
establish complete Native Worker EventTarget/DOMException descriptor parity.
No Root production files were edited by this worker.
