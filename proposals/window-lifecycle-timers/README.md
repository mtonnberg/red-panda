# Window stop and timer ownership

This isolated proposal is based on the exact phase21 working graph, with HEAD
b3ff8a9181c2746c83f7af5b566c7d02e0eedd61 plus its 73 applied leaves and runtime
source SHA cb235f736c7ab4171543d29f6a7278c1c895f35785d001ed2115e43b3c3bedd6.
HEAD alone is insufficient to reconstruct it: exact per-file inputs are retained
in the raw root-source manifest. No Root runtime/test/dependency file was edited.

The change installs genuine selected-VM timer/stop methods over captured real
per-document task and cancellation owners. Host records retain the exact
originating document, VM, callback intrinsics, timer handles, pending load
providers and parent/child ownership. Retained authority never comes from an
authored symbol/getter or a later public-global lookup. Window receivers are
recognized by trusted startup registration; copied symbols, inherited objects
and proxies fail before conversion. Public callbacks/results remain real.

Native directly establishes a 2048 active repeating-timer limit per receiving
Window. One-shot admission is independent (4100 tested), and both clear methods
release interval admission. Numeric delay conversion precedes handler conversion
and compilation. String handlers are genuinely compiled on admission; invalid
source produces the measured selected-VM Error("CompilationError"). IDs come from actual
underlying timers; actual callbacks, string code, argument identity, cancellation
and repeated scheduling are preserved. Borrowed methods use the receiving
Window's task owner but their defining Window as callback this/error recipient.
The existing canonical invocation mechanism executes callbacks; source fixture
load/assertion contracts are not changed.

Stop captures all custom load cohorts across the active descendant tree before
any cancellation handler can create a new request. It delegates real resource
aborts to the original document script/resource manager, aborts actual pending
fetch transports with the measured TypeError, and synchronously emits genuine
trusted XHR readyState0/abort/loadend events. It does not dispose the document or
cancel its timers. Nested stop calls and requests started by cancellation
handlers are covered. Providers are captured once per originating document,
so a stable public WindowProxy cannot retarget an old owner to a new load set.

Frame retirement cancels existing timers and actual XHR transports without
fabricated events or completed values. Native leaves a retired in-flight XHR at
readyState1; later explicit abort emits the measured state0 events. New timers
on a retained detached frame continue to run. Existing fetch-retirement behavior
silently leaves old promises pending and remains unchanged. The generic ordinary
XHR.abort path retains its existing state semantics; this is not a complete XHR
parity claim.

There is no Native engine import, dependency addition, CXX modification,
prototype/heap/key/protocol masking, fixture branch, stored output replay or
synthetic successful transport. Native executable SHA256 is
9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f.

## Evidence and limits

Raw authored Native controls cover admission, exact public descriptors and error
realms, conversion order, handler compilation, handle ranges, real callbacks,
borrowed receivers, frame lifetime, stop/fetch/XHR/nested handlers and actual
parser/deferred-script errors. Every control uses owned ephemeral HTTP/CDP
servers. They are separate from unchanged source-fixture acceptance.

The final quiet epoch passes twelve scoped checks on Node 24.22.1 in 6.06
seconds. The two private-brand/realm tests also pass on Node 24.19.0 and
26.13.0. Each runtime has 20 actual public-V8 realm rows before/after null
prototypes and Host=false; the complete twelve-test batch was not repeated
on the other SDKs.

Both requested unchanged source fixtures pass on Native (2/2) and candidate
(2/2) in the reserved quiet epoch, with original 2000ms load + 2000ms assertion
contracts, actual upstream transport on canonical 9582, unchanged testing.js,
actual Native harness branch and exact registration map SHA256
066ad73e170657f43d79ca4f35b0741c18cec15dbed44bb1dba0518bf400c9b8.
Native loads were 29/27ms; candidate stop loaded in 288ms plus 4ms assertion,
and timer_limits in 173ms plus 3ms assertion. No fixture, assertion or source
budget changed. All five subprocesses exited successfully; the five source/test
inputs stayed byte-identical throughout. Servers and children closed before
releasing the 13.7-second quiet lease. Raw reports and commands are archived.

The optional integration-after-root-corrections.patch statically preserves
Root's later unrelated XML XHR body correction. It applies cleanly and has
exact before/after leaves; its runtime composition remains UNRUN. Source
acceptance above belongs to the standalone five-file graph, not that alternative.
Neither full/broad regressions nor PureScript checks were run for this proposal.

The first retired-XHR implementation run is retained as ten pass/one fail: a
transport rejection incorrectly re-entered the dormant logical abort path and
emitted error4. The guard now permits that dormant path only for explicit
state0 abort, while suppressing real canceled-transport settlement. Earlier
baseline records show the unmodified implementation instead finishing the
retired XHR as load4. These contrary observations are not overwritten or promoted.

A known independent ordering gap is explicit: Native drains independent Window
timer queues in a different order from Node's underlying global timer queue.
The error control retains and asserts that difference while comparing the real
recipient/error-value mapping separately. No runtime ordering filter is used.
The narrow parser control also observes timer=false at load on both targets;
it does not establish the result of the larger unchanged stop source fixture.
Future owned RealmHandle integration needs its explicit compile/run authority;
this proposal uses the current actual Node Contextify contexts, not a prototype
repair or a fake owned-context assertion.
