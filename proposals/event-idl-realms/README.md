# Genuine public Event interface realm slice

Frozen patch SHA256:
`96f07a08c88db300246e1c82e78767f11e370c7ede4a80cff5d933497f113c58`.
New event-idl-realms.js SHA256:
`21e5d7a54334ccbf1e12b75bbe7df0b84be206bf0ca582d7a86e6b6c4196d4bc`.

This14-path delta modifies only dom-wrapper-realms.js and adds one module, one
focused test and Native contract documentation. It is based on private-Event
foundation source f438916f and keeps the original116-source fingerprint guard.
`git apply --check` passes against Root. No Root production edits occurred.

Public constructors/prototypes/members are genuinely allocated in the selected
VM. Strict ordinary constructor functions let V8 perform its actual receiver
allocation once before argument conversion, then the original pinned Host
conversion body calls canonical setup on that SAME receiver. It preserves foreign
newTarget allocation, primitive-prototype fallback and exact no-new errors.
Methods/getters/setters are genuine strict VM functions over Host-private original
operations. Canonical exports, backend types, private Event brand map and dispatch
remain. There are no reflection/heap/toString/protocol filters, constructor Proxy,
extra public Event facade, or production native binding change.

Validation on final source:

- Seven owned tests pass on Node24.19.0,24.22.1,26.13.0. Logs are
  event-idl-final-v2-<runtime>.log.
- Direct public-V8 sameRealm/creationGlobal:439 public values per runtime,
  before and after null prototypes; all selected-VM and Host=false. This covers
  all20 Event/EventTarget interface families in Window/frame/utility plus foreign
  newTarget receivers and primitive prototype fallbacks. Source hashes are in
  interface-context-v2-<runtime>.json. The baseline sample was57 Host objects
  among65 values; retained untouched as contrary evidence.
-30 raw Native rows:29 match exactly, including method descriptors, physical
  definition order for Event/EventTarget, global/null/undefined Window calls,
  ordinary/foreign newTarget, ordering, fallback, subclassing and fresh arrays.
  The one explicit inherited boundary is standalone EventTarget composedPath
  content: actual jsdom path includes target, Native omits it. Values are real
  backend path entries; no saved or invented path output is substituted.
- Four final focused real producer checks pass (audio trusted completion,
  animation actual setup, native Window port transfer, trusted XHR events).
  Earlier22 allocation/Event/StorageEvent checks passed before the last entry
  revision; they are retained as earlier evidence, not recast as a final run.

Exact serial commands:

```
node --experimental-vm-modules --test --test-concurrency=1 test/event-idl-realms.test.js
node evidence/interface-context-proof.mjs evidence/interface-context-v2-<runtime>.json
node --experimental-vm-modules --test --test-concurrency=1 --test-name-pattern='render completion|owned setup|XHR uses shared|native-entry Window transfer' test/audio-core.test.js test/animations-allocation.test.js test/xhr.test.js test/window-messaging.test.js
```

The final four-producer run is event-idl-final-producers-v2.log. Its first run
caught a real unbound global EventTarget receiver regression; the corrected bridge
preserves generated Window fallback and now exactly matches three fresh Native
controls. Both failure and successful rerun remain. Source-budget fixtures,
broad/full/PS and heap-enumeration suites were not run during Root's full suite.
All tools/servers used ephemeral ports and have stopped.

The separately owned private-event-utility-backing.patch SHA256
274f9ded1dfa35f455b9169ab14d55839c5e70c906ebfc32c0c4e4606acdeef2 is overlaid for
final proofs and is NOT duplicated in this patch. It fixes the actual private
backend-to-utility callback route and must be integrated independently. Root has
its owner-provided regression. Utility interfaces were already genuine VM values;
their existing constructor ordering profile is unchanged by this Window/frame
bootstrap delta. EventTarget legacy physical backend branding, other generated
Node public interface realms, and original argument-conversion diagnostics remain
separate scope.

Rejected public-V8 constructor experiments are evidence only. Both Function::New
and FunctionTemplate produced genuine selected-VM receivers but also introduced
nonconfigurable arguments/caller fields absent from Native. The source and raw
counterexamples are retained. Production runtime.cc remains c9842bf9 unchanged;
no experimental addon/API is included or required.
