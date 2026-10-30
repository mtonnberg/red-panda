# Genuine utility worlds with platform dependencies

This is an unapplied implementation and evidence handoff. It preserves the initial
ordinary-Session proposal (`utility-worlds-current`, f9a7dd3) as an immutable prior
checkpoint. The executable isolated composition is
`/tmp/red-panda-worlds-observer-mjtdca6w`. No production or generated dependency
source was edited by this task.

The final composition passes the unchanged 53-check PureScript/Puppeteer workflow
on Node24.22.1 and26.13.0, including coordinate input, frame focus, dialogs,
screenshots and streamed PDF. Existing and new ordinary protocol/DOM checks pass:
101 combined Node24 checks, a final six-check platform/provenance run, and42
combined Node26 checks. The checked raw native observer producer/options controls
are replayed against real utility values in `test/utility-platform.test.js`.

## Merge choices and prerequisites

- `integration-current.patch` is the complete proposal against current Root's
  common-file bytes recorded in manifest.json. `git apply --check` passed on Root.
  It retains accepted `alignMainIDLPrototypes`, Root's caller/group validation,
  selected-realm argument decoding and genuine invocation helper.
- `decorator-delta.patch` is only the extension after immutable f9a7dd3. MCP should
  apply this to its f9a7dd3-based copy, retaining its separate heap-only changes.
  Do not apply both complete integration and incremental delta.
- Both require the exact inventory-owner dependency-free
  `src/platform-factories.js`. `platform-factories-prerequisite.patch` adds the
  exact reviewed-proposal source; skip that addition if identical bytes are
  already merged. Its source and SHA256 are in manifest.json.
- Root's current `src/invocation.js`, `src/realm-values.js`,
  `src/main-idl-prototypes.js` and `src/fonts.js` remain unchanged. The composition
  predates the narrow root8a8558d TextEncoder delta: no patch touches streams.js,
  native sources or helper binaries. Preserve those current Root files.

## Actual producers and ownership

The core compiles the existing pinned jsdom generated IDL wrappers into a real
VM and wraps the original shared implementations. Private per-world weak wrapper
registries preserve actual identities and canonical main wrapper backlinks.
Session methods select the real controller without patching Session.prototype.
Foreign values carried through CustomEvent.detail remain their original values;
only typed DOM.resolveNode converts to the requested world's wrapper.

The new observer factory creates actual utility IntersectionObserver/Entry
constructors, records, callback arrays and rectangles. `entry.target` is the exact
utility target. Geometry and visibility come from Root's private authoritative
shared layout/cascade through canonical nodes; there is no second DOM or layout.
Native observation shows IO delivery precedes an authored microtask queued after
observe. Callback errors and private state are kept separate from the measured
MutationObserver producer quirk, whose delivered values remain actual main-world
values while the callback executes in utility.

`prepareUtilityPlatform` captures the original document RAF scheduler before any
authored preload. Utility RAF/cancelRAF entries are genuine nonconstructable
methods in the VM. Callbacks enter Root's real bounded invocation trampoline with
the utility Window as receiver and the original scheduler's timestamp. Cancellation
converts an authored handle once; document abort cancels pending work. Utility
performance is a genuine generated wrapper over the original document Performance
implementation. Native controls confirm Function/Performance identity, callback
receiver, cancellation and a small actual clock delta.

Utility geometry methods create real VM DOMRect/DOMRectList values from shared
canonical-node measurements, and viewport clipping reads the same layout. The
existing Root font metadata factory runs independently inside utility, providing
actual FontFaceSet and Promise values needed by Puppeteer's PDF readiness check.

Core final-wrapper factories directly publish private weak provenance to the
heap-independent helper. They do not depend on heap configuration. Existing
`configureUtilityFactories({onRealm,onWrapper})` APIs and metadata are unchanged.
Bootstrap provenance can precede onRealm; buffered onWrapper notifications follow
actual realm registration. MCP retains authority/canonicalization ownership and
must preserve current streams/codec deltas when composing its heap-only patch.

## Preserved gaps

The identical ordinary native driver still compares35/39 public values. All four
mismatches are detached-frame lifetime: native retains callable old real contexts,
Document and timer callbacks after removal, while FramePage currently aborts them.
That is a separate upcoming lifetime proposal, not concealed by aliases or copies.

Other utility API decorators remain incomplete, including full computed style,
CSS/XML/SVG and Window messaging/structured clone/Broadcast/Blob/File producers.
Geometry uses Root's surrogate layout; this is no full CSS/paint renderer claim.
Observer delay/trackVisibility/scrollMargin and the complete Performance timeline
are not exhaustively calibrated. The invocation lexical binding is addressable if
its random name is learned; it is not a native private slot. Pinned node_modules
is shared by symlink rather than independently frozen. Evidence and exact source,
patch, prerequisite and helper digests are retained in manifest.json.
