# Lightpanda compatibility ledger

Full independent replication is the goal. The current implementation is not
complete. Upstream production engine code is not imported; the upstream binary,
source documentation, and external test fixtures are references and test oracles.

The current installed workflow passes **2,211 JavaScript tests, 129 PureScript
Puppeteer checks and 13 Native differential groups**, plus syntax and strict/
pedantic builds. The strict build reports zero warnings and errors; runtime
warnings remain in the complete logs. [Full validation](../proposals/canonical-style-scalar-r2/README.md)
records 13,260 unchanged inputs for JavaScript and 13,261 for the remaining
stages, after the three-leaf canonical-style change over b0217de. All 18 production native
artifacts remain unchanged. Original assertions, fixtures and budgets are
preserved. This is not a new whole-455 census or a full replication claim.
The [2,206-case lifecycle checkpoint](../proposals/initial-network-lifecycle-r5/README.md)
retains its own 13,430/13,451-input validation and earlier interrupted run.
The earlier [2,190/129/13 checkpoint](../proposals/feature-composition-full-root-r1/README.md)
and its 51-source/six-artifact application remain separate evidence, as do the
[2,043/129/13](../proposals/phase26-full-file-element-url/README.md) and
[1,992/117/13](../proposals/phase26-full-accepted/README.md) checkpoints remain
separate evidence.

Disk file selection now reads actual bytes/MIME/stat timestamps, validates the
whole vector before mutation, preserves canonical FileList identity and dispatches
trusted input/change events inside the real owner VM budget. Interruption recovery
restores abandoned private dispatch/reporting state while preserving live outer
dispatches. [R5 evidence](../proposals/cdp-file-input-r5/README.md) retains every
negative epoch and the untested size-boundary/default-action limits. Legacy main
File/Blob definitions remain Host-created even though fresh wrappers are genuine
VM objects. Utility File/Blob/FileList definitions and DataTransfer state use the
same real backends. Six Native semantic objects match; selected checks pass on
all three SDKs. The real PureScript/Puppeteer flow verifies nonempty disk upload,
atomic missing-path failure, actual empty/repeated-empty upload, byte identity
and handle cleanup. [Composition](../proposals/utility-data-transfer/final-d41-r1/README.md).

Measured [element corrections](../proposals/element-api-parity/README.md) cover
exact-empty closest errors, typed param/hidden-input display and authored revert,
and genuine composed shadow/slot geometry with scoped hit retargeting. Their
three original fixtures pass separately. Canonical URL.parse now binds its real
parser backend before first public return, with actual VM URL/searchParams
shells; its original fixture and selected SDK/consumer checks pass. Public legacy
URL definitions and broader utility/brand/iterator behavior remain outside that
[slice](../proposals/url-parse-canonical-factory/README.md).
The original [createHTMLDocument fixture](../proposals/domimplementation-readiness/README.md)
also passes after initializing the actual successful backend to complete;
named-document properties and DOMParser readiness remain separate gaps.

Navigator's 18 measured public getters now use genuine native functions created
in their owning page context, retaining live metadata and private receiver
checks. All 18 descriptor objects match the Native reference. The 13 focused
checks pass on each supported Node version; a separate 17-case Root integration
check also passes. [Evidence](../proposals/navigator-accessor-publication/root-integration-r2/README.md)
includes physical creation-context checks and real request header bytes.
Red Panda branding remains intentional. Plugin result-wrapper allocation and
broader foreign borrowing remain unverified. The full-suite checkpoint above
predates this focused change.

PointerEvent now uses canonical Mouse/Event backing with genuine VM definitions,
private brands and utility aliases. Fractional coordinates survive construction
and reinitialization; click-family reads follow the measured rounding policy.
The selected 75-case integration passes, with separate cross-SDK and physical
creation-context checks. The unchanged upstream pointer fixture also passes.
[Evidence](../proposals/pointer-public-recovery/README.md) preserves an earlier
65-case administrative timeout and the later matching successful controls.
Broader privileged driver and builtin-function metadata parity remain open.

Details.name now reflects canonical attributes. Base URL handling and event
handlers use genuine receiver-VM operations and compiler errors, preserving real
listener order, noncallable clearing and measured handler placement. The
[eight-leaf change](../proposals/lifecycle-minimal-r2/README.md) passes 13 focused
checks on each SDK and all three original fixtures in a separate candidate.
The current Pointer/lifecycle composition passes 150 selected regressions.
Loaded document.close scheduling and blank-frame generation remain open.

The current [registered-fixture census](../proposals/conformance-917f9bd/README.md)
at pushed 917f9bd completed all 455 fixtures under eight registration profiles:
**415 verified passes, 37 assertion failures and three source-load timeouts**.
All 18,088 graph/control inputs, 165 source contracts and six controller inputs
stayed unchanged. All owned rows closed and both fixture ports were released.
Original load/assertion budgets and WS50 were preserved. Only the external
harness eligibility predicate recognizes Red Panda; public UA/client hints and
fixture assertions are unchanged. Navigator/fetch/XHR branding literals remain
counted failures, with later unexecuted assertions unverified. This adapted
conformance run establishes neither strict unchanged-harness success nor full
replication, WPT or performance equivalence. Its 40 nonpasses remain actionable
evidence, including Window/document properties, script/module behavior,
styles/layout, frame lifecycle and timing surfaces. The earlier
[402/50/3 census](../proposals/conformance-d41/README.md) is preserved separately.
The audio-context fixture changed from pass to failure at a parameter assertion
(`expected 0.25, got 0.5`). The measured past-time correction below addresses
the timing-dependent defect; this census retains its original failure. Changed outcomes
between these different code graphs do not establish which change caused them.

Canonical Markdown now reads actual author-style producers and backend nodes,
with source-document style ownership, main render-context URLs, measured slot
and paragraph behavior, and genuine inactive/adopted documents. No DOM clone or
authored getter supplies renderer state. All 98 selected checks pass on each
prepared SDK; a separate candidate actor matches 13 retained Native detached
results. Public stylesheet identity/text-mutation differences, complex selectors
and broader shadow formatting remain explicit in the
[handoff](../proposals/lp-private-author-style/README.md).

Automatic animation completion now resolves the actual finished Promise, drains
real V8 reactions inside the captured owning-VM task and directly delivers the
trusted finish event. Explicit finish/cancel retain queued events. Seven whole
Native producer/reaction objects and six causal timing projections match,
including finish after actual frame removal. The 32 selected checks pass on each
SDK, with the first SDK split into separate 4-case and 28-case runs. Actual
200 ms infinite event and Promise reactions recover and leave future checkpoints
usable. External and legacy Host init hooks still cause genuine Node async-stack
failure for Promise interruption; those modes remain unsupported. The
[composition evidence](../proposals/animation-promise-attribution-composition/README.md)
preserves those negatives and the original poisoned-timer teardown failure.

Promise rejection attribution now uses actual V8 creation-context equality
instead of walking mutable public prototypes. Subclasses with null, foreign or
Proxy prototype chains retain the correct owner without executing authored
prototype traps; Host-created and unregistered Promises preserve fatal reporting.
All 21 attribution/error cases pass on each of three SDKs, with 100 separate
existing regressions and a fresh 49-case main-checkout composition pass.
[Evidence](../proposals/promise-attribution-authority/acceptance-r2/README.md)
preserves the failed test-harness epochs and distinguishes these focused checks
from the complete-suite checkpoint above. External and legacy Host async hooks,
Native late-handler routing and reusable-global lifecycle parity remain gaps.

