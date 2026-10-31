# Independent platform clone recovery

Apply `integration-current.patch` once to the current Root composition; do not
also copy the earlier candidate files. `integration-manifest.json` records exact
existing-file base digests and final leaf digests. The patch does not import
Lightpanda implementation code or patch dependency files. It uses the shared
platform factory registry and generated factory hooks already required by the
independent heap integration.

The codec serializes genuine factory-produced Point/PointReadOnly and
Rect/RectReadOnly identities, including SVG producers, and reconstructs actual
receiver-realm objects from captured constructors and private numeric state.
Pinned Native rejects ordinary and SVG Matrix/MatrixReadOnly objects; the codec
now rejects those atomically before transfer commits. Real cyclic graphs, Map
keys, aliases, transferred ports/buffers, Blob/File bytes and readonly subtypes
remain intact across Window clone, MessagePort, BroadcastChannel and actual
worker threads. The earlier geometry-specific structuredClone wrapper is skipped
when the genuine messaging codec owns that realm; standalone geometry retains a
separate independent path.

Generated setup/new hooks provide actual successful allocation provenance.
Copied implementation symbols, prototype lookalikes and authored tag getters do
not create records. Node Blob/File getter validation alone is insufficient:
copying Node's own handle symbols can satisfy its getters. The worker adapter
therefore records successful constructor and native-producing returns, including
Blob.slice, Request/Response.blob and parsed/normalized FormData files. A real
captured native Blob slice retains immutable bytes privately. Existing host-only
tests explicitly register genuine host producers; arbitrary authored objects do
not gain that authority.

Recovery found a second concrete Node fake-File issue: skipping only the current
FormData.append argument permitted a later append/set to authenticate an earlier
fake File left in the form. The new adapter captures all pre-mutation identities
plus the supplied value, and registers only genuinely fresh returned objects.
The unchanged new regression fails against the old candidate and passes after
the correction; real newly normalized Files still retain their bytes and brand.

## Evidence and execution

The isolated checkout is `/workspace/shared/codec-recovery-current`, copied
without Git metadata. Its node_modules points to the prepared Root dependencies.
`final-source-hashes.json` records final source/test bytes. Builds use the already
verified exact-version Root native outputs copied into this candidate; no binary
source changed for this proposal.

- Recovery's first focused run passed22/23; the sole failure was missing copied
  native-control files under docs/reference. After copying those immutable
  documents,24/24 passed, including the new FormData regression.
- `codec-recovery-form-negative.tap` records the actual failing old-candidate
  FormData reproduction: fake File incorrectly became branded and lost its own
  ordinary user property. It is not a test setup failure.
- `codec-recovery-combined24.tap` records107/110 passing; three source-fixture
  checks could not find the copied checkout's reference cache. The final run
  supplies the existing verified cache through RED_PANDA_REFERENCE_TESTS_ROOT.
- Exact final Node26.13.0 focused run passes24/24. Final Node24.22.1 broad
  composition passes110/110, including actual heap query main/utility/frame
  identity, CE lifecycle, geometry, messaging, workers and the three unchanged
  source fixtures. No tests skipped.
- Fresh bounded Native public-protocol captures replay all16 clone producer
  controls and six authored-object controls against binary SHA256
  9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f.
  Their observation arrays exactly equal the earlier pinned records. Captures
  include actual helper, expression and exercised source hashes; they do not
  claim static analysis observed execution. `native-probe.mjs` is the adapted
  existing helper for this scratch path and uses owned ephemeral loopback ports.

The tests depend on the already-present Root files
`docs/reference/svg-phase3-clone-native-expression.js` and
`docs/reference/svg-phase3-clone-native-observation.json`. Those untracked
reference documents must be committed with the proposal's production/test merge.

## Limits

The before-clone SVG screenCTM offset remains a separate layout mismatch
(candidate24 versus Native29 in the prior capture); the16-result test compares
clone/error results and resulting coordinates, and explicitly omits before
layout diagnostics. Native DOMQuad was absent; this is not a claim that the
candidate's existing DOMQuad extension matches a native interface.

The pre-existing unsupported-exotic guard still rejects unregistered objects
with an unknown inherited static Symbol.toStringTag. Thus an ordinary custom tag
can reject even though its descriptor is never invoked; this is a remaining
classifier conformance gap. Actual Promise/WeakMap/etc guards use captured
Node/V8 state checks, and known platform types require successful factory
provenance, but universal exotic clone classification is not established.

Node worker constructors and native-producing prototype methods are composed
inside the owned worker environment. This does not provide a hostile-code
sandbox or authenticate arbitrary externally supplied Node platform objects.
FormData normalization and genuine private implementation mutation are not an
exhaustive WebIDL audit. Full Root test/PureScript acceptance and the separate
retained-world integration remain the parent's responsibilities.
