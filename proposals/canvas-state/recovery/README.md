# Independent measured Canvas state profile

Root has applied the reviewable `integration-current.patch`. It adds independently
written Canvas/OffscreenCanvas/Path2D state and a real PNG encoder. It imports no
Lightpanda engine code and adds no dependencies. Existing-file hunks preserve the
parent's newer CSS namespace imports/install; their base/adapted/executed hashes
are separate in `integration-manifest.json`.

The measured Native has no Canvas rasterizer. Native fills, paths, putImageData,
drawImage and transforms do not produce pixels; reads remain transparent. This
implementation explicitly preserves those unsupported-drawing semantics. It
stores actual private context/style/font/dash/path/gradient/pattern state, checks
real successful factory brands, compiles public classes/methods in each actual
main/child/worker/utility VM and produces genuine ImageData/Blob values. It does
not claim functional raster drawing.

Logical canvas font/style/dash backing is genuinely shared across main/utility
wrappers. Public wrapper identities and ordinary JS expandos remain per-world,
matching freshly captured Native before/after controls. A deliberately unshared
candidate fails that same regression; its negative log is retained. All private
mutable state is Host-owned/null-prototype and registered as implementation
provenance; actual heap tests verify public identities without exposing slots.

Known-kind registration uses the single approved privileged shared registry.
Ordinary prototype lookalikes remain ordinary clones and do not gain platform
brands. Genuine Canvas values reject cloning; OffscreenCanvas remains
nontransferable, as measured. Native transferControlToOffscreen permits repeated
calls and calls after context creation; it makes new dimension snapshots. Width
changes preserve Native context state, and save/restore/transform/path operations
retain measured no-op behavior. ImageBitmap is absent and Native
transferToImageBitmap returns null; no bitmap support is invented.

`canvasDimensions(value)` and `canvasSnapshot(value)` are Host-only producers for
other implementations. Both reject fake/nonproducer values. Dimensions allocate
no pixels, enabling Native semantic validation before a real immutable RGBA
snapshot. Snapshots contain actual transparent bytes at the real canvas size and
have a64MiB independent-backend bound.

## Real encoding

`src/png.js` encodes actual supplied RGBA rows: PNG scanlines, raw DEFLATE from
Node's built-in zlib, an independently assembled RFC1950 header/Adler32 and real
PNG chunk CRCs. No captured PNG/image byte string is used. Canvas's measured
serialization policy supplies transparent1x1 pixels regardless of nonzero canvas
size. This independently generated67-byte output matches Native exactly.
Arbitrary nontransparent2x2 RGBA samples are also encoded correctly. Tests verify
chunks, CRCs, DEFLATE and pixel content; independent Pillow12.3 `verify()` and
decode confirm those actual samples. Blob callbacks are actual captured Window
tasks and preserve captured call-time dimensions and callback-this behavior;
Offscreen convertToBlob uses real selected-realm Promises.

## Evidence and verification

Frozen final independent composition:
`/workspace/shared/canvas-final-current`, based on Root74d85df. Final exact
source/test hashes are in `evidence/final-source-hashes.json`. Native binary is
SHA2569dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f;
public-CDP captures retain expression/helper hashes. These are actual owned
runtime observations, not a claim that static analysis observed execution.

- Six Native tables contain171 controls.170 match; the one existing transport
  difference is explicitly retained below. Separate utility and cross-world
  captures establish real class/array/error realms and shared backing state.
- Unchanged Canvas2D, serialization, OffscreenCanvas and Path2D fixtures: fresh
  Native4/4, pre-Canvas Root0/4, candidate4/4. Same source/hash, static ephemeral
  loopback profile, iframe/worker flags, native harness branch,15s diagnostic
  deadline and100ms settle. No source2s timing guarantee is implied.
- Earlier clean composition passed83 combined checks, then16 focused checks
  after the shared-backing fix. Earlier current-Root composition passed125/128
  with three missing copied Audio oracle files; those three passed after their
  exact unchanged support inputs were supplied. Old results retain their epochs.
- Before the final Host-only dimensions export, current-Root focused16/16 passed
  on Node26.13.0 and24.19.0, and existing PureScript Puppeteer57/57 passed.
- Final current-source stress run:126/128 passed. Two tests failed before their
  Canvas control bodies because the synchronous HTTP worker's real readiness
  barrier timed out under concurrent load. They are failed checks, not passes
  or established Canvas behavior failures.
- Final Node26/24.19 stress runs each passed15/16; the actual heap query exceeded
  its existing cooperative limit (ERR_HEAP_QUERY_TIMEOUT, roughly30s observed).
  Final PureScript rerun timed out at Page.captureScreenshot after prior checks.
  These failures are preserved. No timeout, assertion or test scope was weakened.
  Parent will run one serialized final Root validation after all handoffs.

Exact broad check list:
`test/canvas.test.js test/png.test.js test/image-data.test.js
 test/platform-codec.test.js test/heap-query-worlds.test.js
 test/utility-platform.test.js test/world-protocol.test.js
 test/worker-apis.test.js test/audio-core.test.js
 test/webcodecs-values.test.js test/webcodecs-processors.test.js`.
Puppeteer is `scripts/automation.mjs test` using the existing PureScript workflow.
Use the prepared renderer/bin plus Node tools PATH and the pinned reference cache
via RED_PANDA_REFERENCE_TESTS_ROOT. Audio tests require their six retained
proposals/audio-core oracle files, already present in Root.

## Limits and retained negatives

WebGL/WebGL2 and bitmap rendering are not implemented; first WebGL selection
currently returns null even where Native exposes its separate placeholder API.
Font shorthand/Unicode metrics/color parsing cover the measured profile, not an
exhaustive CSS/font engine. Canvas snapshot/PNG pixels have explicit64MiB limits.
Shared/resizable-buffer races and full hostile-code sandbox properties are not
established. Generic Worker DOMException inheritance is inherited from existing
worker support; ordinary TypeErrors are actual selected-realm errors.

Native ignores a null transfer-list entry while existing candidate messaging
rejects it. The bitmap `transfer` control therefore differs and is explicitly
omitted from the new table equality; its raw outcomes are preserved. This patch
does not silently alter that established broader transport policy.

Initial controls genuinely failed because provided numeric arguments must convert
before a later missing-argument error, and getImageData ignores an extra settings
argument. Those implementations were corrected and raw failures retained. The
later dimensions helper test initially omitted its import; that test setup error
and correction are retained separately. Full browser replication remains open.
