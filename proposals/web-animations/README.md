# Native-calibrated Window Web Animations

`integration-current.patch` adds the measured `Animation`,
`AnimationPlaybackEvent`, `Element.animate`, and `Element.getAnimations` subset
in an isolated current-Root overlay. No Root production source was edited and
no target engine implementation is imported. The patch applies cleanly against
the current composed browser/codec files; `manifest.json` records base and final
hashes, the 25-file patch, exact runtime builds and validated graphs.

The pinned target exposes neither AnimationEffect/KeyframeEffect nor
AnimationTimeline/DocumentTimeline, document.timeline or document.getAnimations.
Those interfaces are not invented. Native ignores keyframes, duration and other
animate options, retains assigned effect/timeline object identities, and leaves
actual computed opacity, width and transform unchanged. getAnimations returns
a fresh empty array, including while animations run. Automatic completion is
the target's bounded task state behavior, not a rendering/interpolation backend
or a performance claim. currentTime, playbackRate, id and replaceState are also
absent in the measured interface.

| Operation | Measured behavior |
|---|---|
| Element.animate | Genuine Animation factory; public Animation constructor is illegal. Keyframe/options getters are not read. |
| play | Starts running and schedules the measured approximately 10 ms automatic finish task; already-running play is a no-op. |
| pause | Sets paused without resolving finished. Existing automatic tasks remain queued and check current state when run. |
| finish | Sets finished, resolves an existing finished Promise, and queues one trusted finish event per transition. |
| cancel | Sets idle, rejects an existing finished Promise with AbortError while marking it handled, clears the lazy finished slot, and queues cancel when previously nonidle. |
| reverse | Measured no-op after brand validation. |
| ready/finished | Genuine lazy Promises owned by the first getter's VM. ready is cached; finished is replaced by cancellation, not by replay after finishing. |
| startTime | Nullable unrestricted number; setting it does not drive progress and cancellation preserves assigned values. |

Factories use the calling method's realm. Playback events retain the
animation's factory realm; borrowed cancellation creates the rejection error in
the cancellation method's realm. Attribute handlers preserve listener order,
replacement/removal and false-return cancellation behavior. Authored dispatch
uses genuine untrusted events; internal dispatch uses genuine trusted playback
events with measured null currentTime/timelineTime. Removing an iframe cancels
its already queued animation tasks and events while fresh later calls remain
valid, including explicit finish and fresh pause/play cycles.

Public functions, arrays and constructor prototypes are compiled in the actual
VM. EventTarget/Event wrappers come from successful generated factories bound
to that VM. Private animation/event state, resolver records and task sets stay
in Host-owned null-prototype records and WeakMaps. No private VM constructor
factory table is retained. Brands rely on successful allocation identities,
not tags, names, copied implementation symbols or authored prototypes. Clone
rejection covers genuine new interfaces; authored lookalikes clone as ordinary
own data. Public constructor replacement does not hijack internal allocation.

The narrow `markPromiseHandled` runtime export uses public V8
`Promise::MarkAsHandled` on a genuine Promise. It neither calls authored .then
nor creates a hidden derived Promise. Native controls distinguish ordinary
unhandled rejection from cancellation's handled rejection. The runtime bridge
rejects non-Promises and proxies without invoking their traps. **Rebuild
runtime.node and restart each deployed Node process after applying the runtime
source change**; existing source/binary manifest checks reject stale artifacts.
The patch includes source only; copied rebuilt Node 24.22.1/26.13.0 artifacts
and hashes are recorded separately.

Validation on the final current-Root composition is **12/12 focused checks on
Node 24.22.1 and 12/12 on Node 26.13.0**, comparing **165 actual Native observation
rows across nine groups** plus structural checks. The unchanged upstream
`animation/animation.html` passes on actual Native and the final candidate,
with actual document load completion, a separate 2,000 ms load budget and fresh
2,000 ms assertion budget, identical iframe+worker flags, the unchanged harness,
native-branch/nonzero checks, and Native/candidate owned exit 0. These runs use
ephemeral fixture ports because this fixture has no canonical dynamic routes;
9582/9584 were not reserved or used.

One targeted actual heap control passes on the initial validated graph: public
animations remain queryable in their real realm and the result is a real realm
Array; authored slot/factory-table lookalikes remain visible; no private slots
or VM factory table leak. The animation and heap/provenance footprint is
byte-identical in the final composed graph; this check was not silently counted
as a second execution on the new graph. No broad/full/PureScript suite or other
heap suite was run by this agent.

The first overlay's validated graph is preserved separately before rebasing
browser/codec integration onto the newer Root WebCrypto/range/DOMException
composition. Final focused checks and the candidate fixture were rerun on that
new frozen graph. Native observation source hashes match every packaged oracle
expression. Native identity is SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`
at pinned source `948d773786380bae36f046639fc61e2ddddd212a`.

Raw exploratory failures remain in evidence: an unsupported top-level-await
probe was corrected to an async IIFE; initial local fixture-copy mistakes are
setup failures; Node's test host rejected the deliberate positive unhandled
rejection even though Window prevented it, so that unchanged positive control
runs in its own real process. Close-spaced independent timer ordering is kept
as raw diagnostics; canonical custom probes use actual state samples, event
counts and a task drain instead of asserting a fragile 2 ms interleaving.
The original upstream fixture and assertions were not changed.

Remaining bounds are explicit: no keyframe evaluation, interpolation, timeline
clock, unsupported constructor family or rendered output is claimed; no exact
cross-runtime wall-clock task interleaving is promised. Worker/isolated-world
animation exposure is unmeasured and outside this Window/actual-iframe proposal.
The earlier baseline/helper/header packages remain unchanged.
