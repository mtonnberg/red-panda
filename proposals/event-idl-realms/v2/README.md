# Frozen Event interface realms, with genuine Host-origin preservation

Use this v2 patch; the earlier96f07a candidate is retained unchanged.

Patch SHA256:
`d9e52d19e08754dc924e60b9dd69833dd797dc2e953cbc4bc77533ee4a1c77ff`.
New module SHA256:
`b241ebb8b4bdecec74c93849a0fb67d817b41a79f2b8df8bfcf7a3ff7958f22c`.

Fourteen paths: one narrow dom-wrapper-realms.js modification, one new module,
one test and Native contract docs. Base dom-wrapper source is f438916f;
`git apply --check` passes against frozen Root. Production runtime.cc is unchanged
c9842bf9. No Root production files were edited.

Strict ordinary selected-VM constructors use their actual implicit receiver, then
the original Host conversion body invokes canonical setup on that SAME receiver.
The V8 allocation performs one prototype read before conversion, handles foreign
newTarget and primitive-prototype fallback, and allocates in the actual selected
VM. Public prototypes/methods/accessors are genuinely VM-created, with Host-private
operations/cache/controllers and genuine original backends. Illegal receivers use
captured VM TypeError. EventTarget's measured global/null/undefined receiver
fallback is preserved. Genuine no-runScripts Host JSDOM retains its original Host
interfaces; no VM is fabricated there.

Final validation:

-8/8 owned tests pass on exact Node24.19.0,24.22.1,26.13.0. Logs:
  evidence/event-idl-final-v3-<runtime>.log.
-439 direct public-V8 creation-context rows per runtime, before and after null
  prototypes. All selected-VM/Host=false/creationGlobal correct. These cover20
  families in main/frame/utility, foreign newTarget receivers and fallback.
  Final source hash is recorded in interface-context-v3-<runtime>.json.
-30 actual Native rows,29 exact. Standalone EventTarget composedPath includes
  target in jsdom while Native omits it; the test records this existing path
  boundary and returns genuine backend entries, never captured/artificial paths.
- Four real producer checks pass: audio completion, animation setup, native
  Window port transfer and trusted XHR. They ran before the final Host-only
  preservation branch; VM behavior was unchanged by that branch. Earlier22
  Event/allocation/Storage checks passed before the last entry revision and are
  retained as earlier evidence, not claimed as a final combined suite.
- A genuine no-runScripts Host control verifies identity, functionality and actual
  Host constructor/prototype context before/after null prototypes. This direct
  adapter check is separate from webstorage's foundation Host/stale-alias fix.

Exact focused commands:

```
node --experimental-vm-modules --test --test-concurrency=1 test/event-idl-realms.test.js
node evidence/interface-context-proof.mjs evidence/interface-context-v3-<runtime>.json
node --experimental-vm-modules --test --test-concurrency=1 --test-name-pattern='render completion|owned setup|XHR uses shared|native-entry Window transfer' test/audio-core.test.js test/animations-allocation.test.js test/xhr.test.js test/window-messaging.test.js
```

All raw experiments/failures remain: initial native API Function::New/template
entries had nonconfigurable arguments/caller absent Native and were rejected;
first producer run caught unbound Window listener failure, fixed and verified
against three fresh Native controls; genuine VM derived-class and captured Object
entry alternatives were measured then replaced by simpler real implicit-this
construction. No reflection/heap/toString/protocol filtering, Proxy constructor,
extra public Event facade or experimental native addon is included.

Integrate the separate private-event utility backend recognition patch
274f9ded1dfa35f455b9169ab14d55839c5e70c906ebfc32c0c4e4606acdeef2 and its owner-provided
Browser callback tests independently; it is overlaid in final proofs and excluded
from this patch. Coordinate webstorage's separate genuine Host/private-getter and
stale-producer-alias correction before composed Host JSDOM checks. Those shared
foundation changes are not duplicated here.

Utility interfaces were already genuinely VM-created and are measured here; their
existing constructor ordering is unchanged. Legacy EventTarget physical backing,
other Node public interface realms and original argument-conversion diagnostics
remain separate scope. No broad/full/PS/source-budget or heap-enumeration suite
was run in competition with Root. No owned jobs or ports remain.
