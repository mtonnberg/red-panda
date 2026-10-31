Worker Scheduler followup

The two oracle tables contain 26 controls run in actual dedicated Native
workers, using executable SHA256
9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f.
Inputs and raw observations are retained without substitutions.

This separate followup installs the existing independent task queue in genuine
Worker Abort/Event realms. Actual timer jobs invoke actual VM callbacks through
the existing invocation trampoline. Callback values/errors and adopted Promise
results retain identity. Abort subscriptions use real private Node signal state
and resistant cancellation listeners; authored getters, copied symbols and
proxy prototypes never supply signal authority. Trusted priority events are
actual selected-VM events dispatched through the private real event backend.
Worker close cancels pending timers and abort subscriptions.

Public V8 creation-context checks in an actual Node thread cover eleven public
Scheduler/Task values, constructors, method and getters, including after nulling
prototypes. They use the existing verified addon with direct sameRealm and
creationGlobal calls; they perform no heap enumeration.

The previously skipped Worker availability rows in the document Scheduler tests
are now asserted. All ten document/utility/unchanged-source tests passed with
the pinned source root supplied. The first combined run retained one setup
failure caused by missing scratch reference files, before fixture execution;
the other seventeen tests passed. A final focused Worker run passed all nine
tests including the separate Event redispatch correction.

Existing Worker Request.signal and other Node-backed API frontends remain
outside this followup. The calibrated priority-hint FIFO and sticky active-signal
semantics remain unchanged. No broad/full/other-runtime/PureScript suite ran.
