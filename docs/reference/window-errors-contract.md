# Window error reporting

`installErrors(page, window)` in `src/errors.js` runs before document scripts and
before other installers register callbacks. Call it for each frame realm as well
as the main document. It returns an idempotent `{ report(value), dispose() }`
controller. The controller and `window.reportError(value)` use the same reporter.
`reportError()` without an argument throws a realm TypeError.

The reporter dispatches a trusted, cancelable realm ErrorEvent containing the
original thrown value. Existing jsdom Window/body `onerror` mechanics supply the
five arguments and cancel default reporting when the handler returns true. Later
listeners still run. Preventing the event's default likewise suppresses reporting.
Publicly constructed/dispatched ErrorEvents remain untrusted. Reporting an error
while an error handler is already running forwards the secondary failure without
recursively dispatching another global error event.

Uncanceled errors emit one normalized host Error through the existing Window
VirtualConsole `jsdomError` channel. Keep Browser's current single forwarding
listener. Do not also emit `pageError` in an adapter that calls `reportError`.
The normalized Error has safe string fields and retains the original value in
`detail`; null, undefined, symbols and objects with throwing property getters do
not reach host protocol serializers as unsafe payloads. Other installers that
catch page exceptions should call the controller's `report(error)` or
`window.reportError(error)` rather than manually dispatching an ErrorEvent.

Scoped wrappers around pinned jsdom 26.1 callback converters preserve callback
receivers, listener removal identity, WebIDL argument conversion and normal
return values. They catch exceptions from event listeners, inline/property event
handlers, MutationObserver, queueMicrotask and animation callbacks before jsdom's
legacy error helper reads properties on arbitrary thrown values. Timer wrappers
delegate scheduling/cancelation to jsdom; string handlers run real scripts in the
same VM context, including persistent global lexical declarations. Closed,
aborted or explicitly disposed documents suppress pending callback execution.

A shared async hook records Promises created with registered document-realm
prototypes using weak ownership maps. Unhandled owned rejections dispatch trusted
cancelable `unhandledrejection` events; a late catch produces `rejectionhandled`
with the same Promise and reason. An uncanceled rejection forwards one safe
VirtualConsole error without dispatching an additional Window error event.
Disposed document rejections are ignored. The process listeners remain installed
to recognize already-created promises after disposal; unrelated host rejections
retain fatal behavior when no other host rejection handler exists. There is no
catch-all uncaught-exception handler. Worker-global reporting is separate.

## Evidence

The unchanged upstream source fixture is `event/report_error.html` at external
source commit `948d773786380bae36f046639fc61e2ddddd212a`:

- HTML SHA256: `647ae0bd011817ffcf86ed44b71575fbce16abbf81e1b7355ed4ca4f043b07bb`
- Harness SHA256: `23e2ebbd851e64a68b1e357a38ed2e6d5d5f72217cb2e14671c4d3eecf6c861b`

`window-errors-native.json` records a native pass. Native binary SHA256 is
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
`window-errors-candidate-before.json` records candidate transport closure and owned
process exit 1. A bounded stderr probe traced the fatal unhandled page rejection
to missing ResizeObserver in the async fixture callback; reportError was also
absent. No target production source was used.

`window-errors-verify.mjs` runs the unchanged fixture with the error installer and
actual ResizeObserver, PerformanceObserver, IntersectionObserver and layout
installers. `window-errors-installation-trace.json` records a pass with all eleven
callback exception sources and no uncanceled errors. This is installer evidence,
not a production Browser/CDP parity result.

An earlier run, retained as `window-errors-installation-observation.json`, failed
only the nested onmessage callback: a cold layout/observer computation blocked
the event loop beyond the fixture's 100ms deadline, so its done callback cleared
onmessage before the subsequently queued message task ran. The passing run's
trace shows the message arriving while the handler still exists. No fixture,
timer deadline or scheduler behavior was changed to obtain a pass; cold-path
timing remains a compatibility concern.

`node --experimental-vm-modules --test test/errors.test.js` verifies ten contracts,
including host fatal behavior in owned child processes. Browser, Shadow DOM and
the first nine error tests also passed together (46 tests).

## Limits

Source locations use safe stack parsing and a document URL fallback; exact native
columns, cross-origin muted errors and complete script-origin metadata are not
implemented. Classic script evaluation still enters jsdom's legacy reporter
before this module's dispatch hook; hostile getters on a value thrown directly
by a classic script can still fail inside that legacy helper. Function/string
timers and converted callbacks avoid that path. Script/module adapters should
route caught exceptions through the shared reporter as they gain independent
evaluation support.

Existing manually emitted errors from IntersectionObserver, module scripts,
messaging adapters and workers retain their own behavior until their owners
integrate the reporter. The new ResizeObserver and PerformanceObserver installers
already call reportError when installed. Rejection ownership tracks document
Promises, not arbitrary host Promises handed into page code; browser-facing
async APIs should return realm Promises as the fetch implementation already does.
