# Window messaging and BroadcastChannel proposal

Independent implementation and opt-in overlays only: no production JavaScript,
native collection binding, fixtures or dependency configuration are changed.
No Lightpanda production source is imported or copied.

`messaging.mjs` installs Window.postMessage and Window BroadcastChannel.
`broadcast-realm.mjs` provides the same real BroadcastChannel transport and
parent relay for dedicated workers; `broadcast-config.mjs` supplies the private
storage key. `platform-codec.mjs` and `codec-overlay.mjs` add genuine Blob/File
graph serialization and ordered asynchronous byte hydration.
`integration.mjs` applies exact source overlays to Browser and Worker imports
for isolated acceptance. Worker threads load that same opt-in hook; no alternate
payload-specific execution path is used.

## Native source context

`entry.cc` supplies `createEntry(callback, realmAnchor)`. It creates a genuine
native function using the registered Window itself as the trusted realm anchor,
without reading an authored Object/global constructor. The entry callback reads
`Isolate::GetIncumbentContext()` before entering host JavaScript, then passes
the actual incumbent global, actual receiver and arguments to a private host
callback. No source is inferred from message content, receiver, method creation
realm, URL strings or stack traces. Direct host calls without a registered
Window incumbent throw explicitly.

Cross-window, borrowed-method, Promise-microtask and timer tests demonstrate why
`GetCurrentContext()` would be incorrect: it identifies the method's creation
realm, while the incumbent identifies the actual source realm. Window brand
checks and source lookup are separate. The realm-local entry function inherits
the correct Window Function prototype. Argument packing uses a genuine V8 Array
and CreateDataProperty, so authored numeric Array.prototype setters do not run.
The pollution/realm-array regression verifies both properties.

Build and load guards check the exact Node patch, module ABI, V8 version,
platform, architecture, source SHA256 and binary SHA256. Compiled outputs and
manifests live under ignored `.cache/window-messaging-entry`, never in this
proposal's tracked files. The build uses installed matching Node headers and
the local C++ compiler:

```sh
node proposals/window-messaging/build-entry.mjs
node --experimental-vm-modules --import ./proposals/window-messaging/frozen-base.mjs --import ./proposals/frame-write/integration.mjs --test proposals/window-messaging/regressions.test.mjs proposals/window-messaging/codec.test.mjs
```

The tested JavaScript baseline is immutable committed 7b30c27, described by
`frozen-base.json`. Its source hook is preloaded before the proposal hooks;
mutable production sources are not started. To recreate a lost temporary
snapshot, run `node proposals/window-messaging/snapshot-base.mjs`. The final
fresh-frame write overlay is required for the unchanged broadcast fixture.

For production integration, root is preparing a separate version-checked native
runtime helper. The small `CreateEntry`/`Entry` implementation belongs there;
the collection binding stays unchanged. Rebuild the runtime helper before
installing Window messaging. The proposal does not silently
fall back to guessing a sender if the entry capability is absent.

## Observable behavior

Window message serialization uses the existing messaging adapter, genuine
native structuredClone and real worker_threads MessagePorts. One receiver-side
graph-adoption pass preserves cycles, maps, receiving intrinsics, transferred
port identity and the identity between event.ports and event.data. Delivery is
an actual queued task. Disposing a target cancels delivery and closes orphaned
transferred endpoints; transferred ownership survives source document disposal.
Messages retain the captured source Window and origin at send time.

The pinned native Window.postMessage profile has measured standards gaps,
retained at the parent's explicit compatibility request:

- targetOrigin is ignored, including malformed origins, Symbols and getters.
  The options overload reads only its transfer member.
- ArrayBuffers in the Window transfer list are ignored, including duplicate
  entries. Actual bytes are copied through native structuredClone and the
  sender buffer remains attached. MessagePorts genuinely transfer and detach.
- A blank child Window's event.origin serializes its URL origin as null, even
  while its inherited security origin is the parent's HTTP origin.

These are target observations, not claims of standards-equivalent behavior.
MessagePort/Worker/structuredClone transfers retain their existing true
ArrayBuffer detachment semantics; only Window.postMessage has the measured
compatibility behavior.

BroadcastChannel uses actual node:worker_threads BroadcastChannels, not a
process-local callback bus. Its transport namespace binds BrowserContext,
security origin and authored channel name. Distinct opaque documents receive
distinct storage keys. A standalone embedder without a BrowserContext gets a
private Page scope. Namespace tokens remain host-only, including when passed
to real dedicated worker threads through workerData.

