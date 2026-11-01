# Canonical PointerEvent public implementation

Over ba3a239, the actual V8-created receiver is initialized once by canonical
MouseEvent setup. One private Mouse/Event backend holds pointer values and raw
coordinates. Genuine VM definitions and utility fronts preserve canonical
backend identity and strong brands. The current type selects measured click,
auxclick and contextmenu floor behavior; initEvent recovers original fractions.
No public getter facade, added Proxy, prototype repair or fake instanceof
implements this behavior.

The main checkout passed75/75 selected tests:8 prior Native-backed Pointer
cases,2 new retained Native heldouts and65 existing input/Event/utility cases.
The extra heldouts compare42 value and24 realm rows exactly. Eight feature
cases pass on each SDK; the two extra heldouts separately pass on both other
SDKs. Actual creation proofs on all3SDKs cover51 VM/non-Host values before/after
prototype=null and6 actual receiver/canonical-backend controls. Root repeated
those51+6 at integration. Syntax checks cover changed JavaScript files.

The unchanged original event/pointer.html fixture passes separately on Native
and Root under2s load+fresh2s assertions/WS50. Only the disclosed external
harness eligibility acceptsRedPanda; actualUA/clientHints and originalfixture
assertions stay unchanged.6850 monitored source/dependency/native inputs remain
stable. This is one fixture, not a new455 census.

The original broader65 run hit its35s administrative limit after reporting65
case passes with no final summary. It remains failed and unexplained. Matching
baseline/candidate2-case read-only diagnostics then passed; matching full65
baseline and candidate epochs passed under the SAME35s cap (20.091/15.619s,
7436/7438stable). No causal cleanup/performance fix or environmental attribution
is claimed. Final integrated75 completed in18.710s.

The old input unit test expected an invented coalesced-events array. Retained
Native surface/sequence controls prove both coalesced/predicted methods absent;
its assertions now require that exact absence. Original code and every earlier
protected draft remain unchanged in their prior receipts.

Production C++, dependencies and all18 prepared SDK artifacts are unchanged.
The prior full2043JS/129PureScript/13Native checkpoint remains at97bb. Broader
privileged driver constructor poisoning/screen/wheel and public function native
representation remain separate bounds. The cached separate driver producer
patch was NOT applied. Public Pointer definitions are actual VM functions;
this does not claim all Native builtin-function metadata matches.

All runtime jobs were serialized. Initialgates ran in bounded owned compiler
pausewindows; later main integration ran after the original actual90min build
cap and zero-live-compiler audit. Full independent browser replication is open.

All raw logs, exact patches, Native observations, guards and failed epochs are
byte-preserved in receipts.tar.gz; manifest.json gives every raw SHA256 and the
archive hash. Extract into a new directory to inspect them.
