# Flow layout compatibility proposal

`phase2.patch` and `overlay/` contain independent implementations over actual DOM/CSS state. `frozen.json` binds the physical source snapshot and native helpers, plus shared dependency digests. `launch.sh` runs that snapshot. Root integrated narrow hunks while preserving its newer SVG selectors and geometry hooks.

The implementation separates intrinsic widths, actual used widths, nominal sibling advances and overflow; implements measured flex allocation, explicit dimensions, unit resolution, text wrapping, scroll clamping, offset ancestry and borrowed-method owner routing. Cascade projections and private DOM/root revisions avoid allocating full public computed declarations for each layout box. Primitive selectors reuse the actual parsed predicate and genuine document/root state. No fixture outputs or synthetic DOM attributes determine results.

Native controls are `*-controls.js` and matching `*-native-controls.json`. They measure real public behavior, including surrogate text metrics and the target’s unusual immediate-child height and nominal-position rules. The target is not a complete visual layout engine; these models preserve measured behavior rather than claiming standards completeness. Public pseudo-element cascade and broader descriptor placement remain separate limits.

`validation.json` binds both final test logs: 84/84 pass on Node 24.22.1 and 26.13.0. Source and shared dependency digests matched after those runs. The patch was checked against the phase1 base.

The unchanged `element/position.html` source fixture (SHA256 `6da09ece89862dd4edea7f4806d7ea390222ca6b4b6bbcc17b97c488badeb83d`) still exceeds its native source 2s budget. Canonical frozen evidence preserves a 15s timeout and a 30s pass in 16.338s. The earlier 9.105s/10s pass used exploratory mutable source and is not a final-source guarantee. Parent’s later integrated 12.4s/15s pass has a distinct source manifest. No increased runner budget is advertised as target equivalence.

Exploratory `position-*.json`, profiler and diagnostic artifacts record investigation history. Diagnostic script injections are not unchanged conformance evidence. New performance work lives outside this frozen proposal directory.
