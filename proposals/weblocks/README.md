# Bounded Web Locks checkpoint

This is an independent implementation against the observed Native executable, not a copied native engine. The task changed no Root production file. `integration.patch` adds two new files plus exactly an import and installer call in Browser.prepareWindow. It applies after Root's CSS, Storage and Canvas integration. `candidate/` contains frozen new files. Full integration-base/result Browser files are review artifacts; use the narrow patch to preserve later work. The isolated tested graph is `/workspace/shared/web-locks-20261031`; `base-source-hashes.json` and `candidate-source-hashes.json` fingerprint its complete source/native/test closure. Only its Browser changed among existing files; web-locks.js and its focused test are the only additions. Parent should validate integration against its final combined graph.

All HTTP/CDP helpers bind owned ephemeral localhost ports, create fresh targets/contexts, and close clients, servers and owned Native processes in finally. Data are generated fixture strings and actual lock requests. No personal data, outside services, port9582 or external writes are used. Existing proxy configuration was retained while appending localhost bypasses. No new dependency, native binding, broad/full/heap or PureScript suite was introduced or run.

## Calibrated behavior and implementation

Native binary SHA256: `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.

- Actual LockManager and Lock values are allocated in their real realm, privately branded with WeakMaps and registered at trusted successful platform factory calls. Public methods reject proxies/lookalikes without reading authored metadata. No lock value, query result, protocol response, classification or identity is substituted.
- Native uses separate **document-owned LockManagers and pools**, even for same-origin frames. Parent and child can independently acquire the same exclusive name, see separate snapshots, and have separate genuine manager identities/prototypes. This measured behavior takes precedence over a standard origin-shared pool. Each manager retains its genuine private document and BrowserContext ownership.
- Requests reserve available locks before returning but run callbacks as separate owned tasks, after current microtasks. Held locks remain held through actual callback Promise/thenable settlement. Return values and rejection reasons retain their real identities. Release/promotion precedes request Promise resolution. Snapshots are fresh realm arrays/plain records in actual request registration order across names and later promotions.
- Shared locks coexist; a pending exclusive waiter prevents later shared overtaking. ifAvailable schedules a genuine null callback when blocked and does not add a pending lock. Steal rejects real holder Promises with the measured AbortError, handles multiple shared holders and unrun reservations, and preserves existing waiter progress. It does not drain rejection microtasks inline.
- Genuine AbortSignal records are accepted through the trusted factory ledger. Pre-aborted, reserved and pending requests reject with the exact real reason and leave the queue before rejection handlers run. Abort after callback start is ignored. Cancellation unregisters the real abort algorithm.
- Callback receiver, returned Promise, Lock instance, query arrays/records and errors follow the invoked method's actual realm. Safe cross-realm borrowed request/query controls verify this without aliases or rewrapping.
- Client IDs are allocated for **every actual Page/frame registration before first locks access**, using the real browsing context/frameId as a stable key in a per-Browser registry. They remain stable over navigation and advance for new frames/targets/contexts. Native observed IDs are1 for the original target,2 for its child,3 for the next target and4 for a fresh-context target. Root's real UUID/protocol identities remain intact and are preserved separately in raw reports.
- Full navigation creates a fresh manager and queue. Retiring/removing an iframe preserves its genuine held request lifetime until its actual callback resolver settles. Full owner teardown cancels unrun grants, removes abort algorithms and clears owned queues/timers; it does not fabricate settlement of orphaned Promises.
- Exposed shapes, prototype order, method arities, constructor/getter brands, observed overloads, enum/option validation order, reserved names, Symbol descriptions and well-formed UTF-8 name conversion match the controls.

## Frozen evidence

`comparison.json` links each observation to raw Native and candidate reports with identical helper hashes. **37/37 runtime rows match exactly**, using JSON strings explicitly authored by the probe:

- `native-v1.json` vs `candidate-v2.json`:16/16 main interface, queue, lifetime, scheduling, abort/steal and navigation rows.
- `native-scope-v2.json` vs `candidate-scope-v1.json`:11/11 runtime rows for ownership, client IDs, overloads, safe borrowed realms and retirement. Three additional protocol identity rows intentionally retain actual Native FID/BID strings and candidate UUIDs; they differ and are not counted as matching rows.
- `native-callback-v1.json` vs `candidate-callback-v1.json`:3/3 receiver, option error precedence and query scheduling rows.
- `native-edge-v2.json` vs `candidate-edge-v1.json`:7/7 pre-task/shared-holder stealing, global query ordering, independent snapshots and readonly Lock rows.

The unmodified pinned upstream **weblocks.html** fixture and testing.js were served from the local source cache. `native-fixture.json` and `candidate-fixture.json` both return `{ready:true,ok:true}` from upstream testing.assertOk(). `root-baseline-fixture.json` returns `{ready:true,ok:false,error:"Failed"}` before Locks integration. Fixture/helper hashes and raw CDP events are retained.

Focused serial test results on the frozen new source: **15/15** for prepared Node24.22.1, system Node24.19.0 and Node26.13.0, respectively in `final-tests-node24.txt`, `final-tests-system-node24.txt` and `final-tests-node26.txt`. These cover genuine brands/provenance, task ordering, adoption and rejection identity, callback Promise lifetime, exclusive/shared fairness, availability, stealing, abort/timeout cleanup, validation, frame realm ownership/retirement, client lifetime, opaque pages and snapshot ordering. No broad regression result is claimed.

## Remaining gaps and retained failures

1. In `native-scope-v1.json`, a cross-realm **steal** call caused the owned Native CDP connection to close before returning. That is an unresolved observed connection failure; its cause and process exit were not captured, so it is not proof of a particular Native exception or crash. `scope-probe-v1.mjs` preserves the exact helper. Revised controls omit that unstable branch. Candidate's ordinary queue implementation can execute borrowed steals, but parity of that branch is unestablished; no synthetic failure is injected.
2. WorkerNavigator.locks and isolated utility-world behavior were not calibrated or specifically integrated. Only actual main/frame Window realms are established by these controls. Secure-context policy outside the observed localhost HTTP and accessible data: cases is unestablished.
3. Full owner teardown is tested for stopping unrun callbacks and creating fresh pools. Native settlement behavior of externally retained request Promises after complete target/context destruction is not established; the adapter abandons such requests without fake completion. Retained iframe retirement has separate positive Native evidence.
4. Exhaustive coercion/prototype-poisoning, all callback timeout behaviors and all cross-origin combinations are outside these bounded controls. This checkpoint does not claim complete Web Locks or browser parity.
5. The initial14-test run had13 passes and one **test harness** failure: an async assert.rejects validator returned a Promise instead of true. This was corrected without changing API behavior. Its log is retained as history; final15-test logs are canonical. candidate-v1 and native-edge-v1 are superseded epochs; their sources/evidence remain available. MaxListenersExceeded and VM-module experimental warnings are visible in fixture logs, not hidden.

## Reproduce

Use the already prepared Node executable with --experimental-vm-modules. Preserve proxy settings and append localhost/127.0.0.1 to both NO_PROXY spellings. In the integrated checkout run `node --experimental-vm-modules --test --test-concurrency=1 test/web-locks.test.js`.

Run a helper as `node --experimental-vm-modules proposals/weblocks/probe.mjs <new-output.json>`, or similarly scope-probe.mjs/callback-probe.mjs/edge-probe.mjs, for Native. Set WEB_LOCKS_CANDIDATE_ROOT to an absolute candidate checkout to run the same controls against it. `fixture-probe.mjs native|<candidate-root> <new-output.json>` serves and executes the pinned upstream fixture. Outputs use exclusive creation and must be new paths. Tests and controls should be run serially; no bulk jobs are needed.
