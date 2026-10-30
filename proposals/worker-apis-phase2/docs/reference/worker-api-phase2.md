# Dedicated worker API phase two

This isolated delta preserves the phase-one 39-check milestone. Its frozen base
is the exact phase-one candidate, including both native helpers for all three
supported Node versions. frozen-source.json identifies all 96 base files and
the immutable phase-one proposal manifest. Shared production files are untouched.

The delta implements genuine synchronous cross-origin XHR/preflight/credentials,
synchronous multipart upload, captured immutable Blob reads, and socket
cookie/UA/language policy through the actual parent BrowserContext. It does not
change Window synchronous XHR or invent successful unsupported operations.

## Bounded Native controls

Public CLI and direct CDP calls used owned ephemeral HTTP/WebSocket servers,
actual worker programs, core0 and external process-group watchdogs. Native
binary, probe source, arguments, worker source, actual request headers/body
bytes, DOM-delivered reports, stdout/stderr and exit/signal are retained.
No target engine production source or JavaScript Puppeteer workflow was used.

* Async and synchronous cross-origin XHR both perform actual preflights for
  PUT/custom headers. Preflights omit cookies even when withCredentials=true.
  Actual requests exclude cookies when false and include the real jar's
  HttpOnly/session cookies when true. Wildcard ACAO with credentials is denied.
* Denied synchronous credentialed CORS throws NetworkError with message
  "A network error occurred", status0 and no load/error/timeout/abort callbacks.
* Sync/async FormData POSTs preserve ordered duplicate fields, binary File
  bytes 0,128,255, MIME types and UTF-8 filenames. Text line endings normalize
  to CRLF; quote/CRLF in disposition names are percent escaped. Actual raw
  multipart bodies and independently parsed entries are retained.
* WebSocket upgrades send scoped jar cookies including HttpOnly values. They
  honor actual user-agent/language overrides. Set-Cookie on the measured 101
  response is ignored; a subsequent actual worker XHR does not see that cookie.
* Both CLI --http-header and Network.setExtraHTTPHeaders are ignored by Native
  WebSocket upgrades, including Cookie, X-Policy and Accept-Language overrides.
  The same headers do affect the real document/worker-script/follow-up XHR
  requests. A direct CDP control distinguishes extra Accept-Language=xx-XX
  from actual UA override language=zz-ZZ: the upgrade sends zz-ZZ.

Some Native cases finish the worker, emit JSON and hang in cleanup until the
external watchdog; the reports preserve that distinction. The initial CLI
User-Agent-as-http-header control is rejected by Native with "Use --user-agent
instead" and is retained. Its corrected --user-agent control is separate.

An early candidate checkpoint expected CLI headers to override socket cookies,
which was incorrect. Inspection of the physical Native upgrades disproved it.
That superseded passing candidate log is retained; the final source and tests
implement the actual observed policy rather than claiming the earlier result
established parity.

## Implementation and integration

worker-xhr.js shares actual preflight validation between async and sync paths.
The sync path uses the existing binary-safe parent Page.fetch channel for both
OPTIONS and the actual request, with real credentials modes. It validates
actual CORS responses and exposes no forbidden body bytes. Failed synchronous
network operations throw instead of fabricating asynchronous completion events.

worker-multipart.js serializes real FormData entries, captured public Blob/File
metadata and actual bytes. Sync reads use the existing genuine FileReaderSync
reader thread; async reads use captured public Blob.arrayBuffer. Headers,
ordered duplicates and line endings are encoded independently. Captured methods
prevent an authored Blob.arrayBuffer/FileReaderSync override from substituting
invented bytes. Real Blob type/size getters likewise bypass own-property
replacements. Multipart boundaries are independently randomized; equality of
random boundary tokens is not a meaningful compatibility contract.

worker-socket-policy.js runs only in the parent host. It reads the real scoped
CookieJar and actual Page userAgent/acceptLanguage, ignoring extra/CLI headers
as observed. The private socketPolicy RPC returns bounded metadata through a
SharedArrayBuffer. The socket is still a real ws/wss connection in the worker;
the genuine upgrade receives the selected cookies/headers through the public
ws finishRequest hook. Neither header arrays nor jar objects are exposed to
authored worker code. The RPC does not pretend to be a network response.

Merge only these workers.js hooks into Root's newer combined Cache/SW runner:

1. Import workerSocketPolicy and the socket policy sync helpers.
2. Handle private kind=socketPolicy beside the existing request/cache/service
   routes, replying with completeWorkerSocketPolicy after real policy lookup.
3. Pass socketPolicy:createSyncWorkerSocketPolicy(parentPort) into the common
   installWorkerAPIs options, preserving service-mode dedicated:false, actual
   private creator metadata, redirected base URL and all Cache/SW protocol names.

Changed helpers are worker-xhr.js, worker-websocket.js and
worker-sync-transport.js. New modules are worker-multipart.js and
worker-socket-policy.js. worker-apis.js and the phase-one readers are unchanged.
The standalone workers.js is evidence for these hunks, not a replacement for
the newer shared Cache/SW graph.

## Bounds still explicit

* Sync network responses keep the 8MiB encoded envelope and 5s per-transport
  bound from phase one. Socket policy metadata is capped at1MiB and5s. That
  synchronous policy bridge can briefly block its worker; it does not establish
  fully nonblocking browser constructor behavior under an overloaded parent.
* Sync multipart bodies are capped at8MiB and async multipart at64MiB. Exceeding
  those explicit buffered limits fails instead of inventing a body.
* Full redirect-time CORS revalidation, preflight cache/expiry, every safelisted
  header/method edge, site-aware cookie policy and URL username/password remain
  incomplete. Redirects requiring a fresh preflight are rejected.
* Socket proxy/redirect policy, client-hint/Accept-Encoding generation,
  compression and full browser transport policy remain separate gaps. The
  measured cookie/header subset is implemented, not a claim of complete socket
  parity. The observed 101 Set-Cookie omission is deliberately preserved.
* The phase-one worker DOMException/VM Error inheritance gap remains explicit.
  Full execution deadlines and Window synchronous-XHR architecture are separate.

## Validation

The exact frozen final source passes 47 checks on each of Node24.19.0,
Node24.22.1 and Node26.13.0:26 focused API tests plus21 existing worker tests.
They exercise actual HTTP preflights, binary/multipart bodies, denied responses,
cookie/UA/language headers, BrowserContext isolation, immutable Blob reads,
physical socket bytes and cleanup. All use external watchdog/core0.

proposal/worker-api-phase2.patch is a reviewable delta over the phase-one
milestone. Source/test hashes and logs are recorded in the manifest. The final
combined Cache/SW installation must be validated after the worker hunks merge;
this standalone matrix does not falsely claim that separate integration ran.
