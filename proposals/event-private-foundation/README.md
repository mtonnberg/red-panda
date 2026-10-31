# Genuine private Event backing and VM own accessor

Frozen integration.patch SHA256:
`4fcd210bf38b2deb0f7b594b29878c95c2aef19570a4a785a260c7f193d29a99`.
New src/dom-event-state.js SHA256:
`285e8ec2b7d0ca80851609dc3fefe17a3d35d4639c647054f4e9588df7943c9a`.

Apply after the frozen 116-interface DOM factory parity delta
`43315ab95d50fd63fca80c35fe89984d51149510b7562472333218a7fa0cc76f`.
The five modified-source baseline hashes match Root at packaging time, including
final compressor audio-core.js. `git apply --check` passes against current Root.
No Root production file was edited in this investigation. Leaves contain only
the 12 patch paths. No dependency files or native bindings are changed.

The original actual Event wrapper and genuine EventImpl are retained. Generated
setup/new write exact private provenance; Event brands, conversions and backend
reads use that private map. The own isTrusted getter is allocated in the selected
actual VM and reads the real private backend through a boolean bridge. Existing
Node/EventTarget backing remains outside this delta. Utility rewrapping shares
its real backend and preserves existing canonical wrapper ownership. Audio's
Event.setup is captured after generated factory initialization, before authors.

Validation:

- Seven owned focused tests pass on Node 24.19.0, 24.22.1 and 26.13.0. Logs:
  event-foundation-final-v2-24.19.0.log,
  event-foundation-final-v2-24.22.1.log,
  event-foundation-final-26.13.0.log.
- Actual public-V8 sameRealm/creationGlobal evidence:43 rows per runtime, both
  before and after null prototypes, covering main/frame/utility/newTarget and
  StorageEvent/animation/scheduler/audio producers. Public events/getters are
  genuinely in the selected VM; EventImpl is genuinely Host-created and private.
- Actual Native two raw expressions:39 rows. Candidate matches36 exactly;
  inherited typeFake/typeProxy/dispatchFake diagnostics retain different message
  text, while actual VM TypeError identity remains correct. New own getter
  matches Native Illegal invocation. The extra24 rows match exactly.
- StorageEvent's44 functional Native controls pass with its real new adapter.
  Nine original DOM wrapper allocation checks pass.
- Focused producer integration:100 of101 checks pass after correcting six
  scratch-only missing-input paths. This covers owned Events, StorageEvent,
  errors, XHR, messaging, animations allocation, audio, IndexedDB, text tracks
  and world protocol. The sole failing XHR direct Window.close retirement
  assertion also fails unchanged on Root; both exact logs are retained. No
  claim is made that the combined run was fully passing.

Exact commands (run serially, from isolated scratch):

```
node --experimental-vm-modules --test --test-concurrency=1 test/event-foundation.test.js
node evidence/event-context-proof.mjs evidence/event-context-<runtime>.json
node --experimental-vm-modules --test --test-concurrency=1 test/dom-wrapper-realms.test.js
node --experimental-vm-modules --test --test-concurrency=1 test/storage-event.test.js test/event-foundation.test.js
node --experimental-vm-modules --test --test-concurrency=1 --test-skip-pattern='public audio values|metadata remains' test/event-foundation.test.js test/storage-event.test.js test/errors.test.js test/xhr.test.js test/window-messaging.test.js test/animations-allocation.test.js test/audio-core.test.js test/indexeddb.test.js test/text-tracks.test.js test/world-protocol.test.js
RED_PANDA_REFERENCE_TESTS_ROOT=/workspace/red-panda/.cache/lightpanda-reference/browser-948d773786/src/browser/tests node --experimental-vm-modules --test --test-concurrency=1 --test-name-pattern='private scheduling|40-control|live channel acquisition|unchanged upstream' test/audio-core.test.js test/window-messaging.test.js
node --experimental-vm-modules --test --test-concurrency=1 --test-name-pattern='navigation and page closure' /workspace/red-panda/test/xhr.test.js
```

The retry requires the read-only proposals symlink to Root; its three audio
oracles are unchanged original inputs. All HTTP/CDP servers used ephemeral
ports and were closed. No broad/full/PS or heap-enumeration suite was run.
Old failed logs are deliberately retained: stale scratch native collections
initially lacked createStorage; first producer run lacked proposals and pinned
fixture-root paths. These were corrected in the scratch, not hidden or recast as
source regressions. The inherited StorageEvent allocation counterexample shows
the original own getter's actual Host creation context.

Bounds: initialization is before Red Panda creates any Window. Already live
external JSDOM Event unforgeables cannot be migrated. Other IDL backing symbols,
existing unsupported custom utility adapters, and the independently reproduced
Root Window.close retirement defect are outside this narrow patch. See the
included docs/reference/event-foundation/README.md for the runtime contract.
