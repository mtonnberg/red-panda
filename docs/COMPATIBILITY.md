# Lightpanda compatibility ledger

Full independent replication is the goal. The current implementation is not
complete. Upstream production engine code is not imported; the upstream binary,
source documentation, and external test fixtures are references and test oracles.

## Target and evidence boundaries

- Binary: official Linux x86_64 Lightpanda
  `1.1.0-nightly.11326+948d77378`.
- Binary SHA-256:
  `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
- Corresponding source commit:
  [`948d773786380bae36f046639fc61e2ddddd212a`](https://github.com/lightpanda-io/browser/tree/948d773786380bae36f046639fc61e2ddddd212a).
- Source archive SHA-256:
  `b4e3f3c1471fefcddc4be0783b5d36711b51028ab8386fc25d5cf7a1ac584643`.
  The inspected external tree is
  `/tmp/red-panda-upstream-reference/browser-948d77378`. Its original LICENSE and
  LICENSING.md remain with it (AGPL-3.0-only default).
- Declared CDP surface: [retained protocol](reference/cdp-protocol.json),
  **164 commands and 148 event names across 21 domains**. Declaration does not
  prove that the native browser implements every command/event or every option.
- Historical implementation inventory below uses committed Red Panda `6a142a0`.
  Subsequent navigation, DOM/input and WebDriver work must be validated and then
  reflected in this ledger; the historical counts are not a current pass rate.
- Runtime evidence and limitations: [reference findings](reference/FINDINGS.md)
  and [evidence index](reference/evidence-index.json). Selected local probes do
  not establish compatibility for unrelated APIs, sites, or feature flags.

Status meanings: **bounded pass** means the specified scenario executed against
both targets; **partial** means a code path exists with incomplete contracts or
coverage; **acknowledged** means configuration may return success without the
advertised behavior; **missing** means the historical dispatch lacks the method;
**unverified** means neither source presence nor an advertisement establishes the
desired runtime behavior. Preserve failed, timeout, unobserved and unrun results
as separate outcomes. None is a pass.

## Completion gates

Completion requires an explicit, versioned inventory of supported native behavior
and reproducible outcomes for it, not a growing subset of smoke tests. At least:

1. Match command syntax, defaults, output/error schemas and exit statuses for
   fetch/serve/run/agent/mcp/completion/help/version, including negative cases.
2. Cover advertised CDP methods with valid scenarios, options, invalid arguments,
   lifetimes and emitted events. Reproduce native unsupported behavior rather
   than assuming its protocol advertisement is proof of implementation.
3. Cover WebDriver HTTP/BiDi, MCP transports and tools, and deterministic script
   replay. Keep live LLM/provider checks separate from local deterministic checks.
4. Run the upstream browser fixture assertions and relevant WPT groups on both
   targets with the same harness branches, routes and resource flags. Retain
   native failures and intentional native divergences as baseline data.
5. Exercise frame/worker realms, navigation teardown, cookies/storage, CORS,
   origin boundaries, cancellation, runaways and unsupported APIs. jsdom/Node
   availability alone does not establish equivalent browser semantics.
6. Measure startup, memory, throughput and resource limits on the same fixtures
   and hardware. Current Node/jsdom architecture has no demonstrated parity with
   the native engine's allocation, threading or performance behavior.

## CLI and server surface

| Native surface | Historical Red Panda status and concrete gaps |
| --- | --- |
| `fetch` | Partial/bounded passes for HTML/Markdown, load/done/selector waits, JSON batches, error exits, preloads and cookie files. Native default is no dump and 5,000 ms; Red Panda defaults to HTML and 10,000 ms. Red Panda batches run sequentially. Native JSON diagnostic fields such as `page_status` and `bot_challenge` are missing. |
| `serve` | Partial CDP on TCP. No advertised-host override, Unix sockets, connection/backlog limits, configurable origin allowlist, native `/json/protocol` or `/metrics` endpoints. Serve accepts some globally parsed cookie flags without implementing native daemon load/save semantics. |
| `run` | Missing saved PandaScript execution and its browser interaction/extraction API. |
| `agent` | Missing REPL, task mode, recording/save, attachments, provider configuration and tool loop. Local `--no-llm` and deterministic replay can be tested without credentials; live providers require separate access. |
| `mcp` | Missing stdio and session-scoped HTTP JSON-RPC, initialization/tool schemas, sessions and optional co-hosted CDP. |
| `completion` | Missing bash/fish/zsh completion generation. |
| `help`, `version` | Red Panda has `--help` and its own version; native command/subcommand help contracts are not replicated. |
| Automation protocols | Native serve supports CDP and WebDriver/BiDi on the same listener. Historical Red Panda has CDP only; newer transport work requires its own conformance results. |

Native fetch options still lacking equivalent behavior include `--dump-max-bytes`,
`--dump-selector`, `--markdown-alternate`, `--metrics`, `--strip-mode`,
`--terminate-ms`, `--wait-script-file`, `--with-base`, and `--with-frames`.
Native dump modes also include `png`, `pdf`, `semantic_tree` and
`semantic_tree_text`; they are not equivalent to the prototype's extra `text`
and `links` modes. `structured_data` exists on both but its full native schema,
invalid inputs, redirects and document-source coverage are not yet compared.

Native server options requiring coverage include `--advertise-host`,
`--cdp-max-connections`, `--cdp-max-http-message-size`, `--cdp-max-message-size`,
`--cdp-max-pending-connections`, `--disable-metrics`, `--http-session-timeout`,
`--protocol`, `--remote-allow-origins`, and `--unix-socket`.

Native agent-specific options include `--attach` (`-a`), `--base-url`,
`--effort`, `--list-models`, `--model`, `--no-llm`, `--provider`, `--save`,
`--search-engine`, `--system-prompt`, `--task`, `--trace`, `--trace-results`,
`--url` and `--verbosity`, plus the optional saved-script argument. Native MCP
adds `--cdp-port`, `--host`, `--http-session-timeout` and `--port` in addition
to its cookie/common options. `run` takes a file or stdin; `completion` takes
one of bash, fish or zsh.

Native common option families still needing implementation/conformance:

- Filtering/policy: `--adblock-lists`, `--block-cidrs`, `--block-urls`,
  `--block-private-networks`, `--obey-robots`, `--robot-store-entry-limit`.
- TLS/proxy/identity: `--ca-cert`, `--ca-path`, `--http-curves`, `--http-proxy`,
  `--proxy-bearer-token`, `--web-bot-auth-domain`, `--web-bot-auth-key-file`,
  `--web-bot-auth-keyid`. The native insecure-host-verification option is also
  an unimplemented runtime contract; it must not be used to bypass dependency
  verification during setup.
- Transport/cache/limits: `--http-cache-dir`, `--http-cache-entry-limit`,
  `--http-connect-timeout`, `--http-debug`, `--http-header`,
  `--http-max-concurrent`, `--http-max-host-open`, `--http-max-response-size`,
  `--http-nav-burst`, `--http-nav-delay`, `--http-timeout`, `--http-version`,
  `--ws-max-concurrent`. Native response-size default is 1 GiB, compared with
  the prototype's fixed 16 MiB limit.
- Feature/lifecycle: `--cors-store-entry-limit`, `--disable-features`,
  `--experimental-features`, `--load-resources`, `--watchdog-ms`,
  `--v8-max-heap-mb`, `--v8-flags-unsafe`.
- Locale/output/diagnostics: `--locale`, `--timezone`, `--render-font`,
  `--user-agent-suffix`, `--log-filter`, `--log-format`, `--log-level`.

## Runtime and Web API gaps

| Area | What remains to prove or implement |
| --- | --- |
| Navigation/history | Same-document URL/context events, push/replace/hash, back/forward/reload, redirects from scripts and location setters, cancellation and concurrent navigations. Parent navigation work is in progress beyond this historical baseline. |
| DOM/input/accessibility | Full frontend/backend node identity and lifetime, traversal/search, form controls and submission, focus/keyboard/mouse dispatch, trusted event ordering, accessibility names/roles/tree and hidden-content rules. New DOM/input work is not a full-tree conformance result. |
| HTML/XML/encoding | Native html5ever/parser behavior versus jsdom, fragment contexts, document.write, XML/XHTML errors, charset/BOM handling and malformed inputs. The prototype document decoder is UTF-8 only. |
| JavaScript/realms | Classic/modules/import maps/dynamic import/top-level await, distinct frame and utility worlds, globals/descriptors and object lifetimes, compile/run/await/termination contracts. Utility-world IDs historically share one JS realm. |
| Networking | Fetch/Request/Response edge cases, streams/binary bodies, XHR, WebSocket/EventSource/beacon, CORS/preflights, credentials/referrer policies, cache, interception/auth, HTTP/TLS/proxy features and accurate request/event/body metadata. |
| Frames/workers | Nested/cross-origin/srcdoc/data/blob frames; window.open/close and opener; dedicated/shared/service workers and per-context ownership. Presence of a constructor is not execution support. |
| Storage/cookies | Domain/path/expiry/HttpOnly/Secure/SameSite/partitioning policies; local/session storage, IndexedDB, CacheStorage, blob URL lifecycle, storage isolation and cleanup. Existing cookie tests cover a bounded subset. |
| Styles/geometry/rendering | Native computed-style visibility, viewport/scroll/geometry and hit testing; text-only PNG/PDF renderer, fonts and output limits. Native is not a general graphical browser, but its text renderer is real and cannot be replaced by a success acknowledgement. |
| Events/async | Event path/retargeting, cancellation, focus and trusted input, mutation/intersection/resize/performance observers, timers/microtasks, promise rejections, teardown, scheduler and message channels. |
| Additional native Web APIs | Shadow/custom elements, sanitization, selection/ranges, XPath, URLPattern, streams/compression, WebAssembly, WebAudio/WebCodecs stubs or behavior, permissions/geolocation/notification, WebMCP and form/semantic tooling. Inspect and test each native contract before deciding whether it needs full behavior or a matching stub. |
| Isolation/resource control | Arbitrary Node/jsdom page execution is not a security sandbox. Browser-origin rules, access to host capabilities, memory/CPU/time limits and teardown need explicit tests; an upstream source filename does not prove the native property either. |

## Existing upstream conformance inputs

At the exact reference source commit, static enumeration found **2,108 top-level
Zig `test` declarations**, including 388 under `src/server/cdp` and 30 under
`src/server/bidi`; 216 declarations have `WebApi:` names. There are **574 HTML
files** under `src/browser/tests`, including support documents and untagged files.
These counts are inventories, not numbers of executed or passing tests.

Source-supported native commands, not executed as part of this inventory:

```sh
make download-v8
make test
make test F="server"
TEST_FILTER="WebApi: #selector_all" make test
TEST_JOBS=1 make test
zig build test-server
```

Native unit-test execution requires a source-built native test binary and does
not directly test the independent JS engine. The external fixture harness is
the portable observable-behavior path: `src/browser/tests/testing.js` exposes
`testing.assertOk()`, which rejects failed assertions/uncaught errors and checks
for nonzero observations, completed async blocks and observed script IDs.

The separately versioned demo source inspected was
[`lightpanda-io/demo@d6db4bf1685a177733afa61c8185c917c798ab63`](https://github.com/lightpanda-io/demo/tree/d6db4bf1685a177733afa61c8185c917c798ab63)
(Apache-2.0). It contains:

- `browser-tests/run.js`: original external Puppeteer driver. Red Panda's new
  runner uses raw CDP so production Puppeteer work can remain in PureScript.
- `runner/main.go`: deterministic local integration server/suite (`go run
  runner/main.go`, or `go run runner/main.go -serve` for fixtures only).
- `agent/run.sh deterministic`: eight saved-script goldens covering extraction,
  forms/check events, frames/workers, JS location redirects, cookies/XHR and
  dynamic scripts. `LPD_PATH` selects a native executable; Red Panda does not yet
  implement the required `run`/PandaScript interface.
- `wptrunner`: Go CDP driver for `lightpanda-io/wpt`'s `fork` branch, with a WPT
  server, host aliases, manifest and optional `-Dwpt_extensions` native build.
- `.github/workflows` in the browser repo also cover Playwright, Puppeteer,
  Selenium HTTP/BiDi, MCP stdio initialization/tools and performance runners.

No broad fixture, WPT, agent or integration suite has passed for Red Panda.
The initial three-case native and candidate selection below both passed. Reports
were retained at `/tmp/red-panda-native-conformance-3-v2.json` and
`/tmp/red-panda-candidate-conformance-3-v2.json`; both observed the required
native harness branch and `Lightpanda/1.0` test UA. Their source-harness SHA-256 is
`23e2ebbd851e64a68b1e357a38ed2e6d5d5f72217cb2e14671c4d3eecf6c861b`.

## Raw-CDP fixture runner

`scripts/conformance.mjs` serves the external fixture tree safely, sets
`__lp_external_runner=true`, and overrides the test-only user agent to
`Lightpanda/1.0` on both targets. This is necessary because upstream testing.js
changes assertion/divergence branches for other user agents. The source harness
and fixture assertions are not rewritten. The runner verifies the observed
`testing.IS_TEST_RUNNER` and external-runner flag before accepting assertions.
Passing `assertOk()` enforces its
private zero-observation and async-pending checks; exact observation counts stay
null rather than being invented. Timeout diagnostics come from the original
`testing.printTimeoutState()`.

```sh
node scripts/conformance.mjs \
  --root /tmp/red-panda-upstream-reference/browser-948d77378/src/browser/tests \
  --binary /workspace/shared/lightpanda-reference/lightpanda-x86_64-linux \
  --test node/is_equal_node.html \
  --test document_fragment/document_fragment.html \
  --test event/custom_event.html \
  --report /tmp/native-conformance-new.json
