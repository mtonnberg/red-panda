# HTTP header precedence proposal

`headers.patch` moves CDP extra-header application after ordinary request/default/jar selection on every actual HTTP hop, with CLI headers still last. It changes only `src/browser.js`, adds seven actual-network tests and corrects the authored-header setup of one existing test. Production sources were not edited. The patch applies cleanly to current Root as checked during handoff.

`base.json` and `frozen.json` bind physical source snapshots, both native helpers and reference/test inputs. Final snapshot: `/tmp/red-panda-http-headers-final-_sg53mo6`. Shared dependency source digests also matched after validation.

## Observed target contract

Owned ephemeral HTTP servers and raw CDP capture the verified native binary, with source/probe hashes in each report. `native-policy.json` covers cross-site IP requests; `native-same-site-policy.json` covers different ports on the same host.

- Configured CDP Cookie overrides a populated real jar, including HttpOnly cookies, even for credentials omission. An explicitly empty Cookie is a physically present empty header.
- CDP Accept-Language and User-Agent override UA defaults. Navigator configuration stays separate from these HTTP-only overrides.
- Privileged Cookie/Authorization and other configured extras apply again on same-origin and cross-origin redirects, and appear on actual CORS OPTIONS requests. They do not become authored preflight-header names.
- Ordinary authored Authorization is stripped across origins. Credential policy continues to control jar defaults and response Set-Cookie imports, even when a privileged Cookie header was explicitly configured.
- CLI header precedence remains the existing final override. WebSocket header policy is untouched; the existing real-socket regression tests continue to pass.

The implementation applies the current CDP header collection inside each hop after cookie selection, preserving the existing redirect stripping for ordinary headers and existing credential/origin checks. It does not turn the configured Cookie into stored jar cookies or relax response cookie imports.

## Validation and limits

132/132 Browser/CDP/Fetch/XHR/frame/worker/CLI/beacon checks pass on Node 24.22.1 and 26.13.0. Seven new tests exercise actual HTTP, OPTIONS, async XHR, iframe fetch and a genuine Worker thread. The first frozen run had 131/132: an old test configured CDP Authorization while expecting authored stripping. Its final setup now supplies authored request Authorization; the original stripping assertion remains, with privileged persistence tested separately. That original run is retained in `preliminary.json` and its log.

`comparison.json` checks 52 actual same-site actions over physical request method/body/origin/path, Cookie/User-Agent/Accept-Language/Authorization/X-Policy/preflight-name fields and public completion/status/document.cookie. Baseline matches 17; final immutable source matches 51. Other HTTP serialization details are outside that bounded comparison.

The remaining action is the preexisting public Fetch rejection of a cross-origin redirect after authored Authorization was stripped, through the existing fresh-preflight restriction. The transport itself still strips the authored header. No success is fabricated for that unsupported public path.

A separate preexisting cookie-site gap is preserved: the native target omits a stored cross-site IP cookie for Fetch/include, while candidate’s current jar policy sends it. `native-cross-site-cookie-store.json` confirms the native cookie is stored and sent on top-level navigation. Precise SameSite/third-party policy needs separate calibration; this precedence patch leaves ordinary jar policy unchanged.

The main-sync XHR owner independently aligned its isolated transport with these measurements. This patch does not contain that separately owned integration. No target engine production code or JavaScript Puppeteer workflow was used.
