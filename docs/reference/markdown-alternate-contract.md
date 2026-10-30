# Author-provided Markdown alternates

`src/markdown-alternate.js` exports:

```js
await alternateMarkdown(page, {
  deadline, // absolute Date.now() timestamp established before navigation
  signal, // optional caller AbortSignal
  onDiagnostic, // optional callback, no stream output by default
  ...dumpOptions,
})
```

The result contains `content`, `url`, `sourceURL` (same as url), `navigationURL`,
`httpStatus`, `headers: [{name,value}]`, and `usedAlternate`. A selected link adds
`attemptedURL`; a fallback adds an internal `fallbackReason`. These extra fields
are for embedding and are not additional native CLI JSON fields. The caller maps
`httpStatus` to its `http_status` and keeps any existing navigation error.

Establish the shared deadline before navigation, then pass it to this helper.
The optional default gives the alternate a fresh `page.timeout` budget and is
useful for embedding, but the CLI must pass its original navigation deadline to
match the native remaining-budget behavior. The helper neither navigates nor
replaces the live page and does not change its URL/status/header properties.

Native observations were collected with the verified executable
`/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux`, version
`1.1.0-nightly.11326+948d77378`, SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
The six `markdown-alternate-*-observations.json` files record owned loopback HTTP
responses and requests. They include 28 bounded native executions, including an
invalid selector conflict and an expected HTTP-error exit. No upstream production
implementation was copied. Captured custom headers and cookies are synthetic
fixture values; no provider requests or environment secrets were used.

Observed behavior implemented:

- The first `<link href>` with an alternate rel token and a case-insensitive
  exact `type="text/markdown"` is selected. Other rel tokens are allowed. A type
  attribute containing parameters, or `text/plain`, is not selected. Only the
  first qualifying link is attempted, even if its response is unsuitable.
- The URL resolves against the document's effective base URI. Fetch uses the
  page transport, cookies and configured HTTP headers. Native alternate requests
  carry the navigation Accept value and no default Referer; the helper supplies
  the same defaults while retaining configured header overrides.
- A nonempty successful 2xx response with media type `text/markdown` or
  `text/plain` is used. MIME parameters are accepted on the response. Status201
  and206 succeed; alternate300,404 and empty204 fall back. Empty200 falls back;
  whitespace-only200 is preserved as authored content.
- A successful alternate supplies the final redirect URL, status and response
  headers in CLI JSON, replacing the original response metadata. It supplies raw
  authored Markdown, with the UTF-8 soft cap applied. Strip groups do not rewrite
  authored Markdown.
- Missing links, rejected MIME/status, network failures, empty bodies and an
  exhausted remaining deadline fall back to conversion of the current DOM.
  Original navigation metadata is retained. A fallback is not a new native
  fetch error. DOM conversion occurs after waiting, so intervening page changes
  are included.
- An original navigation status400 or above skips the alternate entirely. An
  original300 response may still use an alternate. A failed original404 cannot
  be masked by an alternate200, and native `--fail-on-http-error` retains exit22.
- Native `--markdown-alternate` conflicts with `--dump-selector` before any
  navigation request. The helper rejects the combination before its own fetch;
  CLI callers must perform the same validation before navigating. A non-Markdown
  format is rejected by the helper.
- Deadline fallback can emit a diagnostic callback with reason
  `wait budget used up`. Other fallback reasons remain explicit in the result.

`node --test test/markdown-alternate.test.js` passes 10 tests. Twelve captured
native cases are compared against actual browser requests for content, selected
URL/status, and header provenance. Additional tests cover cookies/defaults,
remaining navigation budget, delayed DOM mutation, errors, empty/whitespace
responses, caps, conflict rejection and original-status gating.

Bounds: dynamic Date/transport-header order, native page-status counters, all
redirect/status/MIME variations, non-UTF-8 character encoding, cross-origin
transport policies and concurrent navigation changes are not established as
equivalent. Network/resource limitations of the shared Page transport still
apply. The helper does not make a full native-browser compatibility claim.
