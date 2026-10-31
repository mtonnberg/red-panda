# Red Panda

An experimental headless browser implementing a useful subset of
[Lightpanda Browser](https://github.com/lightpanda-io/browser)'s observable CLI
and Chrome DevTools Protocol (CDP) behavior. Puppeteer automation, the example,
and integration assertions are written in PureScript.

The independent runtime uses Node's V8 and **jsdom** for HTML, DOM and page
scripts, plus owned C++ bindings for HTMLDDA, Storage interceptors, runtime entry
and public V8 heap queries. IndexedDB uses the pinned independent
`fake-indexeddb` transactional backend.
It does not import Lightpanda's production engine or launch Chromium.
Full independent replication is the goal; the [compatibility ledger](docs/COMPATIBILITY.md)
records substantial remaining gaps. No engine or performance parity is claimed.

**Use trusted pages only.** jsdom's script execution is not a security sandbox.
Page scripts can potentially access the Node process and host machine. CDP also
permits arbitrary evaluation; keep it bound to loopback and use an isolated,
disposable environment without sensitive data. Cross-origin browser WebSocket
connections are rejected, but that does not provide process isolation.

## Run

Requires Linux, Node.js 24.19+, Git, `g++` with C++20 support and matching Node
headers. PNG/PDF rendering also requires Python 3.12 and installed DejaVu fonts.
No API keys, database, native browser, or rendering service is required.

```sh
npm ci
npm run build:native
npm run prepare:reference
python3 -m venv .cache/render
.cache/render/bin/python -m pip install -r native/render-test-requirements.txt
export PATH="$PWD/.cache/render/bin:$PATH"
npm run build:automation
npm test
```

Build the collection, runtime and heap-query bindings with the same Node executable used
to run Red Panda. Rebuild after changing Node/V8 or the native source; startup verifies the
runtime versions and source/binary digests. See [native build instructions](native/README.md)
for header discovery and overrides.
The reference preparation command verifies the pinned upstream archive, all574
HTML fixtures and the assertion harness in an ignored test-only cache. It
preserves the upstream licenses and does not import its engine into Red Panda.

Python dependencies are pinned with official wheel SHA-256 hashes for CPython
3.12 on Linux x86_64. Production rendering only needs
`native/render-requirements.txt`; the test requirements also install a PDF
inspector. The renderer uses fixed system DejaVu Sans/Mono regular, bold and
oblique fonts. See [rendering contracts and limits](docs/reference/render-contract.md).

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

When using a managed HTTP proxy, preserve its configuration and include
`0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]` in both
`NO_PROXY` and `no_proxy` for the owned local test servers. Cross-origin,
cross-site and insecure-context fixtures use the additional loopback addresses.

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
| Fetch | Streaming EventSource with reconnect, IDs, cookies and CORS; HTTP(S)/data/Blob URLs, redirects, cookies, CORS/preflight, filtered headers, Request/Response bodies, cloning and aborts, a 16 MiB response limit |
| HTML / JS | Actual WebAssembly streaming compilation from genuine Response bytes; incremental HTML parsing, parser-blocking/dynamic classic scripts, ordered document writes and parser-script open guards, async ordering/preloads, ES modules/import maps/cycles/top-level await, DOM mutation/events, timers, relative `fetch`, JSON responses |
| Forms / workers | Live named controls, range/date stepping and radio/label state, trusted FormData/reset events, validated GET/POST forms and dialog forms, dedicated workers with transferable MessagePorts, Blob/File clones, Blob scripts, imports, timers, fetch, real XHR/WebSocket/EventSource and FileReaderSync, shared Worker actors and real ports; Browser-wide WebSocket admission (default 8, `--ws-max-concurrent 0..255`) |
| Web APIs | Real HTMLDDA collections, CSS.escape/supports namespaces, Selection and Range geometry, actual Web Crypto keys/bytes, Cookie Store, Web Locks, Scheduler, form-associated custom elements, selector validation, dialog/popover state, innerText/checkVisibility, XML/XPath adapters, geometry, scoped CSS, live computed styles/media queries, SVG path geometry, bounds, text metrics, lists and transforms, streams/codecs/compression, Blob byte reads, resize/performance observers and trusted error reporting |
| Canvas | Genuine context/Path2D state, measured transparent pixel reads and independently encoded PNG output; the target profile has no Canvas rasterizer |
| Storage | UTF-8 value-byte quota, context/origin backing state and genuine shared frame wrappers; key order and legacy reflection remain incomplete |
| Media values | Genuine ImageData, AudioData and VideoFrame bytes/planes/clones, encoded chunks and VideoColorSpace; codec task/error behavior without fabricated processing output |
| Offline audio | Real AudioBuffer channel data and scheduled buffer-source rendering, resampling, loops, gain/oscillator/compressor nodes, WAV decoding and completion events, including measured curve quantum and cached parameter state; wider audio nodes remain incomplete |
| Readiness | `load`, `domcontentloaded`, CSS selector, truthy JS expression, and `done` as a 500 ms network-idle approximation |
| Dumps | HTML, Markdown/author alternates, semantic JSON/text, structured metadata, PNG/PDF text rendering, selector/node scoping, UTF-8 truncation, strip groups and optional absolute base |
| Frames / shadow DOM | Real child VM contexts and CDP lifecycle/ownership/navigation; declarative/clonable roots, HTML serialization, manual slots and delegated focus |
| Experimental storage | `--experimental-features serviceworker` enables secure-context Cache and threaded service-worker lifecycle; in-memory context storage |
| CLI | Batch `fetch`, `serve`, `mcp`, saved-script `run`, `version`, per-page JSON errors, preloads, JSON/Netscape cookie import/export |
| CDP targets | Discovery, isolated cookie contexts, pages, flattened sessions, attach/detach/disposal |
| CDP page/runtime | Document/fragment/history navigation, reload, frame tree, actual isolated VM worlds over shared DOM implementations, evaluation/functions/promises, persisted scripts, lexical names, heap measurements, handles/properties and preloads; by-reference serialization preserves thrown primitives/Symbols without calling authored getters |
| CDP DOM/input | Tree/search/editing/mutation events, trusted keyboard/text/mouse input, nested frame/shadow keyboard focus, Enter form activation, Tab traversal, surrogate quads/boxes/hit testing and viewport dimensions |
| CDP network/storage | Request/response events, response bodies, cookies, per-page extra HTTP headers, user agent, language/platform overrides |
| Rendering | Text-only CLI dumps, CDP screenshots/PDF streams and MCP screenshots, with real font rasterization and selectable PDF text |
| Extension | `LP.dump` returns `{format, content}`; PNG/PDF content is base64 |
| WebDriver | Classic HTTP sessions and a BiDi subset for contexts, navigation, script values/handles and lifecycle subscriptions |
| MCP / saved scripts | Stdio and HTTP MCP sessions, extraction/actions/waits/cookies/downloads; saved scripts with top-level await/return and synchronous browser actions |
| PureScript / Puppeteer | Resource lifetime, page/frame navigation and evaluation, history, responses, preloads, headers, waits, keyboard/text input, coordinate clicks, cookies, screenshots, PDFs and `content` |

Unsupported commands return a CDP error with code `-32601`. HTTP discovery
provides `/json/version`, `/json`, `/json/list`, and `/health`. Puppeteer should
connect with `defaultViewport: null` (already configured by the PureScript FFI).

Geometry uses a [measured surrogate](docs/reference/geometry-FINDINGS.md), including
flow/flex width calculations, word wrapping, boxes, hit testing and actual scroll state. It is not a CSS renderer. Intersection
observation uses those boxes; visibility tracking, nested scrolling and delay
semantics remain incomplete. PNG/PDF use a separate text flow renderer; general
CSS painting, shared workers, complete frame behavior and process
isolation remain absent. Experimental service workers execute in real threads
with registration/lifecycle, Cache and CookieStore operations; clients, control
takeover, fetch interception, updates and persistence remain incomplete. Large HTML sources now feed the real parser in bounded
tasks, allowing actual mutation delivery during loading. Classic scripts now drain actual queued microtasks before clearing currentScript,
and loading/inactive-frame writes have bounded native controls. Frame POST
navigation, advanced shadow CSS, flattened shadow/frame pointer/Tab input and full
CSS behavior remain unfinished. Utility worlds have independent globals,
constructors and DOM wrapper expandos, with actual observer/geometry/font
producers for the supported workflow. Their CSS/XML/SVG/messaging decorators
remain incomplete. Removed frames retain actual VM/DOM objects and existing
contexts until owning-page teardown; their active browsing authority is retired.
Some configuration commands still
only acknowledge requests. Markdown and structured metadata are subsets, not byte-identical
Lightpanda output. `done` does not track every future timer. Documents are decoded
as UTF-8. CDP storage/cookies are in memory; CLI cookies can be saved explicitly.

`navigator.sendBeacon` validates calls with resource loading disabled. Enable
actual POST delivery with `--load-resources beacon`; enabled beacons share a
64 KiB in-flight body budget per document. Streams use real Node primitives with
realm adapters. Post-load document.open/write keeps the Window, Document and
JavaScript realm while feeding a fresh parser and removing authored listeners.
Initial loading/frame resets and synchronous written external scripts remain
incomplete. Performance entries report observed transport/lifecycle data;
unavailable DNS/TLS/header-phase/wire-byte fields remain zero or empty.

`Runtime.queryObjects` uses the public V8 heap profiler and returns real public
objects in an Array from the selected VM realm. It verifies actual realm and
wrapper provenance and fails explicitly on resource limits. Collection is
blocking; its deadline is cooperative. Exact heap counts and full wrapper
coverage still differ from Lightpanda. Earlier inspector-based attempts and
their crashes remain in the [historical evidence](docs/reference/runtime-query-contract.md);
the [current backend](proposals/runtime-heap-worlds/README.md) uses a separate
owned native binding. No speed or memory parity is claimed.

Protocol by-value serialization uses the real V8 inspector over original values
in their selected realm. It enumerates own properties and getters, ignores
inherited `toJSON`, and reports actual serialization errors. A real VM deadline
bounds JavaScript getters; interrupted invocation frames recover before later
requests. Main, frame and utility globals retain their actual engine prototype
layer. Console namespaces use genuine realm methods and measured event types.

Media value objects retain actual bytes and receiving-realm identities. Codec
processors reproduce the measured unsupported configuration/task behavior and
produce no encoded or decoded media. Offline audio renders real buffer samples;
AudioContext, wider DSP nodes and suspension remain unfinished. Canvas contexts,
AudioData and VideoFrame remain separate implementation work.

ES modules use Node's experimental VM-module API in the actual page realm. The
Linux CLI enables it by replacing its own process, preserving its PID. Embedding
the library requires `node --experimental-vm-modules`; unsupported hosts report
module execution errors. Early inline import maps support scoped/exact/prefix
resolution. Late/external maps, JSON modules and complete mixed classic/module
ordering remain unfinished. Saved-script limits are documented in the
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
redirects remove authorization. Custom referrer policies remain unfinished.
Header overrides reach XMLHttpRequest too, including cookies, redirects and
CDP events. Synchronous Window/frame XHR uses a real Browser-owned transport
thread with cancellation across VM interruption. XHR enforces basic CORS/preflight
rules and rejects redirects needing another preflight and opaque-origin redirect
taint. Synchronous Blob URLs and utility-world XHR remain unsupported.
Page `fetch` also enforces CORS and filters response headers; opaque
responses hide status, headers and bodies. Progress is buffered; preflight
caching, the browser HTTP cache and streaming uploads remain unsupported.
Blob URLs resolve through the document/context registry. Invalid compression can fail before response headers become
available. These bounds apply to the implemented subset, not full network parity.

Dedicated workers use actual isolated threads and are terminated when their
document is disposed. Blob worker URLs and transferred MessagePorts are supported;
SharedWorker uses real shared VM actors and entangled ports within a root Page;
its state survives creator-frame removal. Incoming transferred values are allocated
in the receiving VM. SharedWorker and MessageChannel/Port are still absent in
isolated utility worlds; nested workers remain unsupported. Blob/File message
cloning and creator-owned dedicated-worker Blob URLs are supported.
Worker-owned SSE and WebSocket connections retain the measured transport lifetime
after worker closure and close when their owning Page closes.
Keyboard Tab traversal currently covers
the light DOM; it does not traverse frame or shadow trees. CLI fetch/serve enable
no optional resources by default; MCP defaults to stylesheet loading. Repeated
`--load-resources stylesheet|iframe|worker|beacon` enables the implemented subsets;
`none` clears them. Direct Browser embedding enables stylesheets, iframes and
workers unless `loadResources` is supplied; beacons require explicit enablement.
Frame realms are real, and CDP
routes evaluation, navigation, handles and selected Runtime methods to them;
cross-origin Window access restrictions and full frame history/input remain
unfinished.

CLI `fetch` uses the captured native option defaults: no dump and a5,000ms wait.
Use bare `--dump` for HTML or select another format explicitly. Wait expressions
can come from `--wait-script-file`; script/file flags take their last CLI-order
value. Without explicit `--wait-until`, a wait predicate can finish before pending
frame loads. Repeated `--http-header "Name: Value"` settings override page headers
on every redirect hop; use `--user-agent` for User-Agent. Plain text dumps write
their exact payload, including existing trailing newlines; JSON envelopes append
one framing newline. Pending-navigation timeout/exit behavior and native process
shutdown remain separate compatibility gaps. `--dump-selector`,
`--dump-max-bytes`, repeated `--strip-mode` and `--with-base` affect dumps while
leaving the live DOM intact. The [dump contract](docs/reference/dump-contract.md)
records 47 exact native fixture outputs and remaining formatting limits.

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

`automation/test/Test/Main.purs` runs 93 assertions against a real Puppeteer
connection and a deterministic local HTTP fixture. `npm run test:protocol` covers
the browser, CLI transports, cookie files, CDP, DOM/input, modules, navigation,
MCP, saved scripts and WebDriver, including errors and timeouts.
The tests start and stop their own services; none require external sites.

The current checkpoint passes 1,669 JavaScript tests, 93 PureScript Puppeteer
checks and 13 native differential groups, plus syntax and strict/pedantic
PureScript checks. [Validation](docs/reference/phase21-integration/validation.json)
records all 10,355 unchanged guarded inputs and the three earlier full-run
failures. The corrected input, beacon and XHR checks also pass on all three
prepared Node versions. An earlier isolated composition passes 48/48 paired
native/candidate fixtures with the original load and assertion budgets; that
report identifies its exact graph separately from the final corrections.

This checkpoint adds namespace/attribute and Event behavior, form state and
reflections, original VM Input/ValidityState definitions, actual document editing,
guarded inert focus/selection and real stylesheet source parsing. The separate
full-fetch fixture still fails its literal client-hint branding check. Historical
failures remain recorded, and full browser equivalence remains incomplete.

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