```

Use `--binary /workspace/red-panda/bin/red-panda.js` for an owned candidate
server, or `--endpoint ws://127.0.0.1:9222/` for an already-owned server. The
default fixture port is 9582, matching the native harness's hardcoded origin.
Only explicit HTML selections run; zero selections fail. Reports distinguish
`passed`, `failed`, `timeout` and `unobserved`, bind fixture/harness hashes, and
record missing routes. Existing report files are not overwritten.

For larger selections, `--tests-file` accepts a JSON array of paths or a newline
list (blank lines and `#` comments ignored). Use `--isolate --binary ...` to
start and stop a fresh owned browser for every fixture, so a runaway or crashing
renderer cannot poison later cases. Fixture deadlines cover CDP setup and the
navigation command itself, not merely polling after navigation returns. Owned
process shutdown uses the helper's bounded SIGTERM-to-SIGKILL cleanup. Cleanup
and startup time are recorded separately by `totalDurationMs` in isolated mode.

Additional serve flags are explicit and are retained in reports:

```sh
node scripts/conformance.mjs --root /path/to/src/browser/tests \
  --binary /path/to/browser --isolate --tests-file /path/to/selection.json \
  --browser-arg=--load-resources --browser-arg=iframe \
  --browser-arg=--load-resources --browser-arg=worker
```

