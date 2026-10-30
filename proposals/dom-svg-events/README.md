# Independent DOM, SVG and event proposal

Production source is untouched. The fixed candidate is `/tmp/red-panda-dom-svg-events-proposal-2km2bzcm`; its baseline identity is recorded in `docs/reference/dom-svg-events-baseline-manifest.json`. This snapshot includes the independently implemented Request/Response producer changes. No target engine implementation was copied.

`leaf.patch` adds four modules and 15 focused tests. `integration.patch` adds only installer imports/calls to the frozen Browser source; use the four calls in the current `prepareWindow` instead of replacing a newer Browser file. Install SVG after `installGeometry`, then DOMIDL, DOMEvents and DOMLifecycle. SVG must precede DOMIDL for SVG anchor relList. The combined patch contains both. There are no package/dependency changes.

The modules expose `installSVG(page, window)`, `installDOMIDL(page, window)`, `installDOMEvents(page, window)` and `installDOMLifecycle(page, window)`. All installers are idempotent. Existing real jsdom DOM node/event implementations, genuine generated DOMTokenList/FileList/AnimatedString objects and independent DOMMatrix math supply the backing state. The SVG creation and Node insertion hooks are process-wide once, with weak realm registrations; no synthetic fixture events/assertions are inserted.

- DOMIDL adds live SameObject part/relList/sizes/htmlFor/sandbox token lists, native-observed per-interface support tables and PutForwards assignment; legacy document color aliases read/write actual current body attributes.
- SVG creates genuine typed SVG nodes at the existing SVG node factory, establishes the measured interface hierarchy, and supplies live href, lengths, enum/number resource values and transform-list IDL backed by real attributes. Length and transform writes emit ordinary DOM mutation records. Animation-side writes reject.
- DOMEvents supplies actual dispatchable DragEvent, TextEvent and TouchEvent objects plus DataTransfer/FileList/Touch/TouchList values. The data store retains real strings/files, supports native-observed duplicate MIME types and asynchronous getAsString, and survives the source item's removal. Legacy createEvent produces real uninitialized events.
- DOMLifecycle preserves the measured connected-to-connected same-document custom-element move behavior while retaining genuine removal/insertion records, object identity and real disconnect/adopt callbacks for other transitions. ShadowRoot.onslotchange uses the existing real event-handler state; it does not manually fire or flush slot events.

## Verification

The native binary is `1.1.0-nightly.11326+948d77378`, SHA256 `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`. Original external fixture tree: `/tmp/red-panda-upstream-reference/browser-948d77378/src/browser/tests`, commit `948d773786380bae36f046639fc61e2ddddd212a`.

Native public probes and exact expressions are retained in `docs/reference/{dom-idl,svg-idl,dom-events,dom-events-extra,dom-events-list-index,data-transfer}-native-{expression.js,observation.json}`. These are measured contracts, not claims that every spec surface is implemented. Probe launcher: `docs/reference/dom-svg-events-native-probe.mjs`. Each uses an owned random-port HTTP server and bounded owned browser.

The unchanged selected11 cohort uses separate owned browsers per fixture, original testing.js/assertOk, native harness branch, iframe+worker resource flags, 15-second fixture budget and 100ms settle, static fixture server on port0. Native final control: `docs/reference/dom-svg-events-final-native.json`. Candidate reviewed result: `docs/reference/dom-svg-events-reviewed-candidate.json`; complete source, compiled native binding, tool, package and fixture hashes: `docs/reference/dom-svg-events-reviewed-manifest.json`.

Historical baseline remains `docs/reference/dom-svg-events-current-baseline.json`: ten observed failures and one SVG animated_string startup readiness timeout. The timeout is not classified as an assertion/API failure. Intermediate 6/6 and5/5 proposal reports and first final11 report are retained separately. The final selected cohort is not full-browser conformance.

Run focused tests after installing the files into a source tree:

```
/workspace/shared/rea-tools/node_modules/node/bin/node --test test/dom-idl.test.js test/svg.test.js test/dom-events.test.js test/dom-lifecycle.test.js
```

`focused-tests.tap` retains the actual final test output. The selected upstream paths are in `selection.json`; rerun with the existing conformance runner and flags above. All test server/browser processes are caller-owned and stopped at completion. No canonical9582 server is needed for these paths.

## Explicit remaining gaps

This proposal does not implement the entire SVG API: path geometry methods (`getTotalLength`, `getPointAtLength`), point lists, text metrics, all reflection/method surfaces and 3D writes through transform-linked DOMMatrix aliases remain unverified or unimplemented. Unresolved percentage viewport values throw an explicit NotSupportedError instead of returning invented dimensions. Some existing SVG animated-string/global getAttributeNS namespace quirks differ from native; global DOM namespace lookup was not falsified to hide those differences. Constructor error-message parity and every WebIDL conversion/argument-count edge have not been exhaustively compared.

Known measured native deviations are retained, including duplicate DataTransfer string formats, non-frozen fresh types arrays, TouchList without an iterator, floor-rounded DragEvent coordinates, null TextEvent data becoming the string `undefined`, case-insensitive token support tables and connected-to-connected custom-element move suppression. These must not be silently replaced with spec-only assumptions.
