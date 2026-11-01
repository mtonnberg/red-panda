# Independent HTTP cache, isolated R5 acceptance

The optional cache persists completed HTTP bytes in its own SQLite schema and
shares entries between Fetch, synchronous XHR, scripts and Dedicated Workers.
Real 304 responses update future cache metadata while the current consumer keeps
the prior body and headers. Cookie ingress uses the actual HTTP response. Cached
delivery produces real request IDs, cache events and inspector body results.

All 18 focused cases pass on each of Node 24.22, 24.19 and 26.13: **54 executed
instances**. Five separate candidate cohorts match **91 declared reference
resource contracts**, including bytes or explicitly identified UTF-8 response
text, status/caption, headers, actual HTTP deltas, cache events and body queries.
Sixteen actual candidate processes closed. The manifest identifies the exact
fields compared; fresh authorities, Date, IDs, clocks and other network metadata
remain in the unmodified raw journals. This is not whole-object equivalence.

The reference's measured Range-after-full-cache and case-insensitive Vary value
behavior are preserved. Initial admission and 304 renewal use distinct policies;
the measured private/no-store/cookie renewal cases retain the genuine validator,
header and cookie state transitions. Cache limits are soft and the default omits
the cache entirely.

`receipts.tar.gz` preserves earlier caption failures, unrun drafts, subsequent
focused passes and actual Native/candidate observations. Every archived byte was
read back against `manifest.json`. The nine-leaf patch is independently derived
from Root `2342`; composition must retain the separate Worker URL-denial check
before cache lookup in both asynchronous and synchronous paths.

This packet has not been applied to Root. The composed source graph, protected
regressions and full-suite validation remain separate gates. Expiry boundaries,
authorization partitioning, parallel/corrupt stores, partial/unsafe methods,
Shared/Service Worker cache ownership and exact wire-byte accounting remain
bounded or unmeasured. No full browser, WPT or performance equivalence is claimed.