The preceding [1,956-case checkpoint](../proposals/phase25-full-accepted/README.md)
adds measured cookie actions and Unicode HTTP transport,
JavaScript dialog state, actual thrown-object handles, Page close/stop controls,
canonical Markdown aliases, permissions/geolocation and bounded binary/POST
capture. Its 43 new feature cases passed separately on each of Node 24.19, 24.22
and 26.13. The narrow animation scheduling fix also passes 28 affected checks on
each SDK. It captures the actual private Window task queue and leaves the
original finish/play/queued-event code intact. Its frame-removal finish gap is
addressed by the later composition above; complete Promise interruption remains
unfinished.

The earlier [initial full run](../proposals/phase25-full-initial/README.md) remains
failed: 1,951 of 1,954 JavaScript cases passed, with animation timing, a native
heap-query timeout and a CLI child timeout. The shared timer queue inversion has
measured causal controls; heap/CLI timeout causes remain unexplained. Passing
single/whole-file diagnostics and the new full run do not relabel those failures
or establish a causal fix. The ambient Node 26 timing-probe timeout and later
canonical-environment positives are likewise separate epochs.

The preceding fully passing full-suite checkpoint passes **1,906 JavaScript tests, 100 PureScript
Puppeteer checks and 13 native differential groups**, syntax and strict/pedantic
PureScript builds. [Validation](reference/phase23-integration/validation.json)
records 13,487 unchanged monitored inputs. Its first1902-case full run had1899
passes and three genuine private-argument Array-poison failures; all raw errors,
source guards and corrected evidence remain separate.

Public Node/Element/HTMLElement and Document definitions, manual element and
Document functions now have genuine VM creation contexts. A fresh117-value probe
changed87 Host-created slots to the selected VM while retaining30 already-VM
slots; all117 remain genuine after their same values' prototypes are nulled.
Private generated conversion argument arrays stay in Host ownership at71 guarded
allocation sites. Actual public result arrays still execute authored numeric
setters, preserve holes and map errors exactly as the unchanged Range tests require.
All94 focused recovery tests plus9 direct controls pass on each prepared SDK.

Attr ownership follows real subtree/shadow/template adoption before callbacks.
Computed defaults and live style/focus selection use canonical owner state. The75
text-decoration controls match Native fully; the unchanged320-field matrix retains
65 known differences with no new paths. Three authored owner controls match whole
Native values. These are bounded comparisons, not complete CSS/layout equivalence.

Cookie CDP validation, missing-address errors, empty names, negative/session and
zero/deletion expiry, atomic schema/sanitization checks and policy-skipped batch
members follow measured Native behavior. HTTP response policy preserves its actual
Cookie objects and observed SameSite handling. Full cookie metadata now matches43
actual Native payload rows without comparison filtering: site insertion and
path/creation order, context creation/close/dispose, Network.getAllCookies and
attached-session Storage getters. Real store callbacks/Promises and generic/CLI
exports remain intact. The earlier190-case each-SDK matrix and Cookie/metadata
focused epochs describe their exact prior graphs, not a fabricated final39 run.

Red Panda branding is explicit user policy. The source fixture's literal
Lightpanda-name expectation is intentionally different; its remaining unexecuted
assertions are not automatically verified. Exact known CDP enable/disable commands
now reject malformed nested names without changing domain state; known disables
are idempotent, and Runtime cleanup retains its enabled-only guard. Native real
HTTP controls match disabled/enabled/disabled Network event delivery. All 25
focused checks pass on each prepared SDK, with 100 compiled PureScript checks;
a fresh main-checkout 25-case replay kept 8,339 inputs unchanged. This scoped fix
does not replace the full-suite epoch above. See the [dispatch evidence](../proposals/phase24-domain-dispatch/evidence-packet/README.md).

Five additional configuration commands now match Native acknowledgements: CSS.enable,
Inspector.enable/disable and Security.enable/disable. They require no loaded
target and accept the measured null/object parameters. Unknown nested names
still fail. Stale sessions fail before dispatch with Native error -32001.
All 27 focused cases pass on each prepared SDK with 8,341 monitored inputs
unchanged. These acknowledgements do not implement stylesheet inspection,
Inspector debugging, or TLS policy. [Configuration evidence](../proposals/cdp-configuration-acks/README.md).

The new protocol/transport controls have bounded Native comparisons, with their
remaining owner, parser and transport exclusions retained in each proposal.
Functional work still includes broader Markdown/CSSOM, cache and actual
Fetch interception/downloads, wider file-input/semantic tool coverage, broader media,
and genuine reusable Window/module boundaries. Promise interruption with external
or legacy Host init hooks remains a foundational gap. The earlier animation
experiment that corrupted Node's async-hook stack remains rejected; the new
ordinary-VM composition above requires genuine creation-context attribution. The
[current static ledger](../proposals/phase25-remaining-static/README.md) separates
historical fixture outcomes from today's measured graph. Source63/private104 and
historical full455 results stay separate; no full browser/WPT/performance
equivalence is claimed. Native C++ remains cb235f73; optional owned-context/module
designs are not production. Red Panda branding is intentional; a literal
Lightpanda-name fixture failure does not establish its later assertions passed.

The sections below retain earlier checkpoint evidence and its original limits.

An earlier integration added real classic-script microtask checkpoints, loading
and retained-frame document writes, DOM serialization, Request/Response producer
streams, cross-realm Blob/File messaging, SVG values, CSS media/computed values,
and experimental Cache/service-worker lifecycle plus dedicated-worker blocking
XHR/FileReaderSync and real WebSockets. Protocol invocation captures the actual
realm apply intrinsic and enters through a private lexical trampoline with a VM
timeout. These are bounded implementations: service-worker clients/controller,
fetch interception, updates and persistence; full SVG/layout; worker network
policy; complete runtime worlds/heap enumeration; and complete asynchronous execution
deadlines remain unfinished. See the source proposals and retained observations
in `proposals/`; isolated proposals are not automatically production features.

The following integration also includes actual V8 by-value serialization with
getter deadlines/recovery, real Window global prototype layers, Console
namespaces, ImageData/encoded chunk values, unsupported codec task state machines
and genuine offline audio buffer rendering. Private value/audio records use
Host allocations while public objects retain their actual realms. Native
HTMLDDA descriptors, enumeration, borrowed methods and retained handles now come
from the actual independent native binding, including by-value serialization
through the ordinary V8 serializer. Broad Window IDL, media processing, wider
audio/Canvas APIs and protocol/resource behavior remain incomplete.

In the selected additional48 source cohort, the earlier candidate had9 passes.
The phase15 graph has17 per-case passes and31 application failures after the
separately replayed ImageData case. Its first attempt failed during browser setup
with a WebSocket HTTP200 response and no harness observations; that raw outcome
is preserved. Native positive controls for these48 span the previously retained
44, two corrected fixture-route cases and two canonical cases. These scoped,
separate runs do not establish a full registration/WPT pass rate or speed parity.

