# Independent Element.checkVisibility proposal

`check-visibility-proposal.patch` adds `src/check-visibility.js` and nine focused tests. Call `installCheckVisibility(this, window)` after `installStyles`, before page scripts, in every document realm. It installs an idempotent realm-native-shaped Element method; it owns no timers, listeners, callbacks, or global synthetic attributes. Production/common files were not edited by this investigation.

`check-visibility-opacity-dependency.patch` separately preserves observed opacity CSS values through actual declaration setters, cascade, and computed style. It passes `git apply --check` against the current checkout with or without the independent innerText Styles patch. The additive tests also expect the previously proposed native UA `noscript { display:none }` dependency. The selector adapter and its `selectorForSpecificity` integration remain separate requirements of the motivating fixture.

## Public oracle

All probes use an owned random-port HTTP origin and the verified native binary, SHA256 `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`. Scripts and complete raw observations are `check-visibility-*-native-probe.mjs` and `check-visibility-*-native-observation.json`. All owned browser/client/server processes are closed in finally blocks; port9582 was not used.

Native behavior observed and implemented:

- A detached element or element in a detached DocumentFragment can be visible. An element belonging to a separate `createHTMLDocument` document without a window returns false.
- `display:none` on the actual element or any composed ancestor returns false. `display:contents`, zero dimensions, empty content, offscreen positioning, inert, and aria-hidden do not independently return false.
- `checkVisibilityCSS` and its alias `visibilityProperty` check the element's computed visibility. A visible descendant can override a hidden ancestor. Measured collapse behaves as hidden.
- `checkOpacity` and its alias `opacityProperty` check opacity on the element and composed ancestors. Only the exact computed string `"0"` suppresses visibility in the measured native implementation. Native preserves values such as `"-1"`, `"0.00"`, `"-0"`, `"0%"`, `"calc(0)"`, arbitrary `"banana"`, and unresolved opacity `var(...)`; they do not become zero. Leading-dot numbers normalize (`.5` becomes `0.5`) while other measured lexical distinctions remain.
- The four supported dictionary members are read in this order: checkOpacity, checkVisibilityCSS, opacityProperty, visibilityProperty. All are read before display checks, booleans use real JS conversion, and thrown getter values propagate unchanged. Aliases combine with OR. `contentVisibilityAuto` is never read. Neither content-visibility:hidden nor measured offscreen auto behavior changes the result.
- Null/undefined dictionaries are accepted; primitive dictionaries throw a realm TypeError, and functions are accepted. The Element brand is checked first. The method has length0 and writable/enumerable/configurable descriptors.
- Shadow hosts and real slot assignment participate in visibility. Unassigned light children of a shadow host and fallback children replaced by assigned nodes return false. Closed roots behave consistently with open roots. The implementation inspects actual jsdom assignment state and does not expose it as public attributes or infer it from an overridden assignedNodes method.
- Hidden and closed-dialog default display is a real UA stylesheet effect; author display:block can override it. Native closed popovers are likewise hidden by computed display and author overrides survive. Popover default style/state is a dependency of the dialog/selector/Styles integration, not a hardcoded check in this new method.

## Validation

Nine new tests pass in a standalone source copy with the proposed Styles/CSSOM dependencies. Existing Styles and CSSOM tests also pass: 40 total tests, 40 passes. Both patches pass git apply --check. Staging location, input/output file hashes and verification summary are in `check-visibility-proposal-manifest.json`.

The exact final module was checked with unchanged `document/query_selector_pseudo_element.html` from pinned source `948d773786380bae36f046639fc61e2ddddd212a`. Native passes; the isolated selector proposal without this method fails with the actual missing-method TypeError; selectors plus this method pass. Both execute the same native testing.js branch via Lightpanda/1.0 test UA and __lp_external_runner, iframe+worker flags, and100ms settle. Final source, overlay, runner, harness, fixture, and binary hashes are retained in `check-visibility-final-source-fixture-comparison.json`.

An earlier isolated run omitted the selector specificity helper and failed the preceding computed-display assertion. That report (`check-visibility-fixture-comparison.json`) is preserved; it was an incomplete integration rather than evidence that the visibility method failed its assertions.

## Remaining evidence limits

These observations establish the pinned native browser's style/composed-tree behavior, not a complete browser layout specification. No geometry/viewport heuristic or speculative content-visibility auto skipping is added. Complex SVG, display locking, generated content, and adoption across active realms are not comprehensively established.

Repeated native opacity probes disagreed about the computed serialization of a late `revert` declaration in a long create/remove loop (one run returned1, another returned the literal revert), while all had an actual opacity-zero ancestor and correctly returned false. Raw observations are retained. This proposal keeps the existing genuine CSS-wide cascade behavior and does not claim to reproduce that inconsistent serialization observation. Popover checks require the separate state-aware UA stylesheet integration; no false pass is claimed for that dependency before root integrates it.