The exact source `HtmlRunnerOpts` in `src/testing.zig` enables iframe and worker
resources by default, unlike bare `serve`; the demo CI passes those same flags.
Individual test registrations can override resources, experimental features or
preloads. The `lp-mode=test` tag alone does not encode these options. The runner
does not infer them from the tag: reports record the explicit arguments and mark
per-fixture registration overrides and custom routes as unverified/unrun
configuration dimensions. Native and candidate runs must use the same intended
profile before failures can be attributed to their engines.

Isolation was exercised with an inline infinite loop followed by a healthy
fixture. The candidate loop timed out and its owned child was reaped with
SIGKILL; the next fixture passed in a different PID. The report is
`/tmp/red-panda-isolation-selftest.json` (700 ms fixture budget, bounded startup
and cleanup, about 4.0 seconds total for the runaway). This validates runner
recovery, not a candidate in-process runaway guard; that engine capability
remains an open compatibility requirement.

The native CDP `Browser.getVersion` response deliberately contains hardcoded
Chrome 124 and V8 12.4 strings (`src/server/cdp/domains/browser.zig`); it is not
proof of the launched engine's identity/version. With `--binary`, reports also
bind the selected executable or launcher file's path and SHA-256. Imported
modules/shared libraries are not included in that file hash.

The default fixture profile remains static files only. The independent test
helper `scripts/upstream-fixture-server.mjs` exports
`startFixtureServer(root, {port, profile})`. Its explicit `xhr-subset` profile
implements selected observable endpoint contracts from the exact upstream
`src/test_routes.zig`: XHR bodies/MIME/status/reason/duplicate headers, deliberate
bad gzip, redirects, scoped cookies and header echo. It imports no engine code.
`/__fixture_metadata` lists implemented routes, provenance and unsupported route
groups; it explicitly reports `completeUpstreamServer:false`. Node HTTP automatic
headers/framing are not byte-for-byte copies of the Zig server. Raw-wire, SSE,
WebSocket, CORS-specific, compression, resource-timing and counter endpoints
remain unsupported. Unknown routes return an explicit error, not an empty
successful response. Five focused transport, safety and shutdown tests pass.