The preceding checkpoint passed **1106 JavaScript tests,57 PureScript checks
and13 existing native differential groups**, plus syntax and strict/pedantic
builds. [Evidence](reference/phase15-integration/validation.json) binds263 inputs
unchanged across the full run and records exact collection builds on three Node
versions. The new PureScript flows verify actual image/chunk bytes and scheduled
offline audio samples through Puppeteer. Earlier checkpoint reports below remain
historical; they are not cumulative current-source pass rates.

The following CSS namespace slice adds actual realm-local `CSS.escape` and
`CSS.supports` functions and readonly accessors, including child/utility realms.
[Its evidence](../proposals/css-namespace/README.md) records1664 native controls,
eight tests on three Node versions and the unchanged `css.html` passing against
both targets. Property support recognizes534 inspected names and checks nonempty
values, following the measured target behavior. Full CSS token recovery,
property inventory and @supports cascade semantics remain incomplete. This
focused result does not change the historical full-suite checkpoint above.

The following Storage and Canvas slices preserve actual public objects and
private backing state. Storage now counts5MiB UTF-8 value bytes, retains both
areas by context/origin, and shares the original actual wrapper within same-origin
live frames; key order, reserved-property reflection, protocol classification and
opaque child initialization remain bounded gaps. Canvas exposes real context,
Path2D, gradient/pattern and text metric values with shared utility backing state.
Its measured target profile has ineffective drawing, transparent reads and a1x1
transparent PNG regardless of nonzero canvas dimensions. An independent encoder
builds that PNG from actual RGBA samples and verifies CRC/DEFLATE/Adler data;
general rasterization is not claimed. The preceding combined checkpoint passes **1,140 JavaScript tests, 60 PureScript
checks and 13 existing native differential groups**, syntax and strict/pedantic
builds. [Validation](reference/phase16-integration/validation.json) binds490
committed source/reference inputs,18 native build artifacts and eight unused
pre-existing reference files unchanged across the run. All six unchanged affected
source fixtures pass in a paired native/candidate replay. Diagnostic budgets and
scoped controls do not establish a full registration/WPT or performance pass rate.

The current integration adds real AudioData/VideoFrame plane bytes,
URLPattern parsing/bounded V8 matching/generation, typed DOMException and
CryptoKey cloning, genuine selected-VM Worker Event/Abort/Scheduler wrappers,
Window device denied defaults, Cookie Store changes from the actual context jar,
Selection operations and measured Range fragments, Web Locks callback lifetime,
form-associated custom element state/validation/submission, and task scheduling.
Private state/factories use Host allocations and strong successful-wrapper brands.
Public result materialization preserves measured setters and actual realms.

The current checkpoint passes **1,323 JavaScript tests, 71 PureScript Puppeteer
checks and 13 native differential groups**, plus syntax and strict/pedantic builds.
[Validation](reference/phase17-integration/validation.json) binds1,409 committed
source/reference inputs,18 exact native artifacts and21 unused pre-existing
reference files unchanged across the run. The initial run's three failures are
retained separately: a loopback proxy mismatch, an old layout assertion corrected
by an exact Native control, and a genuine Worker codec dispatch integration bug.
The corrected Worker/Window/layout checks pass27/27 before the complete retry.
Broader geometry/Unicode/layout,
Window symbol exposure and exact heap counts, worker Request.signal coverage,
additional IDL/conversion/error wording, exotic custom-definition rollback,
network/SameSite/permissions and real media processing remain bounded gaps.
Frozen proposals and negative-before/positive-after allocation controls preserve
actual observed differences. Presence of a proposal is not production support.

The preceding checkpoint added real SharedWorker VM actors and receiving-VM port/value
allocation, private Shared SSE/WebSocket brokers and actual parked transport
cleanup; genuine Response-backed WebAssembly streaming compilation; completed
Worker document-XHR errors; generic request metadata, no-cors redirect taint and
creator-owned dedicated Worker Blob URLs. It preserves the previous public Event
realms, SSE, WebSocket admission, audio, image, IndexedDB, popup, Sanitizer,
animation, Storage, select and DOM lifecycle work. No native C++ or dependency
source changed in this batch.

At that preceding checkpoint, all 1,588 JavaScript tests, 87 PureScript Puppeteer checks, 13 native differential
groups, syntax checks and strict/pedantic PureScript builds pass.
[Validation](reference/phase20-integration/validation.json) records 9,382 unchanged
declared inputs: 2,074 indexed source/reference inputs, 18 native build artifacts,
6,579 Node dependency files, 689 cached reference inputs, one controller and 21
unchanged preexisting reference files excluded from this commit.
Paired native/candidate replays pass 27/27 with the declared profiles, plus a
separate 2/2 WebSocket replay with both binaries explicitly configured for 50.
The original 2000ms load and fresh 2000/8000ms assertion budgets remain separate;
9,345 inputs are unchanged. The full-fetch replay remains NativePASS/candidateFAIL
in module23 fetch_header_layers: real RedPanda client hints fail a literal
Lightpanda identity expectation. Its two actual Runtime exceptions are retained.
Absence of the older module25 diagnostic is not whole-fixture success.

The combined isolated 127 checks pass; the Root strict/87 Puppeteer pipeline and
36 key checks each on Node 24.19.0 and 26.13.0 pass with 8,653 inputs unchanged.
A separate Shared composition passes 17 checks on all three SDKs. These bounded
controls do not establish full SharedWorker, network or performance equivalence.

An additional actual utility-world comparison is a retained negative: Native
exposes SharedWorker/MessageChannel/MessagePort and delivers a trusted shared
worker reply, while this candidate exposes all three as undefined. Shared global
constructor, symbols, cross-port ordering and API propagation remain partial.
Worker Response/Blob/URL realms and broader CORS/cookie/referrer/transport profiles
also remain incomplete. Public composedPath and EventTarget symbol differences
remain. Later namespace/Event parity, history/Navigation, editing, form, viewport
and owned-window proposals are separate work. Presence of a proposal is not
production support. Earlier failed epochs remain in the phase18/19 evidence.

The separate complete frozen candidate matrix at ee39586 records338 verified
passes,98 assertion failures,18 source-load timeouts and one image-option startup
failure across455 paths/eight profiles. Its6654 source/helper/dependency/build
inputs remain unchanged. [Raw reports and classification](../proposals/candidate455-phase17/README.md)
remain tied to that commit; later feature replays do not rewrite its rows.

The new test transport profile implements real HTTP/raw HTTP, compression,
SSE, WebSocket, headers/sidecars, counters and downloads. Its source map covers
455 unique registered paths in8 profiles (216 active literal calls,14 nondefault
calls;15 paths have nondefault options). The external source load contract waits
up to2000ms for actual complete/load before starting a separate2000/8000ms
assertion budget. Earlier immediate-poll/single-budget epochs are explicitly
load-contract mismatches, including their apparent passes.

