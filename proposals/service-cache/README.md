# Independent service-worker/cache profile investigation

No production files were edited. The five source registrations are independent
profiles: service-worker enabled60 and disabled61 have 8000ms budgets; cache
enabled76, teardown77 and disabled78 have 2000ms budgets. Every registration
loads iframe and worker resources. Only60/76/77 add the experimental
`serviceworker` flag. The unchanged source fixture bytes are hashed in reports.

## Preserved baseline and public contracts

`native-profiles.json`: native5/5 pass within the source budgets.
`candidate-profiles.json`: frozen independent baseline0/5; enabled service-worker
fixture remains pending at8002ms, other profiles fail actual assertions. Its first
capture also had a surface-inspection ReferenceError because isSecureContext was
absent; this instrumentation issue is preserved in
`candidate-profiles.initial.json`. The corrected report uses typeof safely.
No missing HTTP routes were requested in these profiles. The copied xhr-subset
transport implements the needed source `/xhr`, `/xhr/json`, `/xhr/xml`,
`/xhr/404` and100ms `/xhr/slow` contracts; no missing route becomes an empty200.
These fixtures are origin-relative and use owned port0 servers.

`native-controls.json` retains bounded public runtime observations with5000ms
command deadlines and a verified native executable SHA256:

* Cache constructors remain global when disabled; the caches property is absent.
  On enabled secure loopback documents it is stable. Opaque data iframe has
  neither caches nor navigator.serviceWorker but keeps constructors.
* Cache.open returns distinct wrappers to the same named store. Stored response
  bytes/headers/status survive independent reads. Native matching ignores Vary,
  supports ignoreSearch and keeps the GET restriction even with ignoreMethod.
  Returned keys drop fragments and original headers; matchAll is absent.
* Cached bytes survive navigation in the same browser context and disappear
  after context disposal. Service-worker registrations are per realm: a real
  same-origin iframe has no parent registration.
* register resolves in parsed state before worker fetch/evaluation completes;
  install's actual waitUntil delays activation. ready stays pending when the
  document URL is outside the active registration scope. Re-registration reuses
  the same scope/script registration. Unregister clears slots, changes the real
  worker state to redundant and returns true then false.
* Actual worker self-reports distinguish service and dedicated realms. A service
  worker has real fetch, WebSocket, CookieStore/cookieStore and secure context;
  it lacks XMLHttpRequest, FileReaderSync, postMessage, close and clients.
  Its global brand is ServiceWorkerGlobalScope, and its registration/worker
  identity is stable.
* Cross-origin script registration rejects SecurityError. Native accepts a
  cross-origin scope, accepts a text/plain script and activates it; a404 script
  registration initially resolves parsed then is removed within the observed
 100ms interval. These are bounded target behaviors, not general Web standards.

Two exploratory raw-CDP controls hit native one-target/one-context limits;
both partial artifacts remain separate. Final controls use iframe messaging and
sequential context disposal. No simultaneous-target/context support is inferred.

## Concrete Cache proposal

`cache-integration.patch`, `cache-overlay/src/`, `cache-proposal.json` contain an
isolated three-file patch against the exact source/native snapshot in
`manifest.json` (HEAD was7b30c27 plus coordinator integrations; hashes identify
the actual base). Both runtime and collections binaries/manifests were copied;
original node_modules bytes were not changed. Probe helpers are copied/hashed.

`src/cache.js` exports createCacheStore(), cacheStoreFor(page),
CACHE_REALM_SOURCE and installCache(page,realm,{enabled,secure,store,evaluate}).
The backing store is private and shared by origin within a real browser context.
Actual Response bodies are consumed; cached bytes are independent snapshots.
Every match constructs a fresh real realm Response stream. addAll fetches and
validates every item before atomic commit; disposal cancels real fetches and
prevents partial commit. Deleted-name Cache handles retain their real data.
Objects, arrays, promises and interface errors are constructed in the caller's
actual Window/worker VM realm. Cross-realm Response bodies use genuine branded
Response methods, preserving original body ownership.

Browser integration calls installCache after installFetch. Worker integration
uses private cacheOperation/cacheResponse messages to the actual host store;
the worker's Cache methods run in its VM and share real bytes with Window.
There are no fake worker loops or successful no-op cache writes.
Enabled is the explicit experimental serviceworker option; secure is supplied
by the installer. The prototype supplies a limited trustworthy-origin check and
isSecureContext property. The worker API owner is independently implementing
broader secure-context and dedicated-worker APIs, so merge these boundaries.

`cache-tests.txt`:11/11 meaningful isolated tests; `cache-regressions.txt`:91/91
existing worker/fetch/stream/messaging/navigator tests, concurrency1.
`cache-proposal-profiles.json`: unchanged enabled/teardown/disabled cache3/3
pass within2000ms. An earlier worker-overlay run had a first-navigation
transport TimeoutError at~5s while7/8 tests passed; it is preserved separately
as cache-tests-worker-overlay-first.txt. A quiet retry and final expanded runs
pass. No cause was inferred from that timeout.

Cache boundaries: buffered in-memory storage, no disk/quota eviction, explicit
TypeError for opaque/error status0 responses, no matchAll/ignoreMethod/Vary
matching (as observed native). Full secure ancestor-chain policy remains a
broader runtime concern. This stage does not implement ServiceWorker: its two
fixtures remain separate failures, and no five-profile completion is claimed.
Full-project/PureScript/multi-Node validation belongs to coordinator integration.

```sh
node --experimental-vm-modules --test proposals/service-cache/cache-tests.mjs
SERVICE_CACHE_SNAPSHOT=SNAPSHOT SERVICE_CACHE_IDS=76,77,78 node --experimental-vm-modules proposals/service-cache/profiles.mjs candidate OUTPUT.json
```
