# Independent document Scheduler

Apply `integration-current.patch` for the Window/frame/utility scope. It adds a
real timer-backed FIFO task queue with actual callback invocation, cancellation,
priority metadata/events, front-of-queue yield continuations and real realm-local
result Promises. No task success/value is fabricated. New module/oracle/test
bytes are the executed frozen composition; existing-file hunks are narrowly
adapted to current Root and preserve its URLPattern, device cleanup, CSS, Canvas
and storage work. Their source hashes are recorded separately in the manifest.

TaskController extends the genuine document AbortController, and its actual
AbortSignal gets the TaskSignal subtype. Real private AbortSignal algorithms
cancel queued tasks. Generic symbol/prototype copies and authored signal getters
do not supply authority or influence private cancellation. Priority changes
create real TaskPriorityChangeEvent/Event instances and dispatch through the
actual signal EventTarget implementation with genuine internal trust. Reentrant
priority changes throw the measured Error('NotSupportedError'). No Host
constructor prototype grafting or synthetic instanceof behavior is used.

The namespace is a real Scheduler instance in each actual VM. Its getter captures
the actual implicit global receiver once at trusted setup; later arbitrary
receivers do not gain authority. All mutable queue/controller/event slots and
callback ownership live in Host-private maps/null-prototype records. Public
constructor/method/accessor/Promise objects remain in the actual receiving realm.
Callbacks execute through the existing private VM invocation helper/timeout.

## Calibrated Native behavior

The pinned Native runs priority hints FIFO; changes still update TaskSignal and
produce trusted events. Delay converts to unsigned32 (including BigInt, modulo
wrapping, NaN/Infinity0); large pending delays are scheduled in real bounded timer
chunks. Yield continuations execute ahead of already queued regular tasks, with
real task/microtask boundaries. Native's last active signal is sticky per realm
and an interleaving task overwrites it; this is retained rather than pretending
standard asynchronous-context semantics.

Aborts before/during a synchronous callback reject with the actual reason, which
wins even over a thrown error. After a callback has returned a Promise, Native
adopts that Promise and ignores later signal aborts. Original thrown/rejected
object identities and actual callback results are retained.

Main-frame retirement cancels already queued tasks while leaving their result
Promises pending. New Scheduler calls in that retained original VM still work.
Utility queued tasks survive retirement and use a separate active-signal scope.
Permanent document teardown releases tasks, timers and abort algorithms without
inventing successful outputs. A private frame-retirement notification hook is
added alongside existing actual activity cancellation; no other cleanup is
replaced.

## Executed evidence

Frozen candidate: `/workspace/shared/scheduler-recovery`.
`evidence/final-source-hashes.json` identifies source/test bytes. The actual
Native binary SHA256 is
9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f;
public-CDP captures retain helper/expression hashes and actual outputs.

- 10/10 own focused checks passed serially on Node24.22.1, including the unchanged
 scheduler/scheduler.html native-branch fixture and actual utility/retirement
 controls, original result/error identity and private signal forgery/getter tests.
- Six measured tables contain76 rows.74 document-realm outcomes match; two
 Worker-availability rows remain explicitly outside this implementation.
- Actual Native utility capture confirms real subtype/Event/Promise realms,
 trusted event targets and independent active-signal state. A separate retained
 utility-context capture observes its queued task actually run after removal.
- Fresh unchanged fixture Native1/1 and candidate1/1 use identical source/hash,
 native harness branch, static ephemeral loopback profile, iframe/worker flags,
15s diagnostic deadline and100ms settle. This is not a source2s guarantee.
- No broad/full, heap or PureScript suite was launched for this scope while Root
 was running its frozen final verification. Parent combined validation and other
 runtimes remain required; prior scope's test counts are not reused here.

Initial failed controls are preserved. The first namespace getter rejected the
actual implicit global receiver; trusted setup capture fixed that actual issue.
The first validation expression left rejected promises unhandled; v2 adds catches
without changing observations. Initial probe typos return17/return1 were replaced
with actual returns and independently replayed; old captures remain historical.
No assertion, timeout or successful-task output was substituted to obtain passes.

## Explicit remaining bounds

Native exposes Scheduler in workers. This patch deliberately does not. Existing
workers mix plain Node AbortSignal/Controller and custom VM EventTarget/Event
classes; genuine selected-VM wrappers over private real Node state are a separate
followup, coordinated with the Worker DOMException owner. Marker brands, fake
instanceof/trust and Host prototype grafts are not substitutes. Both Native
worker-availability observations remain in the raw evidence and are excluded
explicitly from document-scope comparisons.

Full Scheduler/WebIDL conformance, exact global queue latency/heap counts,
worker behavior and hostile-code sandbox properties remain unestablished. The
actual callback timeout follows current VM policy; cooperative runtime tasks and
large delay chunks are not hard real-time guarantees.