The frozen Native-only canonical matrix is451 passes, one full-WebSocket
assertion failure, one XHR header setup mismatch, one blob-frame load timeout
and one owned-driver deadline without a final report. The header correction and
successful XHR/compare-position replays are separate evidence; they do not turn
that epoch into a full455 pass. This matrix is neither a current Red Panda
comparison nor a compiled Zig/WPT or performance result. See
[the baseline](../proposals/native455-canonical/README.md) and exact manifests.

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
| `fetch` | Partial/bounded passes for HTML/Markdown, load/done/selector waits, JSON batches, error exits, preloads and cookie files. Both default to no dump and a5,000ms wait option. Optional bare dump, wait-script files, predicate readiness, fixed HTTP headers and exact text-output framing have bounded real CLI controls; pending-navigation deadline outcomes remain different. Red Panda batches run sequentially. Native JSON diagnostic fields such as `page_status` and `bot_challenge` are missing. |
| `serve` | Partial CDP on TCP. No advertised-host override, Unix sockets, connection/backlog limits, configurable origin allowlist, native `/json/protocol` or `/metrics` endpoints. Serve accepts some globally parsed cookie flags without implementing native daemon load/save semantics. |
| `run` | Missing saved PandaScript execution and its browser interaction/extraction API. |
| `agent` | Missing REPL, task mode, recording/save, attachments, provider configuration and tool loop. Local `--no-llm` and deterministic replay can be tested without credentials; live providers require separate access. |
| `mcp` | Missing stdio and session-scoped HTTP JSON-RPC, initialization/tool schemas, sessions and optional co-hosted CDP. |
| `completion` | Missing bash/fish/zsh completion generation. |
| `help`, `version` | Red Panda has `--help` and its own version; native command/subcommand help contracts are not replicated. |
| Automation protocols | Native serve supports CDP and WebDriver/BiDi on the same listener. Historical Red Panda has CDP only; newer transport work requires its own conformance results. |

Dump selection, UTF-8 byte caps, Markdown alternates, strip groups and absolute
base insertion have bounded implementations and native controls. HTML, Markdown,
semantic JSON/text, structured metadata and text-rendered PNG/PDF are available;
this does not establish complete payload/rendering parity. The new writer capture
retains an existing semantic-tree-text article/name mismatch. Candidate-only
`text` and `links` are additional formats with no native fetch counterpart.
Missing or incomplete fetch options still include `--metrics`, real
`--terminate-ms`, `--with-frames`, idle readiness modes, image loading and broader
HTTP/locale controls. Native shutdown can linger after complete stdout; captured
first-output times and watchdog signals remain distinct from operation deadlines.
See [the CLI proposal evidence](reference/cli-proposal.md) for actual exit/output
controls, unresolved errors and the optional-dump positional-value quirk.

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
  `--http-nav-burst`, `--http-nav-delay`, `--http-timeout`, `--http-version`.
  `--ws-max-concurrent` is implemented with the measured default 8 and 0..255 range.
  Native response-size default is 1 GiB, compared with
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
| HTML/XML/encoding | Native html5ever/parser behavior versus jsdom, fragment contexts, document.write and broader malformed XML/XHTML/encoding inputs. Canonical BOM/legacy-codec decoding and measured XML factory corrections have bounded R9 evidence below. |
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
bad gzip, redirects, scoped cookies, header echo and real compressed-byte
`/echo_brotli` echo. It imports no engine code.
`/__fixture_metadata` lists implemented routes, provenance and unsupported route
groups; it explicitly reports `completeUpstreamServer:false`. Node HTTP automatic
headers/framing are not byte-for-byte copies of the Zig server. Raw-wire, SSE,
WebSocket, CORS-specific, other compression, resource-timing and counter endpoints
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
runs. Large-document parser slicing was still unfinished at that checkpoint.

The following independent parser/form checkpoint adds genuine bounded tokenizer
feeding with task yields, actual EOF and script-blocker resumption, close/abort
cancellation, trusted FormData construction events and form reset guards.
The bounded [form observations](reference/forms-construction-after.json) match
the native result object exactly, including its replacement-entry order and
relaxed HTMLElement submitter behavior. See the
[form contract](reference/forms-construction-contract.md) and
[parser investigation](reference/parser-stream-FINDINGS.md).
The full suite passes 573 JavaScript tests and all 50 PureScript Puppeteer
assertions; syntax checks, the strict/pedantic PureScript build and the 13
existing bounded native comparisons also pass.

The new frozen
[41-fixture comparison](reference/conformance-parser-forms-checkpoint.json)
passed all 41 native fixtures and initially passed 38 candidate fixtures, with
two assertion failures and one browser-startup timeout. The unchanged
`mutation_observer/parser_chunks.html` now passes. A separate
[same-snapshot recheck](reference/conformance-parser-forms-recheck.json) passes
both the startup-affected `subtree` fixture and `report_error`, whose initial
100 ms callback assertion missed the posted-message event. The original
outcomes are retained; no timing cause is established. This supplies passing
evidence for 40 distinct candidate fixtures across those runs, rather than a
40/41 primary-run result. At that checkpoint `element/html/form.html` still
failed direct named form access, named collection enumerability and disconnected
form association.

The next independent checkpoint fixes those form-property failures, sequential
document-write insertion order and parser-script `document.open()` guards. It
also selects actual root/frame VM contexts by registered identity rather than
executing marker probes in candidate contexts. The full suite passes **586
JavaScript tests and 50 PureScript assertions**, syntax/strict/pedantic checks,
and all 13 existing bounded reference comparisons.

The [new frozen 41-fixture run](reference/conformance-properties-runtime-checkpoint.json)
passes **41/41** candidate fixtures without failure or timeout. Its 55
runtime/native/package file hashes match the working implementation. It reuses
the earlier 41/41 native controls with the same binary identity, fixture/harness
hashes, resource flags, routing profile and budgets. This is functional evidence,
not a contemporaneous performance comparison or a replacement for the broader
historical 178-fixture cohort. The
[form-property contract](reference/form-controls-contract.md) and
[parser-reset findings](reference/parser-reset-NOTES.md) preserve scoped results
and remaining post-load reset/nested-external-script gaps.

Heap enumeration remains unsupported. Both inspector and owned native-profiler
experiments crashed under lifecycle stress; further controls isolated older
closed-context probing after heap activity as a trigger. With named selection,
both [snapshot](reference/runtime-query-named-snapshot-summary.json) and
[direct profiler](reference/runtime-query-named-direct-summary.json) experiments
pass four lifecycle cycles, 28 selections and 41 actual queries on each of Node
24.22.1 and 26.13.0, including retained old contexts and real object/group
identity. These experiments do not enable the production command; selected-realm
ownership, bridge prototypes, bounded failure behavior and protocol contracts
still need integration. Experimental sources remain outside production/default
tests, with [negative evidence and limits](reference/runtime-query-contract.md).
No empty or partial successful query result substitutes for actual enumeration.

The independent DOM/value checkpoint adds range/date stepping, radio/label
association, dialog/popover state and submission, selector validation and private
CSS state revisions, innerText/checkVisibility, document/XML/XPath adapters,
Blob byte reads, Fetch value parsing, real stream codecs and post-load written
parse cycles. Document reset retains the Window, Document and JavaScript realm,
removes authored listeners and keeps explicit engine listeners and module maps.
Initial loading/inactive-frame writes and synchronous written external scripts
remain incomplete.

The next independent DOM/flow/worker integration passes **900 JavaScript tests
and 53 PureScript Puppeteer assertions**, syntax and strict/pedantic builds, and
the same13 differential groups. Its [source-bound validation](reference/phase10-integration-validation.json)
records88 production source hashes and24 additional native/package files. Real
scoped socket cookies and UA/language policy, worker sync CORS/preflight and
multipart, main IDL prototype links and borrowed sequence-array realms, SVG
paths/bounds/text/list values and actual flow/scroll calculations are integrated.

