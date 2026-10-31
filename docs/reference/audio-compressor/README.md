Real compressor and AudioParam timeline followup

This patch follows the frozen gain, wave and media slices. DynamicsCompressorNode
uses actual independent sample processing: a soft-knee transfer, adaptive level
detector/envelope, real lookahead ring storage, makeup gain and decibel meter.
Stereo detection and output use real source samples. Float rounding, parameters,
automation, suspension and persistent processor history follow measured Native
controls. No observed output vectors or precomputed audio buffers are embedded.
The release polynomial is derived from interpolation and a column-normalized
minimum-norm fit through four release zones; the Native coefficient matrix is
not embedded. Pinned source was read as reference after runtime measurement;
this is not a clean-room claim. Reference hashes are retained.

Public AudioParam.value assignment now updates its intrinsic value and schedules
an actual set event at the private current time. Constructor initialization stays
separate. Oscillator a-rate selection follows active events in the current
quantum, then returns to constant processing when appropriate. Both behaviors
are necessary for actual Native sample fidelity, not cosmetic bookkeeping.

The constructor-options fingerprint and the source fixture's public-setter
fingerprint legitimately differ. An early probe matched the Native constructor
path but failed the unchanged fixture. A fresh unchanged Native replay passed;
comparison isolated the missing setter timeline event, then quantum selection.
All contrary probes and failed candidate runs remain in evidence. The final
implementation matches both paths exactly; no fixture assertions were changed
and no incompatible-literal classification is retained.

Validation on exact frozen source:

- All54 Native rows match exactly, including actual samples, aggregate sums,
  reduction, multiple rates, stereo impulses, automation and suspension.
- Direct public V8 sameRealm/creationGlobal checks cover14 public values,
  functions/getter, parameters, output, promises, errors and delivered events.
  All remain actual VM objects and outside Host after nulling prototypes.
- The serial audio regression passes35/35 across core/gain/wave/media/compressor.
  The two existing heap-enumeration tests are explicitly skipped; these direct
  V8 checks perform no enumeration. All three original webaudio fixtures pass.
- Fresh unchanged offline_audio_context.html Native and candidate CDP runs both
  pass with the source load/assert contract (2000ms each), unchanged harness and
  source bytes, actual Native branch, and ephemeral ports.

There are no Root production edits or native-engine runtime imports. No broad,
heap-enumeration, other-runtime or PureScript suite ran for this followup.

Existing bounds remain explicit: source-parameter modulation beyond gain rejects,
Native's deep-graph depth policy differs from the independent iterative graph,
Convolver uses the measured Native gate rather than convolution, real-time audio
follows its measured clock/state profile, and decoding supports the measured
PCM/float WAVE formats. Numerical/automation edge combinations and wider channel
layouts are not exhaustively calibrated; this is not a claim of whole-browser
replication.
