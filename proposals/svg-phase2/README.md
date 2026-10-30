# Native-calibrated SVG phase2 proposal

Production source and dependencies are untouched. `phase2.patch` applies after the DOM/SVG/events phase1 proposal. The preserved phase1 snapshot is `/tmp/red-panda-dom-svg-events-proposal-2km2bzcm`; this proposal runs in `/tmp/red-panda-svg-phase2-ebuddvis`. No target engine implementation was read/copied to implement these modules. External unchanged tests and bounded public Native CDP observations are the oracle.

## Changes and integration

The existing `installSVG` now installs the extended geometry automatically. Two new modules, `svg-path.js` and `svg-geometry.js`, supply real path parsing, shape geometry, text metrics, bounds and CTMs. SVG's existing module gains native-exposed Angle, PointList, StringList and preserveAspectRatio classes, text/path reflectors and measured GenericElement identity. The genuine DOMPoint/DOMMatrix classes get weak internal links, allowing SVG values to retain their actual geometry brands, no own surrogate properties and live attribute state. Affine aliases and actual matrix operations commit attributes, with measured3D flattening and sticky readonly guards.

Review the small dependencies separately when merging concurrently changed files:

- `geometry.js`: private point/matrix links and CSS constructor grammar. DOMMatrix CSS strings require comma-separated arguments; SVG transform attributes retain their separate SVG grammar.
- `styles.js`: one internal `getCascadedStyleValue` export reuses the existing cascade winner for SVG font/anchor resolution. It changes no global CSSOM behavior. Relative font-size values are resolved by the SVG consumer against real ancestors.
- `selectors.js`: in HTML documents, native matches SVG type selector names case-insensitively (`foreignObject` and `foreignobject`). XML documents retain case-sensitive matching.
- `test/svg.test.js`: two phase1 expectations are corrected by new Native controls: unknown namespace-created SVG elements use SVGGenericElement, and insertion of an already-owned transform copies it instead of removing it from its old list. The historical phase1 milestone files/reports are unchanged.

There are no new Browser imports/calls in this phase. Do not replace newer common files wholesale; apply the narrow patch hunks using `baseline-hashes.json` and `base/` for comparison.

## Implemented contracts

Geometry reads actual authored attributes/path commands. It handles absolute/relative M/L/H/V/C/S/Q/T/A/Z, repeated commands, malformed trailing prefixes, closed and multiple subpaths, rounded rectangles, lines, circles, ellipses and polylines/polygons. Curve bounds use analytic extrema. Distances and points use actual flattened segments, with adaptive de Casteljau subdivision calibrated against public scale controls; arc sampling is256edges/turn. Native's pathLength and element-transform exclusions are preserved. Containers include genuine child geometry/transforms; CTMs stop at the native-observed nearest SVG viewport rather than inventing unsupported viewBox behavior.

Text uses the target's documented deterministic fallback advances from actual DOM content: UTF-16 character addressing, whole-codepoint substring overlap, XML whitespace normalization, inherited font sizes, East Asian/emoji/combining widths and actual position/anchor attributes. This is native fallback measurement, not claimed font shaping. Hidden/detached text boxes, tspan continuation and separate metric-versus-box behavior follow public controls and unchanged text.html. No constant fixture outputs are inserted.

Point lists retain real DOMPoint identity, live attribute updates, external-reparse detachment, sticky readonly animation values and measured copying when an inserted item already belongs to a list. String lists retain authoritative logical items until an actual external attribute change and use their distinct delimiters. Scalar reflectors, transforms and aspect-ratio objects retain SameObject identity and actual attribute mutation records.

## Evidence and limits

Pinned native binary SHA256 `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`, version1.1.0-nightly.11326+948d77378. External fixtures remain at commit948d773786380bae36f046639fc61e2ddddd212a with the original upstream license retained outside the implementation.

- Fresh native control: all9 `element/svg/*.html` pass, `docs/reference/svg-phase2-second-native.json`.
- Final candidate cohort adds all8 non-SVG phase1 cases to those9; see `docs/reference/svg-phase2-reviewed-candidate.json`.
- Public geometry/text/list/affine probe:613 numeric comparisons match at absolute1e-9/relative1e-12; `docs/reference/svg-phase2-public-final-differential.json`. Prototype-key order is excluded and inventoried separately.
- Additional16 scale controls retain two real negative precision outcomes: at scale100, quadratic lengths differ by0.00016042685865613748 and0.000047996580178732984. `docs/reference/svg-phase2-precision-final-differential.json` keeps the actual mismatches at1e-9. Focused tests bound this large-curve approximation by0.001; they do not assert exact equivalence for that control. Further Native precision calibration remains necessary.
- Prototype/property enumeration and constructor string/error-message equivalence are not complete. The existing jsdom SVGAnimatedRect, SVGSymbol viewBox/preserveAspectRatio and other SVG event/mixin/prototype extras remain explicitly different from Native; no full interface-surface equivalence is claimed.
- Global computed-style font-size pixel serialization, cross-realm point-list insertion, every argument-conversion corner case, variable-font shaping, and all Unicode width boundaries are not exhaustively verified. The isolated SVG consumer has real cascade/font inheritance but does not claim to fix all CSSOM consumers.

The first five-fixture report, initial fixed-sampling public report and initial focused test failures remain in docs/proposal artifacts; no negative control was relabeled as a pass. No canonical9582 fixture server is used. All owned servers/browsers are bounded and stopped after each run.

Run focused/regression checks with the prepared Node:

```
/workspace/shared/rea-tools/node_modules/node/bin/node --test test/svg-extended.test.js test/svg-path.test.js test/svg.test.js test/geometry.test.js test/dom-idl.test.js test/dom-events.test.js test/dom-lifecycle.test.js
```

`focused-tests-captured-reviewed.tap` records the final47 passing tests. Full frozen source/native binding/Node/tool/fixture hashes and exact fixture flags are in the final manifest/checkpoint alongside this proposal.
