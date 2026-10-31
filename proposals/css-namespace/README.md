# CSS namespace

Independent implementation calibrated against Lightpanda nightly 948d77378.
No upstream production code is imported. Native results and expressions are
retained here and used unchanged by the regression tests in `oracle/css`.

The actual namespace, hidden Css constructor/prototype, namespace methods,
readonly global accessor and error instances are created inside each real Window
or utility VM. The installation captures the actual V8 global accessor receivers
before authored code runs. Calls ignore their method receiver; the global getter
checks actual known globals. String conversion accepts Symbol descriptions and
replaces lone surrogates, matching observed native behavior.

`escape` implements identifier serialization, including control characters,
leading digits, the lone hyphen and non-ASCII characters. `supports(property,
value)` uses the measured property vocabulary and nonempty value test; native
accepts invalid values for recognized properties. The vocabulary has 534 unique
recognized names across the inspected cssstyle property and WebKit alias lists.
Those are feature metadata, not proof of CSS rendering or declaration validity.
One-argument supports scans nested component values and parses declaration,
not/and/or, selector, font-tech and font-format conditions. Selector validation
uses the existing independent selector parser, without querying authored DOM.

Validation: 1664 native observations agree; eight focused tests pass on Node
24.19.0, 24.22.1 and 26.13.0. Tests verify actual selector results, captured
intrinsics, child-frame/error realms and actual protocol utility contexts.
Thirty-eight focused CSS/Console regressions pass. The unchanged upstream
`css.html` passes against both native and candidate, in its real harness branch
with nonzero observations enforced. Exact source and native hashes are in
`manifest.json`; full integration validation remains separate.

Remaining bounds: the feature vocabulary is the inspected list rather than an
exhaustive native property inventory; condition parsing and selector support are
bounded by the existing parser. Full CSS tokenization, escaped property names,
all malformed-input recovery, @supports cascade integration and the wider CSS
namespace/worker exposure matrix are not established. This does not establish
CSS engine parity, full-registration coverage or performance parity. The original
raw prototype descriptor observation contains function serialization differences
between direct JS projection and CDP; the later shape expression measures actual
function types explicitly. Both results are preserved.
