# Live form properties

Red Panda independently exposes form controls through named and indexed
properties. The implementation uses actual jsdom control collections and node
identities; it does not construct substitute DOM results.

The same public expression in [the probe](form-controls-probe.mjs) runs against
the verified native executable and an independent Browser. The final
[expanded observation](form-controls-after.json) has identical result objects
on Node 24.22.1. The initial [before observation](form-controls-before.json) and
the intermediate `form-controls-after-expanded.json` and
`form-controls-after-indexed.json` retain the earlier differences.

Observed contracts include:

- `form.user` and `form.identifier` return actual matching controls. Duplicate
  names return a live RadioNodeList. Rename/removal updates lookups without
  retaining a past-name alias.
- Prototype members such as `action` and `submit` take precedence over control
  names. Named properties are own, writable and nonenumerable descriptors;
  assignment shadows the virtual property and deletion restores live lookup.
- Numeric descriptors are enumerable and readonly, while property enumeration
  omits virtual indices. Strict assignment throws; deletion succeeds and leaves
  the live indexed lookup intact. A configurable numeric definition succeeds
  without replacing the indexed node.
- Form-controls collections preserve actual iteration order and listed
  fieldset/output/object elements, including external listed controls. Image
  submitters remain outside `elements` and direct form properties.
- A disconnected control's public `form` getter falls back to its ancestor form.
  An unmatched `form` attribute still excludes it from the entry collection;
  these two native behaviors must not be collapsed into one association rule.

Five new focused tests, together with existing form and collection tests, pass
34 checks. The previously failing unchanged upstream `element/html/form.html`
also passes in the [preliminary integration run](form-controls-fixture-integration.json).
That preliminary run used the mutable working tree before the named-context
selector change; it is separate from later frozen checkpoint comparisons.

The adapter is installed before parsing in Browser root/frame realms. It does
not retrofit already exposed form wrapper identities in an externally created
jsdom document. Unregistered documents retain jsdom behavior. Nonconfigurable
numeric definitions and other unmeasured exotic-property operations remain
outside the demonstrated contracts; the Proxy adapter rejects definitions that
would violate its host invariants. These bounded results do not establish full
HTML form or custom-element association conformance.