Native delivery provides asynchronous recipient snapshots, no self delivery,
independent clones per recipient and communication across Windows/frames/real
worker threads. Wrappers preserve realm-correct data, trusted MessageEvents,
origin/source/ports, constructor and method arity, property descriptors, brands
and borrowed cross-realm receiver identity. Closed channels reject posting with
InvalidStateError before serialization. Window/worker disposal closes native
channels, and native handles are unref'd so they do not retain the host process.

Blob/File nodes use a private envelope Map keyed by graph placeholders made
only after private DOM implementation/native intrinsic brand checks. An authored
object containing kind/name/bytes fields stays an ordinary object. The codec
copies pinned DOM Blob._buffer synchronously and captures genuine immutable
NodeBlob handles across threads. Captured receiver constructors instantiate
actual realm Blob/File objects; aliasing, cycles, Map/Set keys, bytes, MIME,
filename and lastModified survive. Authored metadata getters are not invoked.
Synchronous DOM/worker structuredClone is supported. Incoming NodeBlob bytes
are read through the captured public arrayBuffer intrinsic before queued DOM
events, with per-target delivery sequencing and disposal guards.

Node24 and Node26 cannot directly broadcast NativeBlob/File to two or more
recipients: the actual built-in throws "Message could not be posted". The
minimal `node-broadcast-blob-probe.mjs` and the corresponding Node24/26 reports
under docs/reference preserve this evidence. Broadcast wire bodies therefore
contain actual byte snapshots, never NodeBlob host objects. A real native BC
reservation fixes eligible recipients and FIFO before an asynchronous body is
ready. A new receiver that sees only the later body ignores it; closed receivers
discard their slots. Ordinary messages queue behind an earlier reservation.

For Worker sources, an actual parent MessagePort synchronously clones the
immutable platform payload **before** the native BC reservation. The private
parent relay publishes the byte body after ready; physical thread exit flushes
staged jobs even if forced termination interrupted ready. A separate private
native publisher can finish after the source channel/Worker closes. No local
callback bus substitutes for BroadcastChannel destination delivery. Tests cover
late subscription, FIFO, sender/receiver closure, immediate Worker termination
and the actual termination gap between reservation and ready.

## Evidence and remaining boundaries

`docs/reference/window-messaging-native-isolation.json` is the canonical public
API/native-CDP observation. It contains the native executable SHA256, source
expression, source identity, metadata, real transfer behavior, clone behavior,
same/cross/opaque origin tests and real source-matched child reports. Native
BroadcastChannel emits the inherited HTTP security origin for a blank child,
unlike its Window.postMessage origin serialization.

The earlier `window-messaging-native-partitions.json` additionally records that
cross-origin/opaque child proxies do not expose eval. The final isolation probe
uses actual child scripts and source-matched postMessage reports, so it does
not require bypassing that restriction. Native rejects a concurrent second
BrowserContext and a second loaded target; concurrent native context isolation
is therefore unobserved, with the exact protocol errors retained. The proposal
independently tests its additional BrowserContext isolation.

`docs/reference/window-messaging-native-fixtures.json` records fresh native
passes of all three unchanged message_channel, broadcast_channel and Window
post_message fixtures. All use the real native/external-runner harness branch
with source hashes and enforced nonzero observations.

Current proposal validation: 17 messaging plus 11 codec tests pass on
Node24.19.0, Node24.22.1 and Node26.13.0. All three unchanged upstream fixtures pass with
the independent fresh-frame write overlay, using real native-branch assertions.
All 30 existing MessagePort/Worker tests pass on Node24 under the overlays.
The old test expecting Blob rejection is explicitly updated in the isolated
test overlay to the now-supported clone contract; it is not skipped.

The exact core/worker/test integration diff is `core-and-worker.patch`, based
on the frozen commit. It uses proposed src module names and omits the temporary
Worker loader-hook arguments. Browser/runtime-helper wiring remains in the
reviewable source overlay so root can adapt its current imports/order. The new
modules' matching src names are platform-codec, broadcast-config,
broadcast-realm and window-messaging; their relative imports are normalized in that patch. Regenerate it with
`node proposals/window-messaging/export-patch.mjs` after proposal changes.

To run the existing worker/channel regression suite against the frozen base:

```sh
node --experimental-vm-modules --import ./proposals/window-messaging/frozen-base.mjs --import ./proposals/window-messaging/integration.mjs --test test/messaging.test.js test/workers.test.js
```

The synchronous Window clone of a host-injected NodeBlob with no local byte
snapshot still throws explicitly; ordinary browser-visible Window Blob/File
values have real DOM byte snapshots, while Worker clone accepts genuine native
immutable Blob handles. Native and this proposal both reject SharedArrayBuffer
here. SharedWorker, service-worker channels, new worker
creation from workers, cross-origin WindowProxy enforcement and transferred
stream/platform-object cloning remain outside this bounded proposal.
