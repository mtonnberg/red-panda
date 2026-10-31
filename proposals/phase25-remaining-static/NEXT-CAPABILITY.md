# Next bounded functional tranche: real URL blocking

Status: source-confirmed missing current handler; all proposed runtime controls are UNRUN. Current CDP falls through unsupported for Network.setBlockedURLs. Pinned `network.zig:227` accepts `urlPatterns:[{urlPattern,block}]` and calls the actual Browser HTTP client. `UrlBlocklist.zig:24` defines the real typed pattern; the source unit control at network.zig1323 checks an actual rejected request and Network.loadingFailed with UrlBlocked/inspector. Source behavior is a contract, not execution proof from this static audit.

This is a useful bounded successor to actual body capture, before full Fetch interception/cache/downloads. Keep it separate from the inspector response ledger: real requests must be prevented, not hidden from events or replaced with synthetic bodies. Browser HTTP-client scope is source-derived; do not guess per-context isolation before the real two-connection control.

Prepare one Native-first ephemeral HTTP fixture with exact request counters and body bytes. Use real targets/sessions, original2500ms RPC bounds, actual document completion and owned process cleanup. Record complete wire/errors/order; stop on no response/connection loss. After Native controls, run the same unmodified operations against a frozen current candidate to preserve its actual unsupported/transport counterfactual.

| Control | Required genuine observation |
|---|---|
|1 schema/context|Before-context, missing/wrong typed urlPatterns/entries and valid empty pattern; record actual Native validation and state atomicity.|
|2 allowed baseline|Real allowed navigation/fetch bytes, server counter and actual Network events.|
|3 direct block|Actual matching fetch/document/script never reaches the server; public error and real loadingFailed come from enforcement.|
|4 pattern semantics|Wildcard/case handling, first-match allow-vs-block ordering, empty patterns and replacement; establish these from actual Native results.|
|5 clear|Empty pattern set restores real next request/body; no retroactive success or hidden response ledger.|
|6 redirect|Allowed source is reached while blocked redirect destination is not; retain public/network failure metadata.|
|7 producers|Actual asynchronous fetch, synchronous XHR and one dedicated Worker/resource producer, with real explicit flags and counters; unobserved channels remain unobserved.|
|8 ownership/lifetime|Two genuine connections/contexts on one actual Native Browser, navigation and replacement/clear. Establish actual shared HTTP-client policy and persistence before choosing Host-private authority.|

Acceptance: no fixture-name/URL-success special cases, no event/result filtering, no public marker authority, no fake pause/UI/bytes. Apply policy at genuine normal/sync/worker transport seams, preserve body/cookie/permission/delivery ownership and limits, and test exact errors/counters on each supported SDK. The next full455 census remains separate; this one command cannot establish complete network compatibility.