Use `--fixture-profile xhr-subset` to select that owned server explicitly.
Alternatively, `--fixture-origin http://127.0.0.1:9582` uses a caller-owned server
and never stops it. Local `--root` is still required: externally served
`testing.js` and selected HTML documents must match their local SHA-256 hashes.
Transitive resources are not hash-verified. External request visibility is
unknown, so reports retain `unavailableRoutes:null`, not a fabricated empty list.
For an owned server, intentional implemented error statuses remain known routes;
missing files and unknown endpoints are recorded separately. Neither missing
routes nor unobserved assertions are converted into passes.

The unchanged demo `runner/main.go -serve` is not a substitute for the browser
fixture server: its `/xhr/get` and `/xhr/post` routes do not provide the browser
fixtures' `/xhr` contract. The local `/usr/bin/go` executable is also a board
game, not a Go compiler; no Go toolchain was installed for this test transport.

```sh
node scripts/conformance.mjs \
  --root /tmp/red-panda-upstream-reference/browser-948d77378/src/browser/tests \
  --binary /workspace/shared/lightpanda-reference/lightpanda-x86_64-linux \
  --test worker/worker.html --isolate --fixture-profile xhr-subset \
  --browser-arg=--load-resources --browser-arg=iframe \
  --browser-arg=--load-resources --browser-arg=worker --timeout 10000 \
  --report /tmp/native-worker-new.json
```

