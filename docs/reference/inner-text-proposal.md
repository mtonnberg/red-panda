# Independent innerText proposal

This additive proposal implements `HTMLElement.innerText` using actual DOM children and live computed styles. It does not import upstream engine code or change fixture assertions. Production/common files remain untouched in this investigation.

Apply `inner-text-proposal.patch` (new `src/inner-text.js` and focused test), then `inner-text-style-dependency.patch` (two small CSS dependencies). Both pass `git apply --check` against the current checkout. Root integration must import `installInnerText` and call `installInnerText(this, window)` once per realm after `installStyles`, before page scripts. Installation is idempotent and requires no event listeners or timers. The selector proposal is independent; its installer needs no change.

The separate Styles dependency adds `noscript { display: none; }` at UA origin so real author display rules can override it. It also validates native-observed `text-transform` grammar before the cascade: case keywords survive, `full-width`/`full-size-kana` modifiers do not alter the resulting computed case, and invalid declarations expose actual lower-priority declarations. Inline CSS serialization remains unchanged. This is necessary for `css/text_transform.html`; it is not an output substitution inside the text getter.

## Evidence

Public probes used the verified native binary at `/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux`, SHA256 `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`. All HTTP origins used owned random ports, with owned browser/client/server cleanup. The `inner-text-*-native-probe.mjs` scripts and corresponding observation JSON retain inputs/results and binary identity.

Observed behavior implemented:

- Disconnected roots and roots hidden by `display:none` return actual unfiltered `textContent`; rendered roots filter descendants by real style state.
- `visibility:hidden` suppresses text while an explicitly visible descendant remains collectable. `opacity:0`, `aria-hidden`, and `content-visibility:hidden` do not suppress measured text.
- Actual BR nodes contribute literal newlines. Tag-based block boundaries collapse required breaks, paragraphs require two, and table rows separate actual cells with tabs. Changing a span's CSS display to block does not add a block break in the measured native implementation.
- ASCII whitespace collapses across text nodes. The PRE tag preserves whitespace; setting only CSS `white-space:pre` does not reproduce that native tag behavior. NBSP and other measured Unicode spaces remain real text.
- Text conversion follows measured simple Unicode case pairs, preserving native deviations from JavaScript's full Unicode folding. Capitalize and width/kana conversion are not imposed where the reference leaves text unchanged.
- The setter converts its input before mutation, normalizes CR/CRLF, builds real Text/BR nodes, replaces actual children, preserves genuine MutationObserver records, and never parses markup. Measured primitive Symbol conversion uses its description; ordinary object conversion still throws when it produces a Symbol.
- HTMLScriptElement has a separate native-observed own innerText accessor aliasing actual script text. Its raw text setter keeps newlines and converts null to `"null"`; the HTMLElement setter instead converts null to an empty string.

The installed getter/setter are realm functions with real HTMLElement/script brand validation. No synthetic constructor fingerprints, hardcoded fixture results, or callback fabrication are included.

## Verification

Eleven focused tests pass in an isolated source copy with the proposed Styles dependency. They cover more than 100 connected/detached/tag/Unicode/style control cases, getter/setter mutation and identity, coercion, brands, script aliasing, and real cascade fallback. The exact staging copy and file hashes are in `inner-text-proposal-manifest.json`.

The unchanged external fixtures use pinned source `948d773786380bae36f046639fc61e2ddddd212a`, original testing.js, `Lightpanda/1.0` test UA, `__lp_external_runner=true`, iframe+worker resource profile, and equal 100 ms settling. `inner-text-style-fixture-comparison.json` retains native and candidate diagnostics and fixture hashes. This is an isolated integration overlay on `/tmp/red-panda-broader-frozen-EGeNlI` with the selector proposal, not a claim that root has integrated or validated the patch.

| Unchanged fixture | Native | Selectors + innerText + Styles dependency |
| --- | --- | --- |
| document/query_selector_attributes.html | pass | pass |
| document/insert_adjacent_element.html | pass | pass |
| document/insert_adjacent_html.html | pass | pass |
| css/text_transform.html | pass | pass |
| element/inner.html | pass | fail: existing HTML attribute serialization emits raw `<tag>` instead of `&lt;tag&gt;` |

The earlier `inner-text-fixture-comparison.json` preserves the run before the computed-transform dependency: 3/5 candidate passes. Missing-innerText diagnostics disappear with the proposal; the remaining inner.html serialization issue belongs to the existing serializer.

## Evidence limits and remaining work

The implementation matches measured tag/style text collection, not a full rendered layout or a full Unicode table. CSS line wrapping, complex scripts, and unmeasured replaced elements are not established. Native probes showed light-DOM collection rather than flattening shadow slots; broader shadow behavior remains unverified. SVG does not acquire an HTMLElement accessor.

Text-transform custom properties are not claimed as complete: direct native probes ignored measured var(...) declarations, and stylesheet changes between repeated late head.innerHTML replacements produced differing fallback observations. Both raw observations (`inner-text-transform-cascade-native-observation.json` and `inner-text-transform-vars-native-observation.json`) remain available. This proposal preserves the consistently measured literal-value/cascade behavior; broader native variable and dynamic stylesheet invalidation semantics need a separate controlled investigation. No full-browser compatibility conclusion follows from these selected cases.