The formerly failing [position fixture](reference/conformance-phase10-position-candidate.json)
passes on the frozen integrated graph within15seconds (12.4seconds including
owned process startup/cleanup). Separate isolated layout captures retain a15s
timeout and30s pass; an earlier9.1s result belongs to a different pre-freeze graph.
No2s source-budget or performance-equivalence claim follows. SVG controls cover
all9 unchanged SVG fixtures, but two large quadratic length controls differ by
about0.0001604/0.0000480, and geometry clone/prototype contracts remain incomplete.

The [broader48-fixture report](../proposals/coverage48/report.json) belongs to the
earlier frozen integration graph: native48 valid positive controls; candidate
11passed,36failed and1timed out. A missing method-echo route was separately fixed
in the owned test transport and rerun; its original transport failure is retained.
AbortSignal listener exceptions can terminate that candidate process, named-frame
POST navigation is unsupported, and substantial custom-element/frame/control/
encoding/XPath behavior remains different. These results are separate from the
900-test development suite. Actual utility worlds and heap enumeration are still
unmerged proposals; their acceptance and lifecycle gaps remain explicit.

A subsequent narrow [TextEncoder fix](../proposals/text-encoder/README.md)
matches its pinned native public control exactly and passes both unchanged
encoding fixtures. It corrects encodeInto's required-argument/method shape,
conversion order, private receiver validation and result/error realm handling
while retaining genuine UTF-8 bytes.42 focused checks pass, including4 new checks
also run on Node 24.22.1 and 26.13.0. This closes one observed case from the older
48-case report without rewriting that frozen report or claiming a new full-suite
pass rate.

The actual-world/Abort integration passes **954 JavaScript tests and53
PureScript Puppeteer assertions**, syntax/strict builds and all13 existing native
differential groups. [Validation](reference/phase12-integration-validation.json)
binds119 production/native/package files to the same frozen graph. The
[default32 comparison](reference/conformance-phase12-default32-candidate.json)
passes32/32 with the unchanged native harness, actual iframe/worker flags,
document-complete plus100ms settling and15s diagnostic deadline. The separately
rerun Abort/encoding trio also passes. These are scoped outcomes, not a
455-registration or WPT pass rate.

Named isolated worlds now use actual separate VMs, constructor/prototype/expando
state and typed wrappers over the original shared DOM implementation. Genuine
utility observer/geometry/font/RAF producers pass the existing Puppeteer workflow.
Both main-page and active child-frame protocol calls use the owned bounded VM
invocation helper. Window/frame AbortSignals retain real realm EventTarget error
delivery and private native transport cancellation; Request.signal is the
native-observed nullable original supplied object. Standalone installation uses
the private constructor registry and cannot rewrite Node transport statics.

Real DOM traversal/cascade optimizations reduce the isolated position control
from13573ms to2454ms. Native measured63ms; strict2s still fails. The new SVG
flat-tree font inheritance matches8 host/slot/mutation controls and restores the
check_visibility source case. Relative Bezier tolerance matches31 controlled
numeric cases at1e-9, including the two prior negative scale100 cases, whose
original reports remain unchanged. Broader geometric precision is not implied.

At this checkpoint heap enumeration, retained-frame lifetime, geometry codec/
provenance, custom elements, main synchronous XHR and HTTP header-policy proposals
remain unmerged. Utility CSS/XML/SVG/messaging coverage, Worker error delivery,
full async execution deadlines, browser isolation and full native performance
remain incomplete.

### Next integration: heap queries, custom elements and privileged headers

The independent public-V8 heap backend is integrated after the checkpoint above.
It uses real selected VM contexts and returns actual public object identities,
including composed form proxies. Trusted factory provenance is weak and actual
registered V8 creation context takes precedence over a host factory hint.
Limits throw instead of returning truncated prefixes; GC/profiler execution is
blocking and its timeout is cooperative. Exact counts, exhaustive wrapper
coverage and complete utility Web APIs remain unresolved. Earlier inspector
crashes remain historical evidence, not evidence that this backend passed.

Custom elements now have realm-local registry promises, constructor lookup,
parser/reaction integration, template-document behavior and shadow adoption
ordering calibrated against bounded native controls. HTTP request construction
applies default/jar values, privileged CDP headers, then CLI headers on each real
redirect hop. Privileged Cookie/Authorization settings retain their native-
observed precedence even for credentials-omitted requests; response-cookie
import still follows credentials policy. The follow-up recomputes unsafe header
names after authored Authorization is stripped; all52 measured same-site actions
now match the native control. Redirects still requiring fresh preflight and
cross-site SameSite behavior remain separate gaps.

Fresh recovery validation passes syntax checks, strict/pedantic PureScript
compilation and **55 PureScript Puppeteer checks**, including bracketed heap
handle ownership and real form identities. Full JavaScript integration and
native differential checks are recorded separately when they complete.

Removed frames now retain their original main/utility VMs, Documents, objects and
existing execution-context identities until owning-page teardown. They leave the
active frame tree; new isolated-world creation is rejected. Original main-world
timers/RAF/fetch are canceled while later work and retained utility work remain
usable. Bounded native comparisons match39 common and10 selected nested controls;
actual heap identities and authority revocation are covered by regressions.

Geometry cloning now uses successful trusted factory records for Point/Rect
values and actual receiving-realm constructors; Matrix values reject as observed
in Native. Blob/File producers retain immutable bytes and copied implementation
or Node handle symbols do not establish provenance. Unknown inherited static
toStringTag classification remains a documented cloning limitation.

Window/frame synchronous XHR uses a Browser-owned readiness-confirmed thread,
actual response bytes and host cookie/redirect/CORS policy. Operation ownership
covers the blocked wait, cookie processing and request/response/failure callbacks;
real VM interruption cancels only captured request IDs. All15 native controls
match, including native UTF-8/BOM, original responseURL and sync event quirks.
Sync Blob URLs, utility XHR and broader redirect/coercion combinations remain
incomplete. The CE parser fixes preserve callback-reparented nodes and apply the
real dynamic-markup counter during initial construction, closing a process exit
and a zero-observation fixture. They pass both unchanged source fixtures.

Parent integration passes151 combined JavaScript checks and55 PureScript checks
before the subsequent parser/XHR merge;54 parser checks and65 combined
XHR/parser/realm/codec checks then pass. The first broad recovery run stopped
with939 passes and4 fixture-network failures because managed proxy routing sent
0.0.0.0 requests away from their owned server. An actual HTTP control observed
zero owned requests before a local bypass and one after; all31 affected worker
checks pass unchanged with that setup correction. This interrupted run is not a
full-suite pass. The new complete stable-graph regression is recorded separately.

The corrected checkpoint passes **1023 JavaScript tests,55 PureScript checks
and13 native differential groups**, with syntax and strict/pedantic builds.
[Validation](reference/phase14-integration/validation.json) binds245 unchanged
source/test inputs and retains both the successful run and the earlier1021/1022
run. Native confirms that frame-created Blob URLs survive removal; the actual
retained frame now remains discoverable by Blob transport. Parent/child reads,
new URLs, revocation, retained bytes and final owning-page cleanup are covered.
The larger registration/WPT matrix, API breadth, performance and isolation goal
remain incomplete; later isolated proposals are excluded from this checkpoint.