With the correct `/xhr` route, the unchanged `worker/worker.html` passes the
verified native binary (177 ms). The candidate snapshot fails (347 ms) with
`MessageChannel is not defined`; additional captured exceptions identify missing
`URL.createObjectURL`. Both execute the native harness branch with identical
resource flags. This is a real candidate gap rather than the earlier static
server's missing-route failure. Reports are
`/tmp/red-panda-native-worker-xhr-profile-v1.json` and
`/tmp/red-panda-candidate-worker-xhr-profile-v1.json`. A separate native run using
`--fixture-origin` also passes and verifies that the caller-owned fixture server
remains running after the runner exits; its request visibility stays unknown in
`/tmp/red-panda-native-worker-external-origin-v1.json`.

## Next test groups

1. The three-case native and candidate baseline above passed. Runner self-checks
   also distinguished a no-observation fixture, a pending async fixture and a
   failing assertion as unobserved, timeout and failed; zero selection exited 2.
   Keep these outcome guards when extending the runner.
2. Expand explicitly to node/document/collections/selector/shadow/range cases
   that need only static routes. Implement API gaps exposed by unchanged tests.
3. Port the minimal upstream routes for network, forms, redirects, CORS and
   WebSockets; run native and candidate with identical route state and feature
   flags. Avoid interpreting server 404s as browser-API failures.
4. Add frame/worker/module/storage lifecycles, protocol events and negative
   argument/lifetime matrices, then the native semantic/input/AX/renderer tools.
5. Cover remaining CLI, BiDi/WebDriver, MCP and saved-script surfaces; run larger
   WPT/integration/performance matrices only after their prerequisites exist.

## Historical CDP dispatch inventory (6a142a0)

Static dispatch matched 62 of the 164 advertised method names, including
acknowledgements and generic enable/disable handlers. It emitted 22 advertised
event names. Neither number is a completeness or pass percentage. Method
parameters/results, event ordering and conditions need runtime comparisons.

The appendix below is generated from the retained native protocol and the
historical committed dispatch; it deliberately does not credit unverified
in-progress changes.

### Every advertised command by domain

Names in the middle column have a handler, not a full-equivalence finding.
`(ack)` identifies known acknowledgement-only configuration.

| Domain | Historical handler / acknowledgement | No historical handler |
| --- | --- | --- |
| LP | `dump` | `getMarkdown`, `getSemanticTree`, `getInteractiveElements`, `getNodeDetails`, `getStructuredData`, `getContentSignal`, `detectForms`, `clickNode`, `fillNode`, `scrollNode`, `waitForSelector`, `handleJavaScriptDialog`, `configureCDP`, `configureLoading`, `version` |
| IO | — | `read`, `close` |
| DOM | `enable`, `getDocument`, `resolveNode`, `describeNode`, `getOuterHTML` | `performSearch`, `getSearchResults`, `discardSearchResults`, `querySelector`, `querySelectorAll`, `scrollIntoViewIfNeeded`, `getContentQuads`, `getBoxModel`, `requestChildNodes`, `getFrameOwner`, `requestNode`, `setFileInputFiles`, `focus` |
| Log | `enable` (ack), `disable` (ack) | — |
| CSS | — | `enable` |
| Page | `enable`, `getFrameTree`, `getNavigationHistory`, `setLifecycleEventsEnabled`, `addScriptToEvaluateOnNewDocument`, `removeScriptToEvaluateOnNewDocument`, `createIsolatedWorld`, `navigate`, `reload`, `setInterceptFileChooserDialog` (ack) | `navigateToHistoryEntry`, `stopLoading`, `close`, `captureScreenshot`, `printToPDF`, `getLayoutMetrics`, `handleJavaScriptDialog`, `setBypassCSP`, `bringToFront` |
| Fetch | — | `disable`, `enable`, `continueRequest`, `failRequest`, `fulfillRequest`, `continueWithAuth` |
| Input | — | `dispatchKeyEvent`, `dispatchMouseEvent`, `insertText` |
| Target | `getTargets`, `attachToTarget`, `closeTarget`, `createBrowserContext`, `createTarget`, `detachFromTarget`, `disposeBrowserContext`, `getBrowserContexts`, `getTargetInfo`, `setAutoAttach`, `setDiscoverTargets` | `attachToBrowserTarget`, `sendMessageToTarget`, `activateTarget` |
| Audits | `enable` (ack), `disable` (ack) | — |
| WebMCP | — | `enable`, `disable`, `invokeTool`, `cancelInvocation` |
| Browser | `getVersion` | `setPermission`, `setWindowBounds`, `resetPermissions`, `grantPermissions`, `getWindowForTarget`, `setDownloadBehavior` |
| Runtime | `enable`, `disable`, `runIfWaitingForDebugger`, `evaluate`, `addBinding`, `callFunctionOn`, `releaseObject`, `getProperties`, `releaseObjectGroup`, `removeBinding` | `awaitPromise`, `compileScript`, `runScript`, `queryObjects`, `globalLexicalScopeNames`, `terminateExecution`, `getExceptionDetails`, `discardConsoleEntries`, `getHeapUsage`, `getIsolateId`, `setCustomObjectFormatterEnabled`, `setMaxCallStackSizeToCapture` |
| Network | `enable`, `disable`, `setCacheDisabled` (ack), `setExtraHTTPHeaders`, `setUserAgentOverride`, `clearBrowserCookies`, `setCookie`, `setCookies`, `getCookies`, `getResponseBody` | `setBlockedURLs`, `deleteCookies`, `clearBrowserCache`, `canClearBrowserCache`, `getAllCookies`, `getRequestPostData`, `emulateNetworkConditions`, `setBypassServiceWorker` |
| Storage | `setCookies`, `getCookies` | `clearCookies` |
| Console | — | `enable`, `disable`, `clearMessages` |
| Security | — | `enable`, `disable`, `setIgnoreCertificateErrors` |
| Emulation | `setEmulatedMedia` (ack), `setFocusEmulationEnabled` (ack), `setDeviceMetricsOverride` (ack), `clearDeviceMetricsOverride` (ack), `setTouchEmulationEnabled` (ack), `setScriptExecutionDisabled` | `setGeolocationOverride`, `clearGeolocationOverride`, `setUserAgentOverride`, `setLocaleOverride`, `setTimezoneOverride`, `setDefaultBackgroundColorOverride` |
| Inspector | — | `enable`, `disable` |
| Performance | `enable` (ack), `disable` (ack) | — |
| Accessibility | — | `enable`, `disable`, `getFullAXTree`, `getPartialAXTree`, `queryAXTree` |

