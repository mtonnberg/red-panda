# Audio timeline cost and preserved ordering

The unchanged pinned audio_graph.html (SHA256
10b6ad114dbac171e38167a6a62c4cd55021e545e825bd4ba03a712206b53a64)
timed out at its original2000ms source-load contract. CPU profiling identified
repeated full event sorts, scans that could not find a curve, and per-sample target
record allocations. This delta changes those general algorithms; graph depth,
DSP, samples, event count and deadlines remain.

Fresh events have increasing sequence numbers. Binary upper-bound insertion after
all events at the same time produces exactly the previous stable time/sequence
order. Monotonic events append directly. The private curve count allows a point
query with no curves to return immediately; interval queries still validate every
existing event. Both cancellation methods recompute the count. Evaluation reads
the original immutable target event rather than copying two scalar fields into a
new Host record each visit. An empty timeline returns its unchanged base value
without allocating a per-call closure.

An isolated exact Root baseline took~776ms to schedule the combined2000 events
and~2239ms total diagnostic time; optimized~48ms and~1280ms. These instrumented
numbers are observations, not test deadlines or guaranteed benchmarks. The actual
unchanged source fixture reproduced load timeout2417ms before the change, then
passed with load1402ms and assertion2ms under the unchanged2000+2000 contract.
Both runs used ephemeral static origins, real source registration flags and the
unchanged Native harness. No fixture assertion was edited.

Seven fresh Native controls cover reverse chronological insertion, time ties,
ramps, cancellation, held curves and point-overlap errors. At the performance-only
checkpoint, six rendered rows matched exactly and the seventh retained a baseline
difference. Subsequent independent Native controls proved that difference was
per-quantum rate selection, unrelated to cancellation or overlap rejection.
The audio-curve-quantum followup now uses the measured selection and actual
computed-value state for gain/offset; all seven unchanged Native observations are
asserted exactly. The performance-only before/after observations remain in their
immutable proposal archive.

No duplicate event coalescing, event/node/sample cap, silent deep-graph fallback,
recorded output vector or native engine import is introduced. Host-private state,
actual VM buffers/arrays/events, captured public interfaces, lifetime and genuine
sample math remain. New private fields are Host records just like existing state.
