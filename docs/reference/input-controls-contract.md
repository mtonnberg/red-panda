# Independent input-control compatibility

The proposal is isolated in `/tmp/red-panda-input-controls.9QxRMS`, copied from
the immutable broader checkpoint 085510c. Existing shared and copied production
files were not edited. `src/input-controls.js` is a new independent module;
`input-controls-bootstrap.mjs` composes the copied Page beforeParse method only
in test processes. No target engine production code or Puppeteer JavaScript was
used. Public native APIs and unchanged HTML fixtures supplied the contracts.

## Integration

Import `installInputControls` from `./input-controls.js` in Browser and call
`installInputControls(this, window)` after `installForms(this, window)`, before
new-document preloads and document parsing. This applies to frame preparation as
well. The installer returns `{ dispose() }`, is idempotent for an active document,
and disposes on document abort or Window close. It adds no Page close listener or
asynchronous task. Unregistered jsdom documents retain their original behavior.

The only shared hooks proposed for review are scoped pinned-jsdom input/label
implementation methods and a composable parse5 adapter wrapper. No node_modules
or dependency changes are necessary. Existing style-state wrappers and native
form owner/validation/dispatch mechanisms remain in the chain.

## Actual behavior

- Range values clamp and snap to the actual decimal step ladder, round ties
  upward and avoid a rung beyond max. Step=any preserves fractions. Already
  aligned strings such as `4.0` and `1e1` retain their authored representation.
  The observed native inverted-range max-wins quirk is preserved.
- Parsed inputs initialize after all actual attributes are adopted. A parsed
  range with max=11 defaults to 6; a dynamic default range at 50 followed by
  max=20 clamps to 20. Attribute changes, assignments and reset re-sanitize
  actual state while preserving the value content attribute.
- Stepping uses Decimal arithmetic and counts an off-ladder snap as step one.
  Negative counts reverse direction; zero leaves the value unchanged. The real
  value setter retains dirty-value and computed-style invalidation behavior.
  Numeric/date assignment also retains dirty state without inventing DOM events.
- Time numeric conversion omits redundant zero milliseconds and retains three
  fractional digits otherwise. Authored time strings remain intact. Local
  datetime values trim zero fractions/trailing fractional zeros as observed.
- Radio groups compare actual tree roots, names and form owner identities,
  including external form= associations. Canceling a real activation restores
  the prior checked member and preserves existing dispatch/default cancellation.
- Detached ordinary labels resolve wrapping controls but do not resolve for= or
  expose labels on detached controls. Shadow roots retain association even when
  their host is detached. Native `labels` returns a fresh realm Array snapshot of
  actual label nodes, not a live NodeList; this native quirk is reproduced.
- Option remains a real constructing factory with zero declared arguments,
  unchanged option creation/state and the readonly HTMLOptionElement prototype.

## Evidence

`input-controls-observations.json` records source identities, fixture hashes,
baseline failures, signed-step/serialization/label public observations and
canonical fixture results. Raw reports/logs remain alongside the isolated copy
or under the explicitly recorded `/tmp/red-panda-input-*` paths.

All eight prepared regressions failed before the adapter and pass afterward.
The thirteen proposed input-control tests pass. Together with the frozen input,
focus, forms, form-control, CSSOM, styles and shadow suites, 123 tests pass.
The public native and candidate probe agrees across all eleven observation
groups, including twenty signed/zero stepping cases and native label snapshots.

All six unchanged fixtures pass in native and isolated candidate with
`--load-resources iframe --load-resources worker`, canonical origin
http://127.0.0.1:9582, native harness branch true and Lightpanda/1.0 test user agent.
Assertions are nonzero and there are no assertion diagnostics/runtime exceptions.
Owned native radio/option processes required the runner's forced cleanup after
passing; raw process status is retained. Candidate processes exited normally.

An earlier owned port0 candidate run passed five fixtures. input-attrs failed
only because its native harness hardcodes port9582 for expected formAction URLs.
That infrastructure mismatch is retained; the fixture, harness and URL semantics
were never changed to bypass it. Root explicitly assigned the temporary9582
window, and it was released after the final verification.

## Boundaries

This is bounded compatibility evidence for six control fixtures, not full input
or browser parity. Dynamic form-owner adoption, handlers that change radio groups
mid-click, custom form-associated labelable elements and all numeric/time edge
cases are not exhaustively established. Existing jsdom validation and WebIDL
conversions retain their other limitations. Dialog/popover behavior is excluded
and belongs to its separate owner. The patch includes only the reviewed installer
integration; the test bootstrap is not required in production.