### Every advertised event by domain

Literal emission names establish only a possible source path. Many advertised
native event names may be dormant or unsupported in the native browser itself.

| Domain | Historical literal emission | No historical literal emission |
| --- | --- | --- |
| LP | — | — |
| IO | — | — |
| DOM | `documentUpdated` | `attributeModified`, `adoptedStyleSheetsModified`, `attributeRemoved`, `characterDataModified`, `childNodeCountUpdated`, `childNodeInserted`, `childNodeRemoved`, `distributedNodesUpdated`, `inlineStyleInvalidated`, `pseudoElementAdded`, `topLayerElementsUpdated`, `scrollableFlagUpdated`, `adRelatedStateUpdated`, `affectedByStartingStylesFlagUpdated`, `pseudoElementRemoved`, `setChildNodes`, `shadowRootPopped`, `shadowRootPushed` |
| Log | — | `entryAdded` |
| CSS | — | `fontsUpdated`, `mediaQueryResultChanged`, `styleSheetAdded`, `styleSheetChanged`, `styleSheetRemoved`, `computedStyleUpdated` |
| Page | `domContentEventFired`, `frameNavigated`, `frameStartedNavigating`, `frameStartedLoading`, `frameStoppedLoading`, `lifecycleEvent`, `loadEventFired` | `fileChooserOpened`, `frameAttached`, `frameClearedScheduledNavigation`, `frameDetached`, `frameSubtreeWillBeDetached`, `documentOpened`, `frameResized`, `frameRequestedNavigation`, `frameScheduledNavigation`, `downloadWillBegin`, `downloadProgress`, `interstitialHidden`, `interstitialShown`, `javascriptDialogClosed`, `javascriptDialogOpening`, `backForwardCacheNotUsed`, `navigatedWithinDocument`, `screencastFrame`, `screencastVisibilityChanged`, `windowOpen`, `compilationCacheProduced` |
| Fetch | — | `requestPaused`, `authRequired` |
| Input | — | `dragIntercepted` |
| Target | `attachedToTarget`, `detachedFromTarget`, `targetCreated`, `targetDestroyed`, `targetInfoChanged` | `receivedMessageFromTarget`, `targetCrashed` |
| Audits | — | `issueAdded` |
| WebMCP | — | `toolsAdded`, `toolsRemoved`, `toolInvoked`, `toolResponded` |
| Browser | — | `downloadWillBegin`, `downloadProgress` |
| Runtime | `bindingCalled`, `consoleAPICalled`, `exceptionThrown`, `executionContextCreated`, `executionContextsCleared` | `exceptionRevoked`, `executionContextDestroyed`, `inspectRequested` |
| Network | `loadingFailed`, `loadingFinished`, `requestWillBeSent`, `responseReceived` | `dataReceived`, `eventSourceMessageReceived`, `requestIntercepted`, `requestServedFromCache`, `resourceChangedPriority`, `signedExchangeReceived`, `webSocketClosed`, `webSocketCreated`, `webSocketFrameError`, `webSocketFrameReceived`, `webSocketFrameSent`, `webSocketHandshakeResponseReceived`, `webSocketWillSendHandshakeRequest`, `webTransportCreated`, `webTransportConnectionEstablished`, `webTransportClosed`, `directTCPSocketCreated`, `directTCPSocketOpened`, `directTCPSocketAborted`, `directTCPSocketClosed`, `directTCPSocketChunkSent`, `directTCPSocketChunkReceived`, `directUDPSocketJoinedMulticastGroup`, `directUDPSocketLeftMulticastGroup`, `directUDPSocketCreated`, `directUDPSocketOpened`, `directUDPSocketAborted`, `directUDPSocketClosed`, `directUDPSocketChunkSent`, `directUDPSocketChunkReceived`, `requestWillBeSentExtraInfo`, `responseReceivedExtraInfo`, `responseReceivedEarlyHints`, `trustTokenOperationDone`, `policyUpdated`, `reportingApiReportAdded`, `reportingApiReportUpdated`, `reportingApiEndpointsChangedForOrigin`, `deviceBoundSessionsAdded`, `deviceBoundSessionEventOccurred`, `requestAdblockInfoReceived` |
| Storage | — | `cacheStorageContentUpdated`, `cacheStorageListUpdated`, `indexedDBContentUpdated`, `indexedDBListUpdated`, `interestGroupAccessed`, `interestGroupAuctionEventOccurred`, `interestGroupAuctionNetworkRequestCreated`, `sharedStorageAccessed`, `sharedStorageWorkletOperationExecutionFinished`, `storageBucketCreatedOrUpdated`, `storageBucketDeleted` |
| Console | — | `messageAdded` |
| Security | — | `certificateError`, `visibleSecurityStateChanged`, `securityStateChanged` |
| Emulation | — | `virtualTimeBudgetExpired`, `screenOrientationLockChanged` |
| Inspector | — | `detached`, `targetCrashed`, `targetReloadedAfterCrash`, `workerScriptLoaded` |
| Performance | — | `metrics` |
| Accessibility | — | `loadComplete`, `nodesUpdated` |

