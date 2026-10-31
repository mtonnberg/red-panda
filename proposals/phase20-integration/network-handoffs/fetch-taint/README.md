# Real Fetch no-cors redirect taint

Independent base8b10d2fada6aaa625e28bcdcad9c509373e4bf0c, three-line state correction in src/fetch.js plus real HTTP tests. No implicit metadata/WASM/Shared/SSE/WS/worker-XHR prerequisite; no native rebuild. Root runtime/dependencies/source fixtures/registration unchanged.

Before: own-origin no-cors fetch crossing to another origin and redirecting home exposed a basic response/status200/readable actual final bytes. Native returns opaque/status0/no public URL/headers/body. Fetch checked only the final origin and forgot the real redirect history.

After: capture whether the actual initial/redirect URL list crosses origin, using existing private document origin and actual transport onRedirect callback. Once tainted, no-cors final response uses the existing genuine opaque response filter and actual final body cancellation. All same-origin redirects remain readable. No generated response data/HTTP success/events or endpoint exceptions. Wire requests/status/body remain actual; only public response filtering is corrected.

Evidence: original authored Native/candidate contrary captures preserved (headers-taint); final independent bare-Root8b+fix controls match Native exactly across same-origin, cross-return and cross-initial rows, including real body and clone reads.14/14 Fetch+new3 controls pass Node24.22;3/3 each24.19/26. Both Node worker/helper HTTP servers and actual response bytes are owned. No canonical ports used, no broad/full/PS/heavy tests. Full unchanged net/fetch.html not claimed positive; separate branding/worker Blob/type defects remain.

Inherited gaps: public Fetch transport buffers response bytes before exposing the response. CORS redirects requiring fresh preflight/opaque-origin revalidation remain explicitly unsupported. No navigation/worker Fetch refactor is included.