The full suite passes **687 JavaScript tests and 53 PureScript Puppeteer
assertions**. Syntax, strict/pedantic PureScript builds and all13 bounded native
comparisons pass. The [frozen73-fixture comparison](reference/conformance-dom-values-checkpoint.json)
binds66 production/native/package files, rechecked after both runs. Fresh native
controls pass73/73; the candidate passes67, fails3 and has3 unobserved stream
cases. Request stream bodies, MessageChannel identity, BroadcastChannel and
classic-script microtask checkpoints remain separate unfinished integrations.
The raw native/candidate reports are retained alongside the checkpoint. This
uniform iframe/worker profile is not the full registration/options matrix or a
performance comparison.

An earlier mutable26-fixture preflight omitted both resource flags and produced
one frame failure and one timeout. Controlled old/current runs reproduce those
same outcomes with frame resources disabled and pass with them enabled. The
misconfigured report is retained; these outcomes are not code regressions.
The test helper now implements real `/echo_brotli` byte echo with HTTP decoding;
the earlier broader native compression failure from its missing route remains
recorded rather than being relabeled as a pass.

The following independent integration checkpoint passes **861 JavaScript tests
and 53 PureScript Puppeteer assertions**, syntax checks, the strict/pedantic
PureScript build and all13 existing native differential groups. The development
server was restarted and its health endpoint and PureScript example passed.
The [validation record](reference/phase9-integration-validation.json) retains
the exact checks and scoped limitations.

It adds actual classic-script microtask checkpoints and incumbent-realm native
entries, loading/retained-frame writes, DOM serialization, genuine producer
stream consumption, Blob/File messaging across real threads, DOM/SVG values,
CSS media/computed values, Cache and threaded service-worker registration and
lifecycle. Dedicated workers have actual XHR, WebSocket and FileReaderSync
transports. `--experimental-features serviceworker` enables the secure profile;
an actual CLI service worker stores bytes that the page subsequently reads.
Protocol function invocation uses a captured realm intrinsic and private lexical
frame, with synchronous VM execution bounds; it is not a full async deadline.

The [frozen default32 comparison](reference/conformance-phase9-checkpoint.json)
uses unchanged fixtures/harness and the actual iframe/worker flags. Native
passed32; candidate passed31 and timed out on `element/position.html`, which also
reported a scroll-width assertion. The15-second instrumented budget and100ms
settling procedure do not prove source2-second or native performance parity.
All five enabled/disabled/teardown Cache/service-worker profiles pass within
their source-specific budgets, with no missing routes.

The earlier three unobserved stream cases and two messaging failures now pass
in the [six-case recheck](reference/conformance-phase9-candidate-repaired6.json).
Its Request failure used a random server port despite the fixture's hardcoded
9582 requirement; the unchanged same-source [canonical-port recheck](reference/conformance-phase9-candidate-request-canonical.json)
passes. The misconfigured report remains intact. These selected outcomes do not
establish a full455-registration or WPT pass rate. Utility worlds and heap
enumeration remain isolated proposals; layout/SVG, worker network policies,
service-worker interception/updates/persistence and full execution deadlines
remain incomplete.


### Canonical EventCounts dispatch and realms

Canonical EventCounts now counts actual dispatch once before listeners, with Window-owned state for nested dispatch, redispatch, trusted pointer input and real file-input events. Genuine VM fronts and typed live iterators keep private brands and callee-realm results; forEach snapshots counts before calling callbacks and continues after callback failures.

Actual Root:110 full focused tests plus4 selected real-file tests and2 selected clone/transport tests pass, with20 explicitly unselected cases in those two selections. All78 physical creation-context rows pass before/after prototype removal;18 native artifacts and7927 monitored inputs remain unchanged. Original controller runtime:56.059s; separate codec2:12.476s/7934stable inputs.

The original Root controller stopped after110+4 actual passes because it expected Node to report unselected test-name-pattern cases as skipped. Actual TAP correctly reports only the four selected tests. That administrative failure remains immutable. The authoritative supplement verifies its actual outcomes, all78 creation rows and unchanged guards, then executes only the previously unrun codec2 under a separate30s cap. No110/file4 rerun, assertions or original test budgets were changed.

Node24.19 and26.13 each pass9 feature tests and78 physical creation rows. Full Native3 values match on each; full Native4 retains one existing generic Proxy clone-message difference, proved unchanged in the baseline and retained verbatim. No fields are removed to claim equality. Initial Node24.22 firstgate/raw negatives, trusted input/disk comparisons, controllers and frozen patches are preserved in the archive.

This is an eight-leaf change over5adb9b3. It does not establish whole-source, full-suite, broader Performance Timing, WPT or performance equivalence. The latest complete2043/129/13 suite remains the97bb0ac graph. Keep Red Panda branding and every original upstream assertion/budget unchanged. The manifest byte-verifies every archived source/receipt; original paths remain retained.


### Managed written-document lifecycle and inline modules

Already-loaded owned documents now complete genuine written-parser lifecycle work synchronously, preserving measured readystatechange/DOMContentLoaded/load reentry and managed-frame delivery. Actual dependency-free inline modules use real V8 linkRequests/instantiate/evaluate and the existing module cache/Promises before lifecycle completion. No source stripping, synthetic readiness or output filtering is used.

Native7 and candidate7 full values match, including real held bytes, inline-module timing and synthetic-versus-genuine event behavior. Five focused tests passed initially, including actual200ms child interruption and real VM module values; child JSON was asserted by the test, not retained as a fabricated separate transcript/PID claim. Node24.19 and26.13 each pass the same5 cases.

Actual Root passes115 combined module/readiness/reset/frame/parser/classic/checkpoint/dispatch-recovery/error/EventCounts/new-feature tests with zero skips/cancellations/failures in33.228s. RemainingSDK phase:5.557s. Both phases use38.785 of the original shared180 active administrative seconds. Only the actual Root regression phase was run; the earlier owned115 controller remains unrun. All605 composed inputs/18 native artifacts and original assertions/budgets remain unchanged.

The five-leaf integration preserves the EventCounts implementation. Bootstrap/fresh-blank/popup producer paths, import-bearing/mixed module graph timing and the full original Source row96 remain incomplete. The last complete2043/129/13 suite remains the97bb0ac graph. Every archived file is verified byte-for-byte; original raw paths/earlier drafts remain retained. Full independent replication is unfinished; keep Red Panda branding.


### Canonical document encoding, XML birth and qualified names

Document decoding now separates actual BOM/codec decoding from declared document metadata and uses real legacy codecs in canonical special-URL query parsing. Main XHTML receives its genuine HTMLDocument class before the sole wrapper allocation. Valid XML parsing, malformed-XML fallback/error construction, namespace declaration birth, qualified HTML element classes and live query behavior use actual private parser/factory/collection producers. Unprefixed custom-element behavior and nonparticipating namespaces retain their original producers.

Actual R9:126 cases on each of three SDKs (378 passes, no skips), plus23 retained Native comparison groups exactly equal on Node24.22. The current composed Root passes126 primary plus68 lifecycle/module/EventCounts cases (33.106s and17.895s). All615 declared Root inputs,18 native artifacts and10,851 fixed inputs were checked; the unmodified older-base candidate evidence remains separate. No duplicate owned190 run occurred.

