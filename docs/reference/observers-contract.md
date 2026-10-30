# Independent resize and user-timing observers

The public probes in `observers-probe.mjs` target the verified external binary
whose SHA-256 is retained in `observers-native-observation.json`. No upstream
engine implementation is imported. The unchanged external fixture files remain
in their licensed source archive rather than being copied into this repository.

Install these adapters before parsing page scripts:

```js
const performance = installPerformance(page, window);
const resize = installResizeObserver(page, window, layout);
```

Both return idempotent per-window controllers with `dispose()`. They stop on
the document abort signal, page close or unload. Resize also exposes `schedule()`
for an explicit host geometry invalidation. Its default layout is `page.layout`.
The modules do not edit or integrate Browser: that is the caller's responsibility.
Performance must be installed in the initial blank realm before its Page starts
the first real navigation, then installed in each replacement and child realm.
Its host-only tracker persists across document aborts and captures the actual
document request before the replacement realm exists. Root Page request/response
events supply child-frame transport too; the adapter filters by frameId and uses
the frame registry to expose iframe navigation as a parent resource. One tracker
per root Page avoids duplicate subscriptions and closes with the Page.
Fetch redirects currently change Page request IDs. An unambiguous same-frame
URL/type predecessor can be linked; concurrent identical redirect chains cannot
be distinguished by the current events and therefore are not guessed. A stable
transport-chain ID would close that metadata gap.
Install the global error adapter before callbacks execute; exceptions call
`window.reportError` when installed. The fallback dispatches a cancelable window
ErrorEvent and forwards unsuppressed errors to `pageError`.

ResizeObserver computes initial and changed entries from actual `layout.rect`
dimensions. A hidden/detached initial zero box stays silent; removing a previously
visible target produces a zero-size change. It watches DOM/shadow-root mutations,
load and viewport events, and samples active targets every 16 ms so CSSOM edits
and host viewport changes also become observable. Unchanged sizes do not trigger
callbacks. Queued delivery honors unobserve/disconnect, including a later observer
disconnected by an earlier callback. Constructors, entry getters and callback
arrays belong to the page realm. The measured native profile delivers via a
microtask, exposes identical content/border/device-pixel dimensions without
padding/border expansion, and accepts an unknown `box` option; this adapter follows
that profile rather than claiming full rendering/spec behavior.

Resize accuracy is bounded by the supplied layout. In the captured layout version,
document traversal excludes shadow descendants, so `layout.rect(shadowTarget)` is
zero. The adapter does not fabricate notifications to satisfy a shadow fixture.
The `host_style_change_delivers` subsection of `resize_observer/resize.html` remains
pending until the layout supplies that target's real surrogate box.

User Timing records actual `performance.mark()` and `measure()` calls in a local
timeline. Entries retain the measured native detail-object identity; `toJSON()`
omits detail. Native constructors for entry/mark/measure/list are illegal. Marks
with negative times throw, while NaN/Infinity are retained. Measure endpoints
resolve recorded marks, explicit numeric timestamps or supplied real legacy timing
fields; absent network/navigation measurements are not synthesized. Duration
options use measured native precedence. Queries return time-sorted page-realm
arrays; clearing a timeline entry does not remove queued observer references.

PerformanceObserver delivers actual queued entries from a timer task after promise
microtasks, supports single/multiple-type selection, buffered past entries in
single-type mode, stable lists, takeRecords, disconnect and fixed observation mode.
Callback exceptions do not prevent other observers from receiving their records.
Actual Page `request`, `response` and `requestFailed` events produce resource
entries and observers. The native public transport control confirms that failed
fetches produce entries too, with their observed start/end and unavailable
response details. Successful entries expose the original requested URL,
initiator, redirect count/start/end, request start, buffered response completion,
status, MIME/content encoding and decoded byte count. Content-Length supplies
encoded length when available. Cross-origin detailed timing/size/status fields
are hidden without Timing-Allow-Origin. The resource buffer is bounded; clear,
resize, observer delivery even when full, and a trusted nonbubbling overflow
event are implemented, including copying overflow entries when a handler makes
room.

A captured completed document fetch seeds a real navigation entry before parsing.
Its clock begins at the request, so response completion precedes the actual
DOMContentLoaded/load milestones. Entry identity stays stable while lifecycle
fields and duration update. Legacy timing getters expose these measurements;
unknown fields remain zero. The optional third installer argument
`{navigationType:'reload'}` (or `page.performanceNavigationType`) lets the host
supply the real `navigate`/`reload`/`back_forward` mode; the current Page events
omit it, so the default is `navigate`.

All four producer types (`mark`, `measure`, `navigation`, `resource`) are now
advertised. Transport detail remains partial: Page emits response only after
buffering the body, so response header start, DNS/TLS/connect phases, negotiated
protocol and wire transfer byte counts are unavailable. Their fields return
zero/empty sentinels; no fake phase clocks or byte counters are inserted. The
verified native transport probe records richer values, so this is an explicit
remaining compatibility gap. EventCounts and complete network timing/privacy/
cache/streaming semantics remain open; the full `performance.html` and complete
resource/navigation fixtures have not passed.

`node --test test/resize-observer.test.js test/performance.test.js` passes 22 focused
tests. `observer-fixtures-verify.mjs` executes unchanged external fixtures with the
installers and module adapter in a JSDOM realm; it is not production Browser/CDP
integration evidence. Resize change fixture times out on the shadow box gap above.
The first installer report preceded transport producers and therefore failed the
supported-types assertion. The later
`observer-fixtures-installation-final-observation.json` passes both unchanged
PerformanceObserver fixtures and three of four ResizeObserver fixtures; its helper
page does not emit Page transport events, so owned-HTTP producer tests provide the
separate timing evidence. Reports retain failures rather than replacing assertions.
That report binds installer/layout/style/module source hashes and explicitly
identifies the pending resize subsection as `host_style_change_delivers`.
All six unchanged fixtures pass the native raw-CDP control in
`observer-fixtures-native-observation.json`; some native server children required
the runner's bounded SIGKILL cleanup after their successful assertions.
