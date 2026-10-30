# Frozen Cache, ServiceWorker and dedicated-worker combination

The final immutable source graph is `/tmp/red-panda-service-combined-06ansi0a`.
`combined-proposal.json` identifies all eleven source files and their exact base
and proposed hashes; `combined-overlay/src/` retains complete reviewable files.
`combined-integration.patch` is against the original frozen source manifest,
not mutable Root. No production files, dependencies or native sources changed.
Both exact runtime/collections native binaries and manifests were copied into
each graph. Original node_modules bytes remain unchanged.

This combines the previously frozen Cache patch, the independently authored
service lifecycle, and independent_input's final six real worker API modules.
Their provenance is hashed in worker-api-inputs/manifest.json. The agent's
standalone installer must not overwrite the combined workers.js hooks.

## Verified outcome

The exact final graph passes:

* All five unchanged source profiles: ServiceWorker enabled766ms and disabled41ms
  within their8000ms registration budgets; Cache enabled100ms, teardown41ms and
  disabled150ms within2000ms. No requested route is missing. Profiles retain the
  source-specific experimental flag, iframe/worker policy and external harness.
* 46 focused tests:12 actual ServiceWorker lifecycle/VM/HTTP/cache/socket tests,
  11 real Cache data/lifetime tests,18 input-agent worker API tests and5 private
  metadata/redirect controls. No harness assertion or fixture source was changed.
* 242 existing frame/focus/shadow/reset/module/classic/parser/selector plus
  worker/fetch/stream/messaging/navigator tests, run sequentially against copied
  source and tests. Final combined checks run Node24.19.0. The worker agent's
  separate39-check matrix on24.19/24.22/26.13 is independent evidence and is not
  represented as a combined multi-Node validation.

Reports: combined-profiles.json, combined-focused-tests.txt,
combined-regressions.txt. Native5/5 controls and exact exposure/lifetime reports
remain described in README.md. Source-profile results are bounded conformance
evidence, not full Lightpanda replication.

## Installation and lifetime boundaries

After installFetch, installCache receives the actual context store, explicit
experimental feature flag, private secure-context decision and current private
Document base URL callback. Cache creates genuine realm classes, Request and
Response bodies; it captures branded accessors/constructors rather than reading
authored replacements. Root should retain its existing beforeParse installers.

installWorkers returns a host-only createService capability. An unforgeable
per-spawn token selects the service configuration; public Worker construction
cannot select that mode. installServiceWorkers(page,window,{enabled,secure,spawn})
installs the genuine interfaces and per-document registration container. The
experimental entry is available only in the secure enabled profile; constructors
remain present in disabled contexts. CLI integration must translate native
`--experimental-features serviceworker` into the explicit Browser option
`experimentalFeatures:{serviceworker:true}`; this proposal's runtime profiles
use the Browser option directly and do not claim completed CLI handling.

Actual worker threads execute scripts/module imports in their existing VM.
Thread readiness follows real HTTP fetch/evaluation. Trusted install/activate
ExtendableEvents extend lifetime with real promises, including pending/rejected
extensions. Parsed/installing/installed/activating/activated/redundant states,
registration slots, stable identities, longest scope lookup and matching-scope
ready promises follow those operations. Registration reuse/replacement and
unregister act on the actual worker; they do not simulate passing state flags.
Page-to-worker messages use actual structured cloning and transferred buffers.

The service VM has real fetch, WebSocket and basic CookieStore operations backed
by the context cookie jar, while omitting the dedicated blocking APIs. Its own
registration and ServiceWorker are real per-realm objects. It has no global
postMessage/close/client interface. installWorkerAPIs receives dedicated:false
for services and dedicated:true for normal workers. installWebSocket uses real
connections; dedicated XHR and FileReaderSync use actual transports and Blob
byte reads. Cache operations have private cacheOperation/cacheResponse RPC;
service state/lifecycle/cookie RPC is separately named. Original HTTP/cookie/
abort handling remains on Page.fetch. Dispose/navigation/raw Window.close
terminate actual owned threads, timers, sockets and requests.

## Redirect correction and private creator settings

Capture actual Document identity before authored code, then read current private
origin/base/security at Worker construction. The shared captureWorkerCreator
helper reads pinned DocumentImpl state and actual private frame ancestry.
Authored replacements of origin/isSecureContext/baseURI/location do not become
API authority. Genuine base elements still affect resolution. Worker Cache and
request/socket adapters read the actual final private worker script URL after
HTTP redirects, rather than retaining the initial requested string.

The isolated redirected-frame control failed before the correction: location
committed `/final/frame.html`, but cached base stayed `/redirect-frame`, Cache
stored `/entry`, and a real relative Worker requested `/worker.js` and received
the owned server's404. Correct paths are `/final/entry` and `/final/worker.js`.
`redirected-frame-before.txt` preserves that result; after clearing the actual
pinned DocumentImpl base URL caches at final-response commit, the real Worker
fetch and all values pass. `redirected-frame-integration.patch` is the separate
exact one-line hunk for Root's newer frame file. No EOF/readiness/document reset
was invented to repair URL resolution. The additional redirected-worker control
independently found Cache resolving against its copied initial script URL; an
explicit callback to the final private workerData.url repairs that actual
relative-key error. redirected-worker-before.txt preserves the failure and the
final focused cohort covers the correction. Its first test expression had an
extra invocation on a Promise; that adaptation error is retained separately.

## Explicit remaining gaps

Service workers are per-document as observed native here: no persistent
background registration, clients/controller takeover, fetch interception or
update pipeline. update and service self-messaging reject NotSupportedError.
skipWaiting records the actual request; the current policy activates a newly
installed worker immediately because there is no incumbent update pipeline.
CookieStore supports actual basic reads/writes/deletes, not partitioned entries
or cookie-change delivery. Service worker secure-API exposure through every
cross-origin redirect/ancestor mutation and every interface exposure is not a
complete calibration. Cache is buffered/in-memory with no disk/quota support;
opaque/error status0 caching rejects explicitly. Worker socket cookie/proxy/
redirect and broader credential policy limits remain in the worker-agent scope.

An initial final-test adaptation missed two relative imports in the newly added
worker-controller test; combined-focused-test-import-first.txt preserves the
module-not-found error. Only copied test import paths were corrected; all46
tests then passed. Earlier native CDP-limit controls and the one navigation
timeout remain separately preserved, never reclassified as engine passes.

All owned runtime jobs are quiesced. Root owns production merge, CLI wiring,
full-project/PureScript checks, commits and subsequent compatibility work.
