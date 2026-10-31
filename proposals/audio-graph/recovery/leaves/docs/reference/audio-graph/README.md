Audio gain/constant/clock/suspension slice

This bounded extension adds genuine AudioContext, GainNode and
ConstantSourceNode public values to the existing private audio core. All inherit
the actual selected-VM EventTarget/AudioNode hierarchy and use Host-private
records. No authored object properties or implementation-symbol copies supply
node/context/parameter brands. The existing live AudioBuffer channel arrays and
buffer-source sample renderer remain in use.

Offline graphs process actual samples in128-frame quanta. Iterative dependency
traversal mixes real inputs, applies gain and additive gain-parameter modulation,
and evaluates scheduled a-rate/k-rate parameter math. A visiting dependency
contributes no back-edge input; unrelated genuine inputs remain audible.
Suspension stops actual processing at the calibrated quantum, retains source
positions/output storage, and resumes with live buffer/parameter changes. Curves,
linear/exponential ramps, targets, cancellation and tested hold operations produce
actual float samples. Constructor/property conversion and concrete interface
brands use the observed VM exceptions.

AudioContext uses a captured monotonic clock quantized to128frames, freezes while
suspended/closed, reports f32(256/sampleRate) latency and dispatches actual trusted
state events. A Native probe waiting for a real-time source ended event timed out.
A separate bounded30ms control observed an advancing clock and no ended event.
This slice implements that measured clock/state behavior and introduces no
claimed real-time rendering or decoded output.

The raw Native executable SHA256 is
9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f.
All inputs, raw tables, executable/input hashes and candidate tables are retained
in the proposal. The final focused run passed21tests: all17 existing audio core
checks plus four new tests. The new tests assert52 matching Native rows and
explicitly retain the following differences; they do not claim full parity.

Known bounds and measured differences:

- Native's2,000-unit-gain chain outputs zero; the independent iterative graph
  computes0.5. Tests explicitly assert both retained Native zero and actual
  candidate0.5, with no fabricated silence. A modest independent Native probe
  found chains8/64/128 output0.5, chains256/512/1024 output zero, while parallel
  64/256/1024 branches produce32/128/512. The exact depth policy remains open.
- Connections to source offset/playback/detune parameters reject explicitly;
  additive modulation is currently supported for GainNode.gain only.
- Oscillator/PeriodicWave, compressor, convolver and decoding remain absent.
  The three complete upstream fixtures are not claimed to pass. Their exact
  source hashes are recorded in the proposal manifest.
- Channel routing is calibrated for mono/stereo and the existing core behavior;
  wider speaker layouts, all automation combinations, latencyHint options and
  additional real-time device behavior remain uncalibrated.

The first graph regression run exposed lost ended-event dispatch while refactoring
rendering; the corrected final run preserves the exact existing40-row Native
buffer renderer table and all existing event ordering/privacy tests. All failed
runs and the Native await timeout remain in the proposal. No full/broad,
other-runtime or PureScript suite ran.
