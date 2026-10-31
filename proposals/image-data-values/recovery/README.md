# Independent ImageData values

Apply `integration-current.patch` after the WebCodecs value proposal. This is
an ImageData-only delta over current Root plus that prerequisite, preserving
EncodedChunk codec branches. Base/final digests are recorded in
`integration-manifest.json`. This worker did not edit production.

Constructors, accessors and real Uint8ClampedArray allocations are compiled in
each actual main, child, worker and utility VM. The array overload retains the
actual caller array, its foreign realm and view offset. Readonly descriptors,
constants, unsigned conversion, settings order and errors follow the pinned
Native observations. Only srgb/rgba-unorm8 is supported by the measured Native
build; display-p3 and rgba-float16 are not invented here.

Frozen null-prototype slots and snapshot closures live privately in the host,
registered through the shared successful-factory provenance. Actual public VM
identities remain intact. An earlier prototype stored a private VM slot object;
a real Object.prototype heap query exposed it. The negative reproduction is
preserved. Final heap queries return the genuine ImageData without private
slots. Field-only bridges do not return slots through heap-discoverable helpers.

The shared codec reconstructs real receiving-realm values from private captured
constructors, snapshots genuine bytes separately from other serialized arrays,
preserves cycles/aliases, ignores own authored width/data getters and composes
with actual File/Blob, port, BroadcastChannel, worker and encoded-chunk values.
Clone errors precede transfer commits.

## Executed evidence

The frozen candidate is `/workspace/shared/canvas-primitives-recovery`.
`evidence/final-source-hashes.json` records all final source/test bytes, checked
unchanged after final validation. Earlier epochs remain distinct.

- Node24.22.1:87/87 combined checks pass, no skips. Coverage includes ImageData13,
  encoded values, geometry transport, actual heap queries, Window messaging
  and genuine worker XHR/WebSocket/FileReaderSync behavior.
- Node26.13.0 and Node24.19.0:13/13 final ImageData checks pass on each.
- Existing PureScript Puppeteer acceptance:55/55 pass on the final composition,
  including real screenshot/PDF output and real heap identities. Automation
  remains implemented in PureScript.
- Fresh unchanged image_data.html: Native1/1 positive, pre-ImageData Root0/1
  actual failure, candidate1/1 positive. Same fixture/hash, native harness
  branch, static ephemeral loopback profile, iframe/worker flags,15s diagnostic
  deadline and100ms settle. No source2s performance guarantee is implied.
- Three retained Native value tables contain68 rows.66 constructor, conversion,
  descriptor, error, clone and foreign-array outcomes match. Two transport
  differences remain explicit below. A separate actual utility-world capture
  verifies object, array, function/accessor and subclass realms.

Native binary SHA256:
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
Captures preserve helper/expression hashes. These are owned public-CDP runtime
observations; no claim that static REA analysis observed execution is made. No
upstream production engine code or new dependency is imported.

Preserved failures: the initial deep descriptor probe returned CDP Internal
error when serializing a cyclic constructor prototype; v2 records primitive
metadata. A broad first run passed85/86 with a missing copied geometry-reference
file; supplying that unchanged input yielded86/86 before the separate slot fix.
The new heap-slot regression genuinely failed before the fix and passes in the
final87-check composition. Historical passes are not relabeled as final.

## Remaining limits

New numeric allocations and codec snapshots have a64MiB byte bound, independent
of native conformance. Larger otherwise valid new allocations throw a clear
backend RangeError. Existing larger caller arrays can be retained but their
cloning is bounded. Shared/resizable/growable buffer races are not exhaustive.

Pinned Native structuredClone does not detach transferred ArrayBuffers; the
existing candidate performs real detachment. The `detached` and
`dataByteTransfer` controls differ. Both raw outcomes remain in the tables and
those two are explicitly omitted from equality; separate checks assert actual
candidate detachment and atomicity. This does not change established transport.

Path2D, Canvas2D, offscreen drawing and canvas serialization remain gaps. Fresh
Native probes show Path2D accepting missing/invalid numeric arguments without
errors, and actual fillRect/putImageData pixels remaining transparent. A3x2
canvas serializes the same67-byte1x1 PNG before/after drawing. Those measured
no-rasterizer behaviors are retained as evidence; this patch does not fabricate
pixels or return a canned PNG as an implemented raster/encoding path.

Universal WebIDL/ImageData, exact heap counts, hostile-code sandbox and complete
browser compatibility remain unestablished. Full Root regression after applying
this delta is the parent's next integration step.
