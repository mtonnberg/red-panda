# Red Panda

An experimental headless browser implementing a useful subset of
[Lightpanda Browser](https://github.com/lightpanda-io/browser)'s observable CLI
and Chrome DevTools Protocol (CDP) behavior. Puppeteer automation, the example,
and integration assertions are written in PureScript.

The independent runtime uses Node's V8 and **jsdom** for HTML, DOM and page
scripts. It does not import Lightpanda's production engine or launch Chromium.
Full independent replication is the goal; the [compatibility ledger](docs/COMPATIBILITY.md)
records substantial remaining gaps. No engine or performance parity is claimed.

**Use trusted pages only.** jsdom's script execution is not a security sandbox.
Page scripts can potentially access the Node process and host machine. CDP also
permits arbitrary evaluation; keep it bound to loopback and use an isolated,
disposable environment without sensitive data. Cross-origin browser WebSocket
connections are rejected, but that does not provide process isolation.

## Run

Requires Node.js 24.19+ and Git. No API keys, database, native browser, or rendering
service is required.

```sh
npm ci
npm run build:automation
npm test
```

The PureScript compiler and Spago are pinned in `package-lock.json`. Dependencies
use Spago's supported custom package-set format with exact upstream GitHub
commits. `automation/package-set-provenance.json` records the versions from
registry package set 81.11.0. This avoids requiring the separate registry tarball
host in restricted environments. `spago.lock` is checked in; the npm wrappers use
Spago's `--pure` mode to preserve it. After intentionally editing Spago dependency
configuration, regenerate the lock with `spago build` in `automation/`.

If the default npm cache is unwritable in your cloud environment, set
`NPM_CONFIG_CACHE=/workspace/shared/npm-cache`. The automation wrapper defaults
XDG cache/config/data locations to the ignored `.cache/` directory.

Fetch a trusted document:

```sh
node bin/red-panda.js fetch --dump html 'data:text/html,<h1>Hello</h1><script>document.querySelector("h1").textContent="Executed"</script>'
node bin/red-panda.js fetch --dump markdown --wait-until done --json https://your-permitted-site.example/
```

Batch fetches require `--json`. Results stay in input order and each URL receives
an independent page and cookie jar. A failed URL does not prevent later URLs from
running. A single URL produces one JSON object; multiple URLs produce
`{"results": [...]}`. Navigation/wait failures exit 1, which takes precedence over
the HTTP-error exit 22. Failed pages retain an `error` field and any available
document. Batches currently run sequentially.

Preload scripts run before the document's scripts. Inline and file options can
be repeated and mixed; their command-line order is preserved:

```sh
node bin/red-panda.js fetch --json \
  --inject-script 'globalThis.mode = "automation"' \
  --inject-script-file ./trusted-preload.js \
  https://your-permitted-site.example/first https://your-permitted-site.example/second
```

`--cookie /path/to/input.json` loads cookies from a CDP/Puppeteer JSON array or a
Netscape cookie file into each page. `--cookie-jar /path/to/output.json` saves the
collected cookies, including HttpOnly attributes, for another run. Cookie files
can contain credentials; keep them outside the checkout. Output jars are written
atomically with owner-only permissions. For duplicate domain/path/name entries
across pages, the last result wins. Cookie matching remains a subset of browser
behavior; full browser SameSite/partitioned-cookie policies are not implemented.

Start CDP, then run the PureScript example in another terminal:

```sh
npm start
npm run example:puppeteer
```

The example defaults to a self-contained data URL. Set `RED_PANDA_URL` for a
trusted permitted site, or `RED_PANDA_CDP` for another CDP server. `serve` defaults
to host `127.0.0.1`, port `9222`. It supports ephemeral ports via `--port 0`.
Live processes must be restarted after restoring a cloud environment snapshot.

## Implemented behavior

| Surface | Supported |
| --- | --- |
| Fetch | HTTP(S), data URLs, redirects, response status/headers, per-context cookies, plain-text/API documents, a 16 MiB response limit |
| HTML / JS | HTML parsing, classic scripts, ES modules with imports/cycles/top-level await, DOM mutation/events, timers, relative `fetch`, JSON responses |
| Readiness | `load`, `domcontentloaded`, CSS selector, truthy JS expression, and `done` as a 500 ms network-idle approximation |
| Dumps | Serialized HTML, text, basic Markdown with absolute links, link inventory, selected structured metadata |
| CLI | Batch `fetch`, `serve`, `mcp`, saved-script `run`, `version`, per-page JSON errors, preloads, JSON/Netscape cookie import/export |
| CDP targets | Discovery, isolated cookie contexts, pages, flattened sessions, attach/detach/disposal |
| CDP page/runtime | Document/fragment/history navigation, reload, frame tree, evaluation/functions/promises, persisted scripts, lexical names, heap measurements, handles/properties and preloads |
| CDP DOM/input | Tree/search/editing/mutation events, node handles, trusted keyboard/text/mouse input, surrogate quads/boxes/hit testing and viewport dimensions |
| CDP network/storage | Request/response events, response bodies, cookies, per-page extra HTTP headers, user agent, language/platform overrides |
| Extension | `LP.dump` returns `{format, content}` |
| WebDriver | Classic HTTP sessions and a BiDi subset for contexts, navigation, script values/handles and lifecycle subscriptions |
| MCP / saved scripts | Stdio and HTTP MCP sessions, extraction/actions/waits/cookies/downloads; saved scripts with top-level await/return and synchronous browser actions |
| PureScript / Puppeteer | Resource lifetime, `goto`, history, response status/body, preloads, headers, evaluation, waits, keyboard/text input, coordinate clicks, cookies and `content` |

Unsupported commands return a CDP error with code `-32601`. HTTP discovery
provides `/json/version`, `/json`, `/json/list`, and `/health`. Puppeteer should
connect with `defaultViewport: null` (already configured by the PureScript FFI).

Geometry uses a [measured surrogate](docs/reference/geometry-FINDINGS.md), including
simple boxes, hit testing and scrolling. It is not a CSS renderer. Intersection
observation uses those boxes; visibility tracking, nested scrolling and delay
semantics remain incomplete. Screenshots, PDF, canvas, service workers, full
iframe support, browser-grade CORS and process isolation remain absent.
Utility-world IDs share the page's JS realm. Some configuration commands still
only acknowledge requests. Markdown and structured metadata are subsets, not byte-identical
Lightpanda output. `done` does not track every future timer. Documents are decoded
as UTF-8. CDP storage/cookies are in memory; CLI cookies can be saved explicitly.
No speed or memory parity is claimed.

ES modules use Node's experimental VM-module API in the actual page realm. The
Linux CLI enables it by replacing its own process, preserving its PID. Embedding
the library requires `node --experimental-vm-modules`; unsupported hosts report
module execution errors. Import maps, JSON modules and complete mixed classic/
module ordering remain unfinished. Saved-script limits are documented in the
[script contract](docs/reference/script-contract.md).

```sh
node bin/red-panda.js serve --protocol cdp --protocol webdriver
node bin/red-panda.js mcp                 # JSON-lines stdio
node bin/red-panda.js mcp --port 8080     # HTTP /mcp
node bin/red-panda.js run script.js
```

Request configuration covers navigation, classic external resources, and
`window.fetch`. Extra CDP headers override conflicting page-supplied headers;
passing an empty header list clears them. Configuration is per page and survives
navigation. Automatic referrers use the full URL for the same origin, only the
origin across origins, and are omitted on HTTPS-to-HTTP downgrades. Cross-origin
redirects remove authorization. Custom referrer policies and applying these
header overrides to XMLHttpRequest are not yet supported.

## PureScript automation

See `automation/src/RedPanda/Puppeteer.purs` for the typed `Aff` API and
`automation/src/Main.purs` for the example. A small JS FFI adapts
`puppeteer-core` promises; acquisition cancellation closes eventual resources.
PureScript `bracket` owns the browser/context lifetimes. `evaluateOnNewDocument`
returns a typed `PreloadScript` that `removePreload` can unregister.
`gotoResponse`, `responseStatus` and `responseText` expose the original HTTP
response independently of the executed DOM.

Configure Puppeteer requests from PureScript:

```purescript
Browser.setExtraHTTPHeaders page [ { name: "X-Client", value: "automation" } ]
Browser.setUserAgent page "RedPandaAutomation/1"
```

`automation/test/Test/Main.purs` runs 44 assertions against a real Puppeteer
connection and a deterministic local HTTP fixture. `npm run test:protocol` covers
the browser, CLI transports, cookie files, CDP, DOM/input, modules, navigation,
MCP, saved scripts and WebDriver, including errors and timeouts.
The tests start and stop their own services; none require external sites.

## REA investigation and comparison

REA 6.8.0 captured behavior from the official Lightpanda
`1.1.0-nightly.11326+948d77378` binary. Its SHA-256 was checked against the
official GitHub release asset's published digest. Twenty complete Evidence
records, an index, fixtures and observed limitations are in
[`docs/reference/FINDINGS.md`](docs/reference/FINDINGS.md).

Thirteen differential checks compare this implementation with that binary on the
same local fixture: async scripts, selectors, Markdown, error exits, ordered
batches, preloads, cookie isolation/export/import, plain-text documents, and
CDP navigation/evaluation/clicks/cookies/dump structure, request configuration,
history traversal and navigation events. Separate saved-script probes compare
25 successful fixture outputs; these do not cover unsupported operations.

```sh
npm run test:reference -- /path/to/verified/lightpanda
```

This optional command runs the supplied executable. Obtain and verify it from
the official project first. The reference binary is not bundled with this repo.
These bounded observations establish the tested behaviors, not full engine or
protocol equivalence.