The original lifecycle controller expected64 and stopped despite actual68/68 passes. Its administrative failure is retained. A separate static supplement accounts for64 literal and4 genuine data-driven tests, verifies exact names/guards/process cleanup and accepts the actual68 without rerunning tests or editing assertions/budgets. The imported data-case MJS lacked a direct pre-run hash; the supplement explicitly records its immutable79 committed/current-byte and timestamp evidence instead of inventing a pre-run pin. Original expected Native JSON was pinned.

Every earlier contrary remains archived: R3 serialized xmlns mismatch, R5 tag-query/parsererror mismatches, R6 qualified-name heldout mismatch, rejected unrun R7 generic-class draft, R8 CJS startup failure, and the separate R9 correction. The archive byte-verifies all captured raw evidence, source/controllers and patches. Broader first-Window ownership, original Source96, transport timing, complete conformance/WPT and full independent replication remain incomplete. Last complete2043/129/13 suite remains97bb0ac. Keep Red Panda branding and all original fixtures/assertions/budgets.

### HTTP cache, worker events, author tools and semantic commands

The next composed graph installs 51 source/test/reference leaves and six matching
runtime binary/metadata leaves. Its first merged gate passes all 82 behavioral
tests, two integration tests and 46 syntax checks in 39.614 seconds. All 647
candidate inputs, 520 tool inputs and 16 packet inputs stay unchanged; the
pre-application Root remains unchanged during that gate. The full Root workflow
is a separate run; these results do not replace its totals.
[Composition and application evidence](../proposals/feature-composition-final82-r1/README.md).

The optional SQLite HTTP cache shares completed eligible responses across fetch,
scripts, dedicated workers and synchronous XHR. Measured contracts cover fresh
hits, validators and 304 renewal, persistent response bodies, context controls
and soft capacity limits. URL blocking runs before cache lookup. The integration
test verifies that cached fetch and synchronous XHR remain blocked without new
HTTP requests, then resume using the retained body when the policy is cleared.
Expiry, authorization, concurrent writers, corruption and broader service/shared
worker behavior remain incomplete. [Cache evidence](../proposals/http-cache-independent-r5/README.md).

Worker errors use their actual local trusted events, cancellation and rejection
ownership; public V8 error-origin queries identify genuine engine exceptions.
The new worker performance implementation owns each actor's clock, marks,
measures and queued observer delivery. Its original upstream performance fixture
passes within its original budgets with Red Panda identity headers. Separate
SDK evidence verifies actual creation contexts; public prototype similarity is
not treated as realm evidence. Resource entries and complete shared/service
worker performance remain unfinished.
[Worker events](../proposals/worker-network-local-errors-r5/README.md),
[performance](../proposals/worker-performance-r3/README.md), and
[combined native primitives](../proposals/native-worker-webmcp-composition/README.md).

Window ModelContext author tools now have real document-owned callbacks,
registration/removal, cancellation signals and genuine Promise adoption, with
WebMCP CDP events and invocation. They remain distinct from the automation MCP
server. Semantic commands implement the measured `LP.getNodeDetails`,
`LP.detectForms` and `LP.getInteractiveElements` subset over canonical DOM nodes,
without authored getter reads. The second integration test invokes an actual
author callback through synchronous cached XHR, mutates the real DOM and reads
the resulting semantic details and EventCounts. Broader semantic trees,
accessibility, queue timing and callback timeout behavior remain incomplete.
[Author-tool evidence](../proposals/model-context-webmcp-v8/README.md) and
[semantic evidence](../proposals/semantic-automation-r3/README.md).

Initial blank-frame lifecycle delivery captures the actual Window task and
Document-to-Window listener record and preserves owner-VM interruption recovery.
Network-initial delivery is addressed by the later lifecycle section below;
broader Window/document creation ownership remains open. Source96 already
passed the historical 455-fixture census and has a separate regression below.
[Lifecycle evidence](../proposals/blank-frame-initial-lifecycle-r1/README.md).

The independent custom Node provider and matching addon have linked. Identity
and three collision controls passed; proxy reservation hit its original
45-second limit, leaving ten later stages, including C++ controls, unrun.
Browser integration has not run. Red Panda branding remains intentional.
Full independent replication is still unfinished.


### Full validation of the composed feature graph at 917f9bd

At 917f9bd, the installed graph passed all 2,190 JavaScript tests (790.509s), all129
PureScript/Puppeteer checks (11.168s), all13 Native differential groups (22.798s),
syntax checks (24.503s) and strict/pedantic build (1.517s). There are no skipped,
cancelled or failing JavaScript cases. All13,174 guarded source, dependency,
automation, oracle, tool and installed-native inputs match before and after;
every owned stage process is closed. The original commands, assertions and
limits remain unchanged. Runtime warnings are preserved; the strict compiler
reports zero warnings and errors.

[Verified raw evidence](../proposals/feature-composition-full-root-r1/README.md)
contains the controller, original controller/plan, complete logs, progress and
actual input maps, with each archive member checked by name, size and SHA256.
The independent custom Node provider remains unaccepted after the proxy-control
timeout. The separately executed 455-fixture census below supplies its own totals.
Full independent replication, broader realm/Window ownership,
complete conformance/WPT and performance equivalence remain unfinished.

### Complete registered-fixture census at 917f9bd

All455 original registered fixtures ran under their eight original profiles:
415 verified adapted-harness passes,37 assertion failures and3 source-load
timeouts in763.369 seconds, with no unobserved rows, runner errors, setup stops
or integrity stops. All18,088 graph inputs,165 source contracts and six extra
controller inputs matched; exact owned process identities were checked closed,
and ports9582/9584 were released and independently checked again during archival.

Only the disclosed external runner eligibility predicate recognizes Red Panda.
Actual UA/client hints, fixture assertions, resource flags, WS50, original2s load
and fresh2s/8s assertion limits remain unchanged. Literal branding assertions
stay counted failures, and later unexecuted assertions are unverified. The
experimental provider's timeout is negative provenance, not a gate or acceptance
claim for this census using production stock Node24.22.1.

[Verified evidence](../proposals/conformance-917f9bd/README.md) retains all455
reports, complete external logs, before/after guards, actual parent exit0 receipt,
controllers, exact profiles and changed-outcome pairs. Every one of1,446 archive
members passed SHA256/size readback. The historical402/50/3 epoch is unchanged;
paired outcome differences do not establish causes. In particular, the current
audio-context parameter failure led to the separate Native comparison and correction
below; this earlier census was not rerun or reclassified.

[Provider evidence](../proposals/node-provider-r4-linked-controls-incomplete/README.md)
separately preserves every build epoch, addon compile failure, narrow compile-only
correction, real addon build, original45s control timeout and its55-marker
diagnostic. The final marker is before namespace return; it proves neither return
nor adoption completed. V8 source clears the detached context's microtask queue,
consistent with the stall. Subsequent Native observations below cover a bounded
retained-realm prefix. No checkpoint, timeout increase or assertion change was used to force
acceptance. Generic provider controls and real Window/Document/frame integration
remain incomplete.

### Audio automation scheduled in the past