## Independent implementation checkpoint (2026-10-30)

The inventory above deliberately preserves its historical baseline at `6a142a0`;
its counts do not describe the expanded implementation. Subsequent modules add
DOM tree/search/editing notifications, trusted keyboard/mouse input, measured
surrogate geometry, classic/BiDi sessions, HTTP/stdio MCP, saved scripts, selected
Runtime methods, history, full-document location/anchor navigation and ES modules.
No upstream production implementation was imported for those modules.

The focused validation now includes 44 PureScript Puppeteer assertions, 13
native/candidate differential groups and 25 successful saved-script stdout
comparisons. Local tests also cover negative paths, disposal and actual protocol
transport integration. Passing these cases is not a full-parity result.

Important remaining gaps include HTML collection/selector/element behavior,
frame realms and protocol events, workers, network policies/interception,
complete CSS and geometry behavior, missing CDP/WebDriver methods, full dump/MCP
contracts and secure execution isolation. `Runtime.queryObjects` remains
unsupported: a real Node inspector implementation crashed on jsdom realm teardown
on both tested Node versions. It must not return fabricated empty success.

The external upstream runner supports one owned browser process per fixture,
bounded deadlines and forced cleanup of a stalled child before the next case.
Native failures, unavailable dynamic fixture routes and absent observations must
be classified separately. A trial cohort run overlapped changing source and a
syntax error; it is invalid as a compatibility baseline. Repeatable runs use a
fixed candidate source snapshot with a file-level SHA-256 manifest. Its completed
results are recorded below with the native control kept separate.

The fixed checkpoint run has now finished. Its paired results and source-file
hashes are retained in [conformance-classic-checkpoint.json](reference/conformance-classic-checkpoint.json).

| Selected classic-script cohort | Passed | Failed | Timeout |
| --- | ---: | ---: | ---: |
| Native control | 170 | 8 | 0 |
| Red Panda `cf85fb9` runtime snapshot | 108 | 69 | 1 |

