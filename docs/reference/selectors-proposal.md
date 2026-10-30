# Independent selector and ID proposal

[selectors-proposal.patch](selectors-proposal.patch) is a concrete, un-applied
patch adding `src/selectors.js`, focused tests, Browser installation and style
integration. `git apply --check` passes against the current checkout. The patch
requires the dialog proposal promoted as `src/dialogs.js`; root owns production
integration. The selector owner changed no production files, package manifests,
installed dependencies or upstream engine implementation.

The opt-in implementation is [selectors-prototype.mjs](selectors-prototype.mjs).
[selectors-integration.mjs](selectors-integration.mjs) uses Node source-loading
hooks for component tests and Browser observations. It leaves source files
unchanged. The adapter works on genuine pinned jsdom implementation objects;
NWSAPI supplies structural matching after independent lexical validation and
actual attribute/type/ID/class predicates. Queries return real nodes and static
NodeLists in tree order. Document ID lookup scans the actual tree rather than
using the dependency's insertion-ordered duplicate-ID cache.

The changes cover empty attribute operators, ASCII comparison flags, HTML versus
foreign-element case rules, CSS escapes and invalid lexical values, valid
nonmatching pseudo-elements, rejected pseudo-element combinations, duplicate ID
mutations/moves, scoped subtree queries and root replacement. The existing
namespace-qualified attribute-selector path remains delegated to the underlying
engine. This is not a replacement for the complete CSS selector grammar.

CSS matching drops pseudo-element alternatives inside `:is()`/`:where()` as
measured. The specificity utility makes the same change for actual cascade
scoring; public CSSOM `selectorText` remains unchanged, matching native. Invalid
`closest()` selectors preserve native's generic `Error`, while query APIs and
`matches()` produce `SyntaxError`. Native parses `:modal` but public matching was
false even after `showModal()`: the optional `matchesModal` provider therefore
defaults false, independently of the dialog controller's actual `isModal` state.

Popover matching uses the dialog controller's private `isPopoverOpen` state.
The private `getDialogStateRevision(window)` provider also enters computed-style
and layout revision tokens. Actual state transitions therefore invalidate live
styles and ancestor `:has(:popover-open)` rules even without DOM mutations or
observable events from closed ShadowRoots. No marker attributes are introduced.
Disposal follows the owned document's abort signal and retains ordinary behavior
for unregistered documents.

## Evidence

[selectors-native-observation.json](selectors-native-observation.json) retains a
public raw CDP probe of the verified official native binary, 85 selector vectors,
CSSOM observations, duplicate-ID mutation snapshots and a final heartbeat.
[selectors-probe.mjs](selectors-probe.mjs) is its hash-bound driver. It uses owned
random-port servers/processes and closes only those resources.
[selectors-public-comparison.json](selectors-public-comparison.json) records
**85/85 matching vectors** against genuine DOM results from the direct installer;
this comparison is separate from Browser acceptance.

[selectors-prototype.test.mjs](selectors-prototype.test.mjs) passes **11 tests**,
including real cascade, static NodeList and closed-shadow behavior, actual
modal/popover state, retained computed styles, lifecycle/receiver checks and
namespace fallback. Existing style, DOM and input suites pass **53/53** through
the overlay. Verbatim logs and artifact hashes are retained in
[selectors-checkpoint.json](selectors-checkpoint.json).

The final unchanged Browser run in
[selectors-browser-comparison.json](selectors-browser-comparison.json) passes
**5/7** fixtures. All seven entered the exact native/external-runner harness
branch, with matching fixture hashes and no timeouts/unobserved results:

- `document/query_selector.html`, `document/query_selector_all.html`,
  `element/selector_invalid.html`, `element/attribute_value_escapes.html` and
  `element/duplicate_ids.html` pass. The duplicate-ID fixture now uses the actual
  separately integrated `moveBefore` implementation.
- `document/query_selector_attributes.html` reaches six remaining assertions
  whose only diagnostic is absent `innerText` (`undefined`). Root owns its
  installer.
- `document/query_selector_pseudo_element.html` reaches the stylesheet assertion
  and stops at absent `Element.checkVisibility`. That API is an explicit
  integration prerequisite; no substitute result is fabricated here.

Native controls for all seven already passed in the immutable broader checkpoint;
its retained report and fixture hashes are paired in the selector checkpoint.
The candidate Browser run used a mutable working checkout; its launcher hash
alone does not bind imported modules. Recorded post-run source hashes document
that limitation and do not imply an immutable production acceptance run. Root
should rerun the combined immutable candidate after integrating prerequisites.

## Bounds

The adapter delegates structural/state semantics to the pinned dependency except
for measured private providers. Namespace-qualified attributes retain existing
engine behavior rather than receiving a full grammar overhaul. Candidate queries
scan tree-order candidates, and selector/predicate caches live for the document's
lifetime. No performance or whole-renderer conformance claim is made. More complex
selector syntax beyond these public vectors still requires independent probes.
