# Initial-parser custom-element insertion and document guards

Use `integration.patch`. It changes only `src/custom-elements.js`,
`src/document-reset.js`, and three added tests in `test/custom-elements.test.js`.
It applies cleanly after Root’s retained-world, codec and CORS integrations.
This independent fix imports no Lightpanda engine code and leaves the upstream
fixtures and assertion harness unchanged.

The restored baseline reproduced two separate failures:

- `parser_reparented_element.html` exited1 and closed CDP. The preserved stderr
  identifies SymbolTree.insertBefore rejecting an already-parented element in
  the foster-parent path. The append path also moved the custom element away
  from the parent chosen by its actual attributeChangedCallback.
- `throw_on_dynamic_markup_insertion.html` recorded no test observations and
  exited0. Initial-parser constructors could call Document.open/close while the
  genuine dynamic-markup counter was positive. Existing guards only covered a
  post-load reset or an active write-created cycle, so opening erased the
  fixture assertions before they ran.

The parser adapter now tracks just-created elements with a real parent after
creation reactions finish and skips their first parser attachment. The original
open-element stack still parses real children into the element. Fragment parsing
and later DOM moves keep their original behavior. Document.open/close now honor
that existing genuine counter for every active HTML document; Document.write
already enforced it. No synthetic callbacks, DOM results or harness observations
are supplied.

Fresh checks on the frozen composition:

- All74 focused custom-element, document-reset, document-write, parser-write,
  frame-write and classic-script tests passed on Node24.22.1 and26.13.0.
- Both unchanged source fixtures passed against the verified Native binary.
- Both unchanged source fixtures passed against the fixed candidate on both
  Node versions, enforcing nonzero harness observations and normal exit0.
- Three added controls cover append/foster reparenting and continued real child
  parsing, initial-parser constructor exceptions with retained later scripts,
  and write-created constructor guards followed by ordinary later writes.

`manifest.json` records source, fixture-report, helper and evidence hashes. The
only helper instrumentation forwards owned child stderr previously discarded by
the reference launcher. Historical coverage results remain unchanged. The first
focused attempt contained new fixture syntax mistakes and missing copied support
modules; its failed log is retained. A separate accidental Root71-test run is
retained and excluded from validation of this patch.

Full latest Root and55-check PureScript validation remain integration work. The
source controls use a15s instrumentation deadline and100ms post-complete settle;
they make no2s performance or full browser compatibility claim.