107 fixtures passed both implementations. Of the 170 native-passing cases, Red
Panda failed 62 and timed out on one. One candidate-passing fixture failed the
native control. This selection covers 178 explicit fixtures, uses a static
external server and a 3,000 ms per-fixture budget, and excludes module-script
fixtures. It is not a full-suite or browser-parity result.

Later independent work adds real form submission, dedicated workers, import
maps, focus/keyboard defaults, shared-transport XHR and additional measured
geometry. These are independently tested; the historical checkpoint figures
must not be interpreted as their current full-suite result.

The subsequent expanded checkpoint is retained in
[conformance-expanded-checkpoint.json](reference/conformance-expanded-checkpoint.json):
12/18 candidate fixtures passed, compared with 17/18 native controls. This is a
different selection with explicit iframe/worker loading and a 5,000 ms budget.
The native worker fixture also needs a dynamic `/xhr` route absent from the
static server; its failure cannot establish an engine incompatibility.

The `9b2d613` checkpoint passes 299 JavaScript tests and 47 PureScript
Puppeteer assertions, plus 13 differential scenarios and a strict PureScript
build. It adds browser-facing Fetch wrappers/CORS, real frame realm dispatch and
lifecycles, declarative/serializable/clonable shadow roots and manual slots,
native-shaped dump formats/flags, and the native CLI no-dump/5-second defaults.
Both unchanged upstream shadow serialization/declarative fixtures pass on
candidate and native, recorded in
[conformance-shadow-checkpoint.json](reference/conformance-shadow-checkpoint.json).

Those results are historical. The current independent work adds an owned V8
binding for genuine HTMLDDA collections, constructed/adopted stylesheets,
transferable MessagePorts, Blob URLs and worker scripts, geometry constructors,
navigator/font metadata, author Markdown alternates, and real PNG/PDF text
rendering. Rendering includes CDP screenshots, streamed PDFs and MCP screenshots;
it uses pinned Pillow/ReportLab/fonttools dependencies and fixed DejaVu fonts.
The [render contract](reference/render-contract.md) records measured native
behavior and remaining pixel/font/page-break differences. No upstream production
engine code is imported.

These results remain bounded. Missing protocol methods, separate utility realms,
full frame input/history/POST, window message transfer, network streaming/cache,
many HTML/WebAPI contracts, complete rendering behavior and runtime isolation
still prevent full replication.

The independent WebAPI/rendering checkpoint passes 427 JavaScript tests and 49
PureScript Puppeteer assertions, including actual PNG/PDF transport checks, plus
the strict/pedantic PureScript build and 13 native/candidate differential groups.
The development server was restarted and its health endpoint and PureScript
example were exercised with the updated runtime.

The separate unchanged-fixture cohort is retained in
[conformance-webapi-checkpoint.json](reference/conformance-webapi-checkpoint.json).
It records 43 source/native/package hashes, including the exact Node 24.22.1
collection binding and Python backend. Native passed 11/11; the frozen candidate
passed 10/11. Classic/module workers, three collection fixtures, three geometry
fixtures and both font fixtures pass. `css/stylesheet.html` still fails CSSOM
iteration, parsing and serialization/normalization assertions. This bounded
selection does not supersede the earlier 178-case cohort or establish full
browser parity. Navigator metadata identifies Red Panda; native-function
fingerprints and many remaining API contracts are not replicated.

The subsequent lifecycle checkpoint passes 555 JavaScript tests, 50 PureScript
Puppeteer assertions, the strict/pedantic build and all 13 existing differential
scenarios. It adds classic-script scheduling/preloads, genuine public mutation
delivery, CSSOM parsing and mutation semantics, streams, beacons, resize and
performance entries, error reporting, safe CDP value handling and nested-frame
keyboard focus. These features are independently implemented.

[conformance-lifecycle-checkpoint.json](reference/conformance-lifecycle-checkpoint.json)
retains a frozen 37-fixture comparison: native passed all 37; the initial
candidate run passed 32, failed the `parser_chunks` assertion and hit four
timeouts before browser readiness. A separate
[startup recheck](reference/conformance-lifecycle-startup-recheck.json) passed
all four affected fixtures with the identical source snapshot, flags and budget.
The original timeouts remain recorded. Native and candidate used the same
document-complete plus 100 ms settling procedure, inside the 15-second fixture
budget. This is evidence for 36 distinct candidate fixtures passing across those
runs, with large-document parser slicing still unfinished.

Heap enumeration remains unsupported. Both inspector and owned native-profiler
experiments crashed under lifecycle stress; further controls isolated older
closed-context probing after heap activity as a trigger. Experimental sources
are quarantined outside production builds/default tests, with
[negative evidence and limits](reference/runtime-query-contract.md). No empty or
partial successful query result substitutes for actual heap enumeration.
