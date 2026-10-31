# Gain and constant-source quantum state

Native distinguishes per-sample evaluation from per-quantum evaluation. A sole
curve beginning after the current128-frame quantum starts can take the constant
path for that whole block. A second earlier or later event changes that decision;
a boundary-start curve and a curve already active at the next boundary follow
other measured paths. The existing sampleAccurateParam algorithm already matched
these decisions for oscillators. Gain and ConstantSource offset now use it too,
while calculating every returned value through the real timeline and DSP.

This explains the earlier curve-readd discrepancy. Cancellation, overlap failure
and .value reads are irrelevant: a plain future curve has the same behavior.
There is no saved curve vector, hardcoded case, or synthetic silent replacement.

For offline gain and offset, .value follows the last actual intrinsic value the
kernel computed, including full128-frame parameter work when the output buffer
has a partial last quantum. The new scalar cache lives in existing Host-private
parameter records. Gain updates when its graph is pulled, including silent input;
disconnected gain retains its intrinsic value. Active constant sources process
parameters even when disconnected. Not-started/future-start/zero-duration sources
do not advance that value; a partly active source processes the whole parameter
quantum. Modulation contributes to real audio samples but is excluded from the
intrinsic .value. Direct .value writes update it before overlap validation, as
Native demonstrates; scheduling/cancel/hold alone preserve it.

The five raw expressions retain62 actual Native observations. The binary digest
is9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f. All62 match
exactly in the candidate, including samples, errors, property values and context
clock. The seven original timeline observations now also match completely, so
the earlier bounded test is strengthened to assert the full unchanged Native
expectation without filtering the curve-readd row.

Sampling and value caching cover offline GainNode.gain and ConstantSource.offset.
The existing realtime clock-only profile and other parameter classes retain their
previous behavior. No public allocation/realm/brand, buffer identity, event or
lifetime algorithm is replaced. No broad, source-budget or heap suite was run
while Root's final checkpoint was frozen; those composed checks remain necessary
before integration. Source input files and Native expectations remain unchanged.
