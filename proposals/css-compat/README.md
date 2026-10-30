# Independent CSS compatibility proposal

This proposal uses real CSS declarations, CSSOM rules, DOM selector matching, document state and surrogate geometry. It contains no target engine production code. Production source files have not been edited by this proposal.

`phase1.json` freezes `/tmp/red-panda-css-phase1-m5gsdcmr`, including all JavaScript/CLI/package sources and both version-checked native helpers for Node24.19,24.22 and26.13. It records every file hash. `base.json` records the independently frozen source base. `overlay/` contains the eight changed/new source modules. `phase1.patch` adds those changes and ten focused tests. Apply it against the recorded base, or review/adapt its small Browser integration hunk against Root's later work. `profile-tests.patch` separately updates five existing assertions whose prior expectations describe intentionally different behavior.

Implemented behavior:

- Actual 4x4 transform arithmetic, measured six-significant-digit matrix serialization, inherited/relative font-size computation, native raw custom-property and ordinary `var()` token streams, additional computed defaults and stable live readonly per-element/pseudo style views.
- Actual two-axis overflow/overscroll declarations, priorities, numeric indices, shorthand recomposition and single final style-attribute mutation; case-insensitive ordinary property lookup; native float null/undefined handling and independent prefixed border-radius state.
- Nested CSSStyleRules and conditional private grouping records, generic parent selector expansion, real cascade specificity, CSSOM replacement/insertion, layer registration/order/sub-layers/importance and the measured32-level conditional-group cascade limit. Public nested media and layer rule surfaces retain the native base CSSRule type/raw cssText behavior.
- Document-root stylesheet `:scope`; actual empty Text node handling for `:empty`; synchronous style invalidation after form/indeterminate state, CharacterData, custom-element definition, fragment target and private popover state changes. UA hidden tags/details/popovers use ordinary low-priority UA rules. Geometry honors actual assigned-slot/closed-shadow/fallback state.
- Real realm MediaQueryList/Event interfaces over EventTarget, native measured media grammar, trusted queued viewport change events, weak registration and document cleanup. Browser and CSS `@media` share the evaluator. Screen width/height follow actual viewport state.
- Fresh parsed author sheets have the actual owning public CSSStyleSheet.prototype in their prototype chain, preserving existing sheet/rule identity and authored subclasses. This matches independent_mcp's real-factory proposal.

Public native probes are retained in `*-native-controls.json` and `native-controls.json`, with exact expressions and executable hash. They verify the deliberate native differences from a general CSS renderer: transform absolute/percent units retain raw magnitudes; variables remain unresolved; empty matchMedia is false; unsupported query features/types fail according to measured grammar; ordinary owner sheets support replaceSync and async replace without changing source text; nesting/layer CSSOM exposure differs from standards classes; depth32 applies while33 is ignored. Important layer ordering and float/prefix contracts are observed directly.

Validation:

- Frozen unchanged upstream fixtures:10 passed of11 selected. All nine CSS/declaration/layer fixtures pass, as does `frames/cross_realm_style.html`; full flags and actual document-complete/20ms settling are in `frozen-conformance.json`. `element/check_visibility.html` has no remaining assertion diagnostics but fails at existing missing `SVGSVGElement.x.baseVal` in this snapshot. The SVG proposal is a separate dependency.
- Ten new focused tests pass on Node24.22 and26.13. Forty-two existing CSSOM/style/layout tests pass after explicitly changing five expectations for real nested rule serialization, owner-sheet replace, raw variables and pseudo-style identity. The untouched tests passed37/42; no unrelated layout expectation was relaxed.
- Position/layout remains separate. This proposal preserves the existing surrogate geometry apart from actual flat-tree hiding, stable computed views, raw-var width exposure and viewport media notification. It does not resolve the broad `element/position.html` containing-block/flex/overflow/translation gaps.

Known limits include unsupported `@supports`, container queries, full font/layout rendering and pseudo-element-specific cascades; native stylesheet-color handling also differs from the existing broader candidate cascade. The preserved pseudo entries currently read the existing real element cascade, matching the bounded identity/default observations but not establishing complete pseudo-element semantics. These are explicit future compatibility work, not successful no-ops.

Run focused tests with `/workspace/shared/rea-tools/node_modules/.bin/node --test proposals/css-compat/tests.mjs`. `launch.sh` starts the immutable proposal Browser. Existing-test updates and hashes are recorded separately so reviewers can assess each native-profile contract change.
