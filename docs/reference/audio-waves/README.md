Independent oscillator and periodic-wave followup

This followup requires the frozen gain/constant/clock/suspension proposal. It
adds genuine OscillatorNode and PeriodicWave interfaces, real Fourier synthesis,
phase accumulation and frequency/detune automation. Coefficients are copied;
custom waveform objects retain actual independently computed tables. The new
Host DSP module performs its own inverse FFT and band-limited table generation,
normalization and interpolation. It contains no retained observation vectors,
precomputed captured waveforms or native-engine imports.

The pinned Native source was consulted as reference after runtime calibration
for table sizing, range selection and float behavior. This is not a clean-room
claim. The implementation is new JavaScript over ordinary Fourier/FFT math;
exact referenced source hashes are recorded in the proposal manifest.

The final source matches all63 new Native rows exactly, including sample
numbers without a tolerance: four ordinary waveforms at six frequencies,
custom real/imaginary coefficients, normalization/DC suppression, fractional
start/stop, automation, detune, coefficient ownership/conversion, private brands,
retained phase, captured intrinsics and first-getter wrapper identity.

The complete unchanged upstream webaudio/audio_graph.html passes. An actual
Native CDP run and independent candidate CDP run both passed with unchanged
source/harness bytes, ephemeral ports and the same diagnostic timing settings.
The later focused run also executes the original fixture after the allocation
and lazy-wrapper changes; its original robustness assertions remain intact.

Actual allocation and private ownership

Direct public V8 checks exposed two failures in inherited allocation patterns:
the generated Host EventTarget constructor returns a Host-context wrapper, and
Object.create with a Host-generated Event prototype can inherit that prototype's
creation context. The corrected audio bases allocate an actual VM object literal,
attach the genuine interface prototype and mint the actual generated jsdom
private backend on that same object. Constructors are not given grafted Host
prototypes and instanceof has no special treatment. Host WeakMaps retain exact
backends. Owned dispatch and handler registration use those captured backends,
including when authored implementation-symbol getters would otherwise throw.

AudioParams now have Host-private state before exposure, then mint one actual
VM wrapper on the first getter access. Further getters return the same wrapper.
Native controls demonstrate that reading a child's getter first chooses a child
wrapper, while borrowing a parent getter first chooses a parent wrapper. Value,
automation and connection state remain shared; this is not inferred from authored
properties. The earlier incorrect multi-view model and its failed comparison
are retained in the proposal as counterevidence.

Final direct V8 evidence verifies13 public values/functions/getter, including
actual context/node/parameter/sample values and delivered ended/completion events.
Every object is in the selected VM, outside the Host context, and remains so after
nulling its prototype. Only direct sameRealm/creationGlobal calls are used here.

Validation and bounds

The last combined focused run passed27/27 tests, including all17 earlier audio
core tests, the four gain tests and six wave tests. After the final allocation
correction, two targeted creation/backend tests passed; the frozen-source raw
artifact independently matches all63 Native rows and all13 V8 identity rows.
A new owned-backend regression is included. The combined suite was not repeated
while Root reserved resources for its full/matrix run. Failed creation/realm
hypotheses remain in raw logs. No broad/full, other-runtime or PureScript suite
was run for this slice.

Compressor, convolver and media decoding remain absent. The complete upstream
offline_audio_context.html and audio_context.html fixtures are not claimed to
pass. Source-parameter audio modulation still rejects explicitly; gain-parameter
modulation remains supported. The previously measured long-chain depth-policy
difference is unchanged and explicit. Arbitrary automation combinations, wider
channel layouts and all numerical edge cases are not exhaustively calibrated.
