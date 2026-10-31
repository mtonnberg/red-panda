# AudioData and VideoFrame byte values

The independent media proposal supplies actual immutable PCM samples and video
planes, real format/layout copies, metadata, close/clone behavior and private
platform serialization. No decoder/encoder backend or decoded output is invented.
The executed graph lives at `/workspace/shared/webcodecs-media-20261031`; its
baseline includes Root's earlier uncommitted values/privacy/ImageData/processors.
Canvas's actual private dimensions and transparent RGBA snapshot producers are
an explicit isolated prerequisite. No Root production files were edited.

Apply the three frozen patches in `patches/chain.json` order:

1. `audio-data.patch` adds AudioData, codec records and genuine encoder input
   handling. It uses actual copied BufferSource bytes, all eight sample formats,
   integer/float conversions, planar/interleaved offsets and frame selections.
   sampleRate retains observed f32 precision; duration truncates and saturates
   u64. Closed values keep timestamp but clear public size/rate/format metadata.
2. `window-clone-option.patch` enables the observed unknown-transfer-entry rule
   **only for the main Window global structuredClone call**. Unknown entries are
   ignored there; genuine ArrayBuffer/port duplication, detachment and failure
   atomicity remain actual operations. Shared prepare, child frames, MessagePort,
   postMessage, Broadcast and Worker-global defaults retain their existing strict
   profiles. The composed oracle tests require this patch; AudioData itself can
   otherwise be cloned without listing it in transfer options.
3. `video-frame.patch` adds VideoFrame over23 genuine pixel formats, cropped
   planes, checked strides/offsets, padding, RGB swizzles, orientation/display
   metadata, actual canvas snapshots, clone/serialization and encoder inputs.
   It preserves current Root's separate Canvas clone-rejection policy.

Every patch was checked and applied in sequence against a copied current Root
common-file baseline. Those Browser/Worker/codec adaptations preserve newer Root
features but are source-only until parent integration. New implementation/test
leaves match the executed graph; do not call the adaptation a completed full-Root
regression. The preceding full-Root epochs remain separate.

All slots and backing stores are Host-owned, with exact successful-factory
provenance and field-only VM bridges. Internal clone hydration uses consumed
Host-only tokens; authored records, names/tags and prototype copies cannot mint
private resources. Clones do not re-read authored metadata/prototype option
getters. Actual Window/MessagePort/Worker transport creates genuine receiving
classes and retains cycles/aliases through the existing graph codec.

Native observations retained in `recovery/` include several important details:

- Main Window transfer lists ignore nontransferable entries, even duplicate
  AudioData/VideoFrame entries; their source media stays open. Constructor
  ArrayBuffer transfer lists still validate and detach real buffers atomically.
  These distinct contracts are not collapsed into invented ownership movement.
- Bare SharedArrayBuffer sources reject, while actual shared typed views work.
  Options that detach a destination are followed by a fresh actual byte-span
  check; no freed backing store is read or written.
- RGBX/BGRX same-format copies retain raw X bytes. Actual format conversion
  supplies opaque alpha where Native does. YUV-to-RGB conversion rejects with
  NotSupportedError instead of returning fabricated pixels.
- Constructor cropping and new VideoFrame(existingFrame, options) have measured
  distinct coded/visible/display/orientation behavior. Backing storage size is
  tracked separately from exposed coded dimensions, preserving actual cropped
  bytes even through clone/serialization. Supplied layouts count full row strides
  in allocationSize and leave untouched destination padding unchanged.
- Canvas input uses real dimensions and actual-sized transparent RGBA from the
  independently calibrated no-rasterizer Canvas profile. It does not decode images
  or substitute serialization's separate1x1 PNG behavior. Observed invalid bitmap
  dimensions reject, and the independent64MiB backing limit remains a limitation.

Fresh own checks pass **20/20 on Node24.22.1,26.13.0 and24.19.0** and enforce320
actual Native rows:102 AudioData,212 VideoFrame and6 Window clone-list rows.
They also exercise real Worker transport, payload-bit preservation, immutable
views, aliases, actual encoder queueing and private heap interaction. An attempted
name filter did not exclude the single AudioData heap test, because Node matched
the qualified name; logs correctly retain its execution. No broad/PureScript or
heap suite was run during Root's full-regression window.

Both unchanged audio_data/video_frame source fixtures pass with original harness
and actual iframe/worker flags. Diagnostic15s and document-complete/100ms settling
remain distinct from the source2s budget. The first fake-prototype test used
Object.assign against inherited readonly accessors and failed before exercising
cloning; replacing its setup with explicit own properties preserved the intended
brand/clone assertions. The original setup failure remains retained.

Complete media processing, exhaustive color/layout/realm combinations, every
bitmap capacity, utility-world API coverage, additional browser lifetime policies
and hard asynchronous deadlines remain unresolved. The strict unmeasured
transport profiles are preserved rather than inferred from main Window clone
observations. This selected result is not full browser or WPT parity.
