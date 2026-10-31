# Audio cost margin over the corrected quantum implementation

This cost-only delta starts from the frozen d3e quantum/current-value correction
(audio source eabe3d51). It preserves that version's actual samples and intrinsic
cache semantics. The new14-graph contract is a numerical regression baseline for
the independent implementation, not a claim that every nonfinite result is a
Native golden result. The separate69 actual Native observations remain exact.

A Host-owned cursor lives for one synchronous render quantum. It advances through
every automation event in order, preserving the original anchor value/time and
active target rather than accumulating per-frame approximations. Future ramps
and active curves remain pending until actually consumed. The cursor is fresh
after any between-quantum mutation; arbitrary-time getters/cancel operations use
the original pure evaluation path. No event count, timestamp or sample is capped.

A parameter on the non-sample-accurate path is evaluated once for its identical
quantum time. Gain no longer allocates empty modulation arrays and zero buffers.
The no-input arithmetic still adds positive zero, preserving signed-zero and NaN
behavior. Existing mix steps, Float32 stores, every graph node and gain
multiplication remain. No in-place buffer aliasing or identity-gain math omission
is introduced. The real last-computed intrinsic cache still receives the actual
value used by the kernel.

Instrumented diagnostics: combined2000 targets/setters/gain nodes1593→218ms;
automation-only render761→27ms;2000-gain chain render679→176ms. Every complete
rendered buffer SHA256 and actual cache result is identical before/after.
The actual unchanged audio_graph source (SHA10b6ad114dbac171e38167a6a62c4cd55021e545e825bd4ba03a712206b53a64)
passes its unchanged2000ms load+2000ms assertion contract at600ms load/8ms
assertion in the recorded isolated run. Timings are observations, not new limits
or test thresholds.

All69 actual Native observations pass on Node24.19.0,24.22.1,26.13.0. The14 varied
graphs compare complete Float32 bytes and intrinsic cache values to a separate
frozen-d3e source copy on each runtime: signed zero, NaN payloads, infinity,
subnormals, large gains, computed NaN, varying targets, ramps, curve hold,
time ties, feedback, modulation and mutation while suspended between quanta. All match. Tiny word/zero/NaN controls are
also retained as diagnostics. Native expectations, original fixture assertions,
realm/brands/lifetime, buffer identities and DSP are preserved.

Broader composed validation remains for the next slice after Root's current full
checkpoint. No broad/heap suite or multicore compilation was run here. Profiles
and the source-contract run occurred only after Root released the owned lease.
