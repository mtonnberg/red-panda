# Independent synchronous Window XHR

`integration.patch` applies cleanly to the current Root after its retained-world,
codec and Fetch CORS changes. This proposal changes no Root production files.
Its only Browser changes are a transport import, one actual browser-owned worker,
and closing that worker with its Browser. Existing async XHR remains in place;
one former unsupported-sync assertion is replaced by an observed native property
guard. No Lightpanda production implementation was imported.

## Actual work and ownership

`SyncHTTP` starts a real Node worker and synchronously verifies readiness before
any page evaluation. Each request performs real HTTP in that thread. Shared
memory carries actual response metadata and bytes; it does not call back into the
blocked parent to obtain a response. The parent applies its real cookie jar,
per-hop redirects, credentials, privileged CDP/CLI header precedence, CORS and
request/response tracing. Frames share the Browser backend and supply their actual
frame and loader IDs. Closing one page does not terminate another page's backend.

An operation owns its exact request IDs until all cookie/redirect/body/tracing
processing completes. A host microtask is queued before entering the synchronous
wait or arbitrary callbacks. VM termination can bypass host JavaScript `finally`;
that queued cleanup cancels the actual worker request and removes only captured
owned IDs. Request IDs are allocated and recorded before request callbacks.
Response/failure bookkeeping removes those IDs before entering callbacks, and
the operation itself remains owned until callbacks return. Disposal cancellation
is bound to the XHR's actual private AbortController. The tests interrupt actual
VM execution in request, response, failure and cookie-processing callbacks and in
the blocking wait, while preserving unrelated request IDs.

Body conversion uses captured intrinsic ArrayBuffer/DataView/typed-array getters,
and exact private successful-factory records for Blob/File/FormData/URLSearchParams.
It never authenticates a body by reading an authored implementation-symbol getter.
Actual immutable Blob bytes, typed slices and multipart file bytes are sent.
Conversion exceptions propagate before sending and preserve OPENED state.

## Native observations

The oracle uses the pinned native executable with SHA256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
It makes real requests against the same actual fixture server and records both
engines' actual values. All **15 controls match** on the current Root adaptation
in `evidence/native-control-adapted.json`; the exact driver and fixture source are
preserved. This is a bounded observation, not an exhaustive XHR parity claim.

Observed native quirks intentionally reproduced include direct OPENED→DONE
trusted events without sync progress/upload events, original responseURL after a
real redirect, UTF-8 decoding retaining BOM despite charset overrides, Document
string bodies, Symbol description bodies (`Symbol()` sends `"undefined"`),
responseType/timeout guards, body-conversion TypeError retaining state1, and
cross-origin synchronous response headers exposing non-safelisted headers while
hiding Set-Cookie. An about:blank frame sends its inherited document referrer.

## Validation

- Final pre-adaptation source passed **23/23** checks on Node24.19.0,
  Node24.22.1 and Node26.13.0:12 new sync checks plus11 existing async checks.
- After copying the newer retained-world/codec/CORS Root sources while preserving
  the narrow XHR changes, **40/40** XHR, retirement, frame and header checks passed
  on Node24.22.1 and Node26.13.0. A further **52/52** worker checks passed on24.22.1.
- Native oracle matched15/15 before and after that adaptation. Earlier7/9 and
  Symbol/conversion differences remain in raw diagnostic logs; later files have
  distinct names. The first9-control JSON was overwritten by its second run,
  so its first raw log is retained but is not an exact complete-value artifact.
- The initial copied `process.execArgv` experiment failed because the test runner
  injects flags prohibited in workers; the final transport uses `execArgv:[]`.
  The owned initial failed runner was stopped after exact argv/cwd/exe validation.
- An initial response-interruption test interrupted the worker's cold first
  request before its response callback. Final controls warm the real transport
  and use explicit VM deadlines shorter than its network deadline, asserting the
  intended callback was actually entered. No assertions were disabled.

`manifest.json` fingerprints base, leaf, patch and evidence bytes. Archives retain
the23-check source and the current adaptation. Root's complete regression,
PureScript acceptance and unchanged upstream XHR fixture replay remain integration
checks; they are not claimed here. Port9582 was never used.

## Bounds and remaining gaps

Responses retain the existing16MiB body cap, plus1MiB transport metadata. Readiness
has a2s bound and actual network work uses the Page timeout. No streaming progress
is invented. HTTP(S) and data URLs use the real transport; synchronous blob-URL
reads are not implemented. Utility-world XHR and new XHR after frame retirement
have not been calibrated by this proposal. Native multipart edge cases, broader
redirect combinations, authentication, encoding and exhaustive WebIDL coercion
remain unproven. This is not a security sandbox or native performance claim.
