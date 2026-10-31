# Private direct EventTarget compatibility follow-up

This bounded follow-up closes WebSocket's remaining physical implementation
symbol and proxy-brand trap while preserving real transports and canonical
backend identity. It strengthens SharedWorker's production surface test to
compare directly with the existing immutable Native observations. The frozen
SharedWorker, EventSource, Event parity and viewport artifacts remain unchanged.

The standalone integration patch applies after Root
`b3ff8a9181c2746c83f7af5b566c7d02e0eedd61`, the frozen standalone Event parity
patch, and the preferred sealed all-private viewport patch. Source hashes and
prerequisite hashes are in `source-manifest.json`. The alternative
`integration-after-namespace-event-viewport.patch` is a deterministic **static
composition only** after the corresponding namespace/Event/viewport alternatives.
Both alternatives apply cleanly to their exact bases and reproduce every leaf
hash. Runtime results below belong to the standalone epoch; the namespace
composition has not been executed. Apply one alternative, not both.

The original pinned independent jsdom WebSocket source is transformed at its
real successful `setup`/`new` callsites. The same wrapper and actual implementation
remain canonical; Host WeakMaps supply exact brands and also bind the original
EventTarget implementation. No public backing property is installed. Original
conversions, actual URL validation, Node socket transport, Browser quota,
real trusted event dispatch and teardown stay in use. Copied symbols, inherited
objects and proxies cannot authenticate. The WebSocket backend's original
unowned jsdom path remains supported.

The public constructor, prototype, methods and accessors are genuine values in
the selected VM. The constructor initializes V8's actual implicit receiver and
performs the observable `newTarget.prototype` read once before URL/protocol
conversion. The measured nonobject prototype fallback is that selected
`Object.prototype`. Native's actual member order and constant empty `extensions`
descriptor are installed on the real public prototype. Utility WebSocket's
private generated converter closures are Host compiled, with an explicitly
validated actual Context/global pair for the public compiler. Utility wrapping
rebinds both private WebSocket and EventTarget maps to the original implementation
and leaves its main canonical wrapper untouched.

There is no prototype-only realm repair, reflected-key/protocol/heap filtering,
constructor `toString` masking, fabricated echo/event data, Native engine import,
new dependency, CXX modification, source/assertion deadline change or Root edit.
Window/Node physical backing migration and the missing utility-world custom
SharedWorker/messaging installers remain separate scopes. Existing MessagePort
clone error wording and SharedWorker global constructor gaps remain explicit in
their existing production tests.

## Measurements and focused validation

Pinned Native executable SHA256:
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
Original generated WebSocket source SHA256:
`8ee5efbe6419e82e8f3983c022acd66f7651c25d11045fdf579023b4434b3053`.
The original 116-interface aggregate guard is preserved; WebSocket has its own
exact source guard. Raw probe records include actual source/worker/binary hashes,
owned HTTP request paths and unaltered CDP responses.

* Fresh Native/current baseline performs actual MessageChannel delivery,
  SharedWorker script echo, streaming SSE and WebSocket echo. Port/Shared/SSE
  data, target/currentTarget, event class and trust already match. Their fronts
  have no own keys. Baseline WebSocket has one implementation symbol, and its
  borrowed getter calls an authored proxy trap. Final candidate matches the
  complete Native front/control response, including zero keys and zero traps.
* Actual Native constructor/member controls measure every own constructor and
  prototype descriptor, no-new TypeError realm, URL/protocol iterator access
  order, nonobject `newTarget.prototype` fallback and one prototype read before
  URL conversion. Final main and utility candidate responses match these
  observations. The explicit owned endpoint template is freshly measured in
  an actual Native utility context.
* The single serial Node 24.22.1 regression passes **51/51** in 42.2 seconds:
  `direct-target-migration.test.js`, `shared-workers.test.js`,
  `eventsource.test.js`, and `websocket-quota.test.js`. These include actual
  worker/frame ownership, transport failures, shared quotas, real port transfer,
  SSE parser/reconnect/CORS, delivery trust and canonical utility backing.
* **70 direct public-V8 creation-context rows** pass on each of Node 24.22.1,
  24.19.0 and 26.13.0 for real
  constructors/prototypes/methods/accessors and public fronts in main, frame and
  utility VMs. They retain the selected actual realm before and after removing
  the prototype; all reject Host realm identity. This uses direct `sameRealm`,
  never heap enumeration, metadata, prototype inference or `instanceof` proof.

The new five tests additionally pass 5/5 on Node 24.19.0 (3.2 seconds) and
Node 26.13.0 (4.1 seconds). The actual candidate utility CDP entry probe matches
the complete freshly captured Native utility response. These short checks use
the identical frozen standalone runtime/test graph; the 51-test network batch
was not repeated on the other SDKs.

The initial new-test run is retained as **4 pass / 1 fail**: its utility fixture
used an unavailable utility `location` global while constructing its owned URL.
The fixture now passes an explicit actual owned WebSocket endpoint. The missing
utility `location` exposure is not changed or claimed fixed. The earlier Native
and candidate URL-based records, initial descriptor difference and complete
failure log remain in the evidence alongside the corrected Native utility
calibration and final pass. Reconnect/quota lifecycle checks were not replaced
with synthetic results. No broad/full/PureScript/source-budget suite was run
for this follow-up.
