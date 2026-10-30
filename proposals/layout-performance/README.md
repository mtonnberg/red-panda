# Layout performance proposal

This independent proposal replaces repeated internal wrapper traversal and selector work with operations over the same real DOM, parsed selectors and cascade. `performance.patch` applies to the physical Root 8a8558d baseline in `base.json`; `frozen.json` binds the final physical snapshot, both native helpers, test/reference inputs and shared dependency digests. No production files were edited.

## Changes

- Traverse actual SymbolTree nodes and children internally. Cache child lists and nominal sibling-advance prefix sums only within one valid layout snapshot. Returned rectangles keep their numeric snapshot values.
- Reuse the authoritative style/DOM revision during synchronous layout calculation. Standalone layout retains full fallback tokens, including CharacterData. CSSOM, media, private shadow/slot and selector state still invalidate actual results.
- Match parser-proven simple conjunctions directly. Retain required subject predicates for conservative rejection, and index private UA rules by a direct subject type only when every selector alternative provides one. Actual rule objects and source order are preserved; logical and unknown cases use the existing matcher. Universal queries return genuine static NodeLists over actual tree nodes.
- Cache only immutable single-property parser expansions, bounded to 1,000 entries. Cascade winners, source order, specificity, inheritance and current DOM state are still calculated. Precompute flow-property name conversion.

The patch preserves SVG case folding and `getCascadedStyleValue`, the captured DOMRect factory and method creator realm, and actual sheet/rule identity. Apply narrow hunks if newer Root geometry or private factory-registration work has changed those areas.

## Evidence

`validation.json` records all source/dependency digest checks, tests and timings. 128/128 CSS/layout/selector/SVG tests pass on Node 24.22.1 and 26.13.0, including seven new mutation, identity and snapshot tests. The patch was checked against the frozen baseline.

Under the same owned port0 runner, unchanged position fixture, resource flags and 20ms settle, unprofiled baseline navigation passes in 13,573ms. The final immutable proposal passes a 5s runner budget in 2,454ms. Its strict 2s runs still time out on both Node 24 and Node 26. The verified native target passes in 63ms with 2s. The source 2s requirement remains unmet; the 5s result is diagnostic evidence, not a replacement target budget.

The frozen 32-fixture cohort under 5s yields 31 passes and one failure: `check_visibility` expects SVG 2em under a 30px shadow host to resolve to 60, but gets 32. The untouched baseline reproduces the identical assertion. Its SVG font helper stops at `parentElement`, missing the host. Root and the SVG owner were notified; this proposal leaves that separately owned code unchanged.

`cpu-summary.json` links four real V8 CPU profiles and compressed originals with source hashes. These profiles cover entire subprocesses, including startup and teardown. The initial profile identifies repeated selector normalization/matching and wrapper collection traversal; subsequent profiles show those costs fall. Exploratory stage deltas and outcomes are retained separately, including the generic subject-filter 10s timeout. No fixture-specific results, output rewriting, synthetic DOM markers or target production code were used.

The older phase2 evidence remains unchanged in `../css-layout/`: its own 15s timeout/30s pass and Root’s separate 12.4s integration pass must not be conflated with this new snapshot.