AudioParam now normalizes the seven scheduling/cancellation methods against the
actual context clock. Previously, an implicit `.value` event recorded at a
positive time could outrank a later explicit event requested at time zero.
Native controls show the latter time must be clamped to the actual current time.
The same defect affected suspended contexts, curves, cancellation and real
offline output after a render pause. The clock, DSP math, suspended state and
offline intrinsic-value cache are preserved; no event pruning was added.
Only the observed `setValueAtTime` numeric-conversion order was corrected.

The three-leaf change includes the runtime, six regression tests and their shared
control program. All50 audio tests pass on each of Node24.22.1,24.19.0 and26.13.0
(150 executed cases in distinct epochs). On Node24, eight non-clock control
groups match the retained Native results, and all three unchanged audio source
fixtures pass within their original2s load/fresh2s assertion limits. Fresh Native
heldouts cover suspended clocks, error/conversion priority and duration coercion
that advances the clock. Every raw clock remains recorded.

After exact backed-up application, the installed Root passes50/50 audio tests
in20.225s and the project syntax check in20.972s. All13,176 guarded inputs match,
all18 installed native artifacts remain unchanged, and owned processes close.
[Verified evidence](../proposals/audio-past-time-r2/README.md) preserves the original
415-census failure and both quieter source passes, which exposed the timing
dependence without erasing that failure. No new whole455 score, full2190 workflow
or cross-method invalid-value conversion coverage is inferred.

### Bounded Native retained-realm observations

Active child-realm Promise/import producers fulfilled through both direct and
parent-adoption paths. After actual same-origin child navigation, the three
retained plain Promise producers fulfilled via direct `.then()` while parent
adoption was still pending at each observed0/25/100/500ms checkpoint. That finite
pending observation is neither successful adoption nor proof of permanent
cancellation. The cached-import call then caused Native SIGSEGV; its internal
prefix is unknown and the three later producers did not run.

A separate metadata probe returned the fresh child graph, then produced a Native
JavaScript error specifically at the old `creationDocument.URL` access. This does
not prove blanket rejection of old functions. The earlier combined metadata
probe crashed; its cause is not established by the later getter error. Every
failed setup, crash, unobserved prefix and cleanup receipt remains separate.
The custom provider's original45s timeout and ten unrun stages remain unaccepted;
these observations do not justify restoring every detached queue.

Capture-only initial-load controls also pass six syntax checks and six actual
cases, including genuine200ms recovery. They prove private queue/Promise callback
identities and restoration, not a lifecycle fix. Native HTML/XHTML/XML/malformed
XML frames share the measured readiness/DCL/Window-load/pageshow sequence with
no Document load; all four reported HTMLDocument wrappers. Those bounded facts
do not establish other parser/class behavior. The later initial-network
implementation below uses those observations; genuine Window/global indexed
interception remains unfinished.

### Initial network lifecycle and blocking frame completion

Initial network documents now deliver readiness, DOMContentLoaded, Window load
and pageshow from the real parser and resource queues. The runtime claims the
Window's original construction task before author scripts run and follows the
actual defer/async milestones. Public Document load events cannot complete a
held resource or resolve a frame's load Promise. Navigation timing reads the
canonical Document backend instead of an overridden frontend getter.

Parser-blocking HTTP frames retain their original load Promise while parsing
is paused, then consume the real pending close request when that parser reaches
EOF. A script's later document.close() remains effective. Retirement invalidates
pending resource callbacks without disabling retained DOM queries, functions
or newly scheduled timers. Already-entered asynchronous callbacks remain outside
that cancellation guarantee. General readiness/DCL interruption, private
tampering, broader transport failures and XML parser/class parity remain bounded
gaps.

The correction passes 77 related whole-file cases on Node 24.22.1 and ten new
lifecycle/retirement cases on each of Node 24.19.0 and 26.13.0. The unchanged
document/open_load_events.html fixture passes separately with a 485 ms load
barrier and fresh 5 ms assertions inside its original 2s + 2s limits. Its five
script IDs are declarations, not five independently counted observations.
This is a regression check: the same fixture already passed the 917f9bd census.
The installed PureScript/Puppeteer example passes with 13,187 inputs unchanged.

The installed654 lifecycle checkpoint passed 2,206 JavaScript cases in 838.205s,
129 PureScript checks in 10.038s, 13 Native groups in 20.553s, syntax in 24.617s
and strict/pedantic build in 1.263s. JavaScript reports no failures, skips,
cancellations or late activity. All 13,430 JavaScript inputs and 13,451 remaining
workflow inputs stay unchanged; every owned job closes and the service retains
its actual identity. [Evidence](../proposals/initial-network-lifecycle-r5/README.md)
preserves the earlier installed652 animation timeout at its original 10s limit
and subsequent interruption. The post-signal cancellation summary is not a
full-suite total. The corrected installed654 run has its own complete result;
application journals retain their original validation-unrun labels.

### Large stylesheet canonical programs

Untouched deferred rules now supply immutable normalized scalar declarations to
the private render program through the existing declaration parser and bounded
cache. Compiling that program leaves public rules, declarations and backing maps
lazy. Already materialized styles still read their real private state, and the
existing sheet revision and canonical snapshot invalidation boundaries remain.

The unchanged `css/external_stylesheet.html` fixture passes at its original 2s
load plus fresh 2s assertion limits. Node 24.22.1 observed 930ms load and 6ms
assertions; the separate 24.19.0 and 26.13.0 runs observed 760ms/7ms and 745ms/3ms.
Five focused cases and 30 existing CSS cases pass on each tested SDK. These are
separate observed epochs, not a future timing guarantee or a new census score.

The installed655 workflow passes 2,211 JavaScript cases in 857.314s, 129
PureScript checks in 13.078s, 13 reference groups in 25.851s, syntax in 22.095s
and strict/pedantic compilation in 1.256s with zero warnings and errors.
All 13,260/13,261 workflow inputs remain unchanged and all owned jobs close.
[Evidence](../proposals/canonical-style-scalar-r2/README.md) preserves the earlier
diagnostic timeout and span-accounting failure, the separate accounting
supplement, and the first focused run's incorrect inline-test precondition.
No original fixture, assertion or deadline was relaxed.

### Experimental public-carrier API prerequisites

The custom Node experiment now has separate passing build, defined-export,
four passive authority, one heap-observer and five fresh-entry groups. It
preserves the original eight-GC bound and measures actual creation Contexts
before and after null prototypes. The earlier compiler-dependency setup failure
and detached-async negatives remain recorded.
[Evidence](../proposals/node-provider-r5-api-prerequisites/README.md) applies to
Linux x64 custom Node 24.22.1; it is not production browser, retained-old-JavaScript,
all-SDK or performance acceptance. Public V8 Holder() is a version-pinned,
deprecated candidate for real indexed-callback owner lookup; its callback
behavior remains untested.

Separate [namespace checks](../proposals/node-provider-namespace-prerequisites-r7/README.md)
pass two C++ and three JavaScript cases. The later
[observer-storage diagnostic](../proposals/node-provider-gc-observer-diagnostic-r1/README.md)
reports seven cases, six passes and one failure: all five provider/authority
cases and the ordinary heap observer pass, while the ordinary stack observer
fails. This supports sensitivity to observer storage and conservative stack
roots; it does not prove a permanent leak or full provider acceptance.
