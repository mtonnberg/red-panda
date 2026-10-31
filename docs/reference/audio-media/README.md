Convolver profile and actual WAV decoding

This followup depends on the frozen gain and wave patches. The dedicated Native
controls retain both exposed compressor behavior and the scope implemented here.
Compressor rows are explicitly excluded until its real DSP is implemented.

ConvolverNode has genuine AudioNode/EventTarget state, private buffer identity,
normalization state and measured channel/rate validation. Actual Native does not
convolve: it emits silence without a response and passes actual mixed input
unchanged with any valid response, including an all-zero or two-tap response.
Normalization currently changes state only. The implementation reproduces that
explicit gate, rather than claiming impulse-response convolution or using a
generic silent node substitute.

decodeAudioData parses actual RIFF/WAVE chunks and independently converts PCM
8/16/24/32 and IEEE float32/64 samples. It splits interleaved channels and linearly
resamples actual samples to the context rate, with measured output length and
float rounding. Input is snapshotted synchronously and remains attached. Optional
callbacks run with this=context before Promise reactions; failure callback and
Promise rejection share the same genuine EncodingError. Invalid inputs and
unsupported encodings reject. No synthetic decoded data or captured sample
vectors are returned. The existing bounded AudioBuffer allocation limit applies.

The callback queue uses owned document timers and actual VM promises. Public
buffers/channel arrays and Convolver wrappers use the genuine VM allocation and
private backends established in the wave followup. DOM exceptions use the existing
captured scalar factory, preserving real VM Error allocation and actual generated
DOMException slots. Constructor channel options now use captured private helpers
rather than authored public setters.

Validation is focused and serial on Node24.22.1: four tests pass, including the
unchanged pinned webaudio/audio_context.html fixture. Native and candidate CDP
runs of that original fixture both pass, using ephemeral ports and identical
explicit diagnostic timing settings. All35 in-scope Native rows match exactly.
Frozen-source direct public V8 checks cover10 public values/functions/getter,
including decoded data, Promise, EncodingError and actual completion/ended events;
all remain in their actual VM and outside Host after nulling prototypes. These
checks perform no heap enumeration. Raw source/input/binary hashes and output
are retained in the proposal.

Compressor DSP remains the next gap; the full offline_audio_context.html fixture
is not claimed to pass. Compressed formats beyond the measured PCM/float WAVE
profile reject with EncodingError. Malformed/extension/large-resource cases and
all cross-realm callback combinations are not exhaustively calibrated. Prior
source-parameter modulation and depth-policy differences remain explicit. No
broad/full, heap-enumeration or PureScript suite ran during Root's matrix.
