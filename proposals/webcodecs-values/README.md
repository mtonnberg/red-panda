# WebCodecs value types

The isolated proposal implements genuine `VideoColorSpace`, `EncodedAudioChunk`
and `EncodedVideoChunk` values in main/child Windows and actual worker VMs.
It imports no upstream production engine. Decode/encode processors, AudioData,
VideoFrame and complete utility-world availability remain outside this delta.

Apply `recovery/integration-current.patch` after the accepted codec-provenance
recovery. The patch passes an apply check against Root's newer synchronous-XHR,
retirement and parser composition. Its existing-file adaptation preserves those
changes but is not itself an executed full-Root build. The executed frozen graph
is `/workspace/shared/webcodecs-values-20261031`: Root's earlier exact working
graph plus the codec recovery and these value types. Baseline, final source and
integration manifests distinguish those epochs; HEAD alone does not identify
either composition. Root production files were not edited by this worker.

The value classes are compiled in their actual VM. Host-private WeakMaps hold
genuine state shared across actual Windows, so borrowed methods recognize real
foreign values while Audio/Video brands remain distinct. Readonly metadata,
dictionary order, enum values and Native Symbol-description conversion, safe
integer ranges and realm errors are calibrated against real Native controls.
VideoColorSpace returns a real method-realm object from toJSON and rejects
structured cloning. Chunk constructors copy actual selected BufferSource bytes
after argument conversion; detached inputs become empty as observed in Native.
Shared backing stores reject. copyTo writes actual bytes only into the selected
destination span, ignoring authored buffer/offset/length properties.

Transfer sequences validate every buffer, duplicate and detached state before
detaching anything. A captured native structuredClone transfers the actual
validated ArrayBuffers, including Native's allowed unrelated buffers. Private
snapshots use host-owned lists and captured iteration so later Array/Symbol/
WeakMap/Reflect replacements cannot expose internal collections. A real failing
pre-fix intrinsic-poisoning test is retained separately; the same control passes
the official Native binary and the final candidate.

Successful constructors publish exact private factory provenance. The platform
codec carries `{kind:EncodedChunk,interface,type,timestamp,duration,bytes}`
records, validates their shape, and reconstructs using captured private receiving
constructors. Genuine Window clones, cycles/aliases, real MessagePorts and actual
worker thread round trips preserve byte snapshots and public receiving brands.
Authored metadata getters and prototype/tag copies do not establish a brand.

Final validation:

- 90/90 combined Node24.22.1 checks pass across value types, geometry codec,
 messaging, workers, heap worlds and custom elements. The new12 checks also pass
 on Node26.13.0 and Node24.19.0. `final-test-source-unchanged.json` confirms the
 executed graph stayed unchanged through those runs.
- Both unchanged source fixtures, encoded_chunk and video_color_space, pass on
 the final candidate. Native passed both in the preceding coverage cohort. The
 harness and actual iframe/worker flags remain unchanged. Diagnostic15s plus
 document-complete/100ms settling is distinct from source2s performance.
- The primary145 Native control rows match exactly, enforced by an oracle-backed
 test on every tested runtime. Supplemental47/48 rows match; Native and candidate
 also agree on the separate private-intrinsic control.

The retained supplemental mismatch is general CDP returnByValue serialization:
Native emits `{}` for a direct VideoColorSpace, while the existing candidate
serializer invokes its toJSON and emits fields. The actual getter and toJSON
values match. This is handed to the Runtime owner instead of changing the class
to fabricate a matching protocol result. Keep the negative report until that
separate serializer integration is validated.

An initial combined run had88 passes and1 missing copied-support-file error.
Two exact read-only geometry oracle files were copied and hashed, then the full
final90-check composition passed. Earlier reports are retained as setup outcomes,
not relabeled successful runs. All owned browser/fixture jobs are cleaned up;
canonical9582 was not used by these WebCodecs checks. Full browser/codec/realm
parity, exhaustive descriptor/conversion combinations and resource isolation are
not established by this bounded proposal.
