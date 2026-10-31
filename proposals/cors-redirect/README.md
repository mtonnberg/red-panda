# Authored Authorization redirects

This narrow follow-up recalculates authored CORS-unsafe header names after the
transport strips Authorization on a cross-origin redirect. A GET which needs
no remaining preflight reaches the actual destination and retains the normal
response CORS checks. The stripped name stays absent through subsequent hops.
Other headers or methods which still require another preflight continue to fail
explicitly. Opaque-origin redirect support is unchanged.

The scratch composition is `/workspace/shared/red-panda-cors-redirect`, based on
the current custom-element/header/heap integration. `integration.patch` changes
only Fetch's redirect preflight classification and adds three physical HTTP
regressions. It does not import target production code.

The unchanged new tests first reproduce two failures against the original Fetch
source, with the remaining-unsafe-header rejection passing. The final candidate
passes all ten header tests on Node24.22.1 and Node26.13.0. Fresh Native and
candidate public-protocol captures match all52 actions over the existing bounded
same-site header comparison, including physical method/body/origin/path and six
header fields, plus public completion/status/document.cookie. The previous
header-policy milestone matched51/52; its original results remain unchanged.

`manifest.json` binds the base and candidate leaves, patch and observations.
`cors-comparison.json` describes comparison scope; raw captures retain other
fields without asserting equivalence. The existing cookie-site policy gap and
redirects requiring fresh preflights remain open. This is an isolated proposal
until Root applies and validates it.
