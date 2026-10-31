Use the existing checkout at /workspace/red-panda. Every cloud task is already isolated; do not create a Git worktree unless the user explicitly requests one.

Initialize shells:
export PATH=/workspace/shared/red-panda-render/bin:/workspace/shared/rea-tools/node_modules/.bin:$PATH
export NPM_CONFIG_CACHE=/workspace/shared/npm-cache
export NODE_USE_ENV_PROXY=1
export NO_PROXY="${NO_PROXY:+$NO_PROXY,}${no_proxy:+$no_proxy,}0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]"
export no_proxy="$NO_PROXY"
cd /workspace/red-panda

Prepared tooling: Node24.22.1 and REA6.8.0 in /workspace/shared/rea-tools; PureScript0.15.16, Spago1.0.5 and Puppeteer25.16 are pinned. Spago uses its checked-in lockfile with --pure. Preserve the managed proxy/CA configuration, TLS verification and artifact checksums. Local fixture addresses above must bypass the proxy. Existing HTTPS Git proxy authentication works; no extra credentials or network domains are needed.

Use the saved install script to refresh dependencies, checksum-verified test-only references, all THREE native bindings, the Python renderer and strict PureScript build. Setup must leave application source, tests, dependencies and lockfiles unchanged; explicitly requested coding tasks can implement changes. Do not overwrite pre-existing SVG/microtask artifacts or unrelated work.

Red Panda is an independent Node/V8/jsdom browser implementation. It imports no Lightpanda production engine and launches no Chromium. PureScript owns Puppeteer automation and resource lifetimes; JS FFI adapts actual Puppeteer operations. Pages must be trusted: jsdom is not a security sandbox. Keep CDP on loopback. CLI enables VM modules by same-PID execve before importing the browser graph; embedding requires node --experimental-vm-modules.

Native bindings must match the executable actually running Red Panda: Node/V8/ABI/platform and source/binary digests are checked. Matching SDK headers and g++ C++20 are required. Prepared artifacts cover Node24.19.0,24.22.1 and26.13.0, all three collection/runtime/heap-query bindings (18 binary/metadata artifacts). Current production source SHA256:
collections.cc 7f0f994d3faa25c80148de82610a6eaeec2d453d49932dc113b3879c0db0a311
runtime.cc cb235f736c7ab4171543d29f6a7278c1c895f35785d001ed2115e43b3c3bedd6
heap-query.cc 63522a3439e4e05e99798f8579d61b5c599c178324caf2f16012b3051ead1a8c
Later isolated owned-context C++ proposals are not production. Rebuild after changing native source or runtime. npm run build:native uses the active Node; for another SDK invoke its exact node native/build.mjs, then validate using that same executable. Other prepared executables:
/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node
/workspace/shared/node26/node_modules/node/bin/node

The Python3.12 venv /workspace/shared/red-panda-render retains hash-pinned Pillow/ReportLab/fonttools and the PyMuPDF test inspector. Fixed DejaVu Sans/Mono fonts including oblique faces are required. Real glyph/raster/PDF tests have passed; do not replace those checks with backend metadata alone.

The latest full-suite checkpoint78dbea872990db066747a3f17431de49a5fb4135 passes1906 JavaScript tests,100 PureScript Puppeteer checks,13 Native differential groups, syntax and strict/pedantic PureScript builds. docs/reference/phase23-integration/validation.json binds the actual39-leaf delta and13487 unchanged monitored inputs. Fullnpmtest726.93s, Native22.85s, syntax20.41s, strict1.26s. Rawcorrectedepoch proposals/phase23-root-full-corrected. The first1902-case run passed1899/failed3 Range geometry poison controls, with13417 stable inputs; Native/syntax/strict passed and PureScript was unrun after protocol failure. That rejected epoch remains immutable.

The correction keeps genuine VM public Node/Element/HTMLElement and Document definitions while71 conversion-private argument-array allocations use real Host arrays. Original Range public array assertions are unchanged. Actual public VM function and private Host array provenance remain true after prototype null. Two runtime modules, two explicit source-pin expectations and four new semantic cases changed; all94 focused tests plus9direct controls pass EACH24.19/24.22/26. All source/dependency/native artifact bounds are in the receipts; no query/name/prototype filtering or fake realm origin is used.

The checkpoint integrates Attr subtree/shadow/template ownership before adoption callbacks; bounded CSS defaults, text decoration and private focus/style owner state; genuine manual element and Document public functions; and CDP cookie validation/atomic prevalidation/session/deletion semantics using the real CookieJar. Whole Native75 matches; the unchanged320 matrix keeps65 known differences/no newpaths and three authored owner controls match completely. Earlier corrected31 SDK matrix190each+117value physical probes stayed12354stable;87 oldHost slots becameVM and30 alreadyVM slots remainVM. Those scoped epochs are not relabeled as the final39graph.

CDP metadata follows actual store/context history: site insertion and path/creation order, Network.getAllCookies, full getter schema without unsupported priority, context-created loaded state/solecontext default alias, persistence aftertargetclose and unloadondispose; attached valid-session Storage GET routes to its actualcontext. All43 complete Native protocolpayload rows match with no cookie fields filtered/sorted in comparison. Metadata focused21eachall3 passed6849stable; portablehelper5Node24 separately passed after conditional optionalNativeSHA provenance-only change. Generic cookie imports/exports, CLI and unrelated HTTP policy remain unchanged. Actual synchronous MemoryStore callbacks and original Promise identities are preserved; failed diagnostic/race epochs remain recorded. Cookie writes include measured empty-name, negative/session and zero/deletion behavior; seven final cookie cases pass eachall3. Generic params-array Native connection-close versus Root protocolerror stays a separate known boundary.

Earlier original104 private composition passes264 checks eachSDK and63/63 Native/candidate unchangedsource fixtures with9129stable and original2sload+fresh2/8sassert budgets. Those source results are not final39 execution. Historical full455 candidate remains338pass/98assertionfail/18loadtimeout/1unsupported-image-option; curatedpositives never rewrite it. Broad independent replication is still unfinished.

Full independent replication remains incomplete. Native MQL/private viewport semantics, zero-delay scheduling, genuine Window/Document/module boundaries and broader CDP/network/layout/media/isolation/performance still differ. The user explicitly requires Red Panda branding in browser identity and client hints. Preserve that branding; the unchanged upstream literal Lightpanda-name expectation is an intentional identity difference, not itself a missing functional capability. Do not claim that literal fixture passes or that its unexecuted later assertions are verified. Public V8 owned contexts do not provide Node's private Contextify/ModuleWrap callback contracts; optional future kernel/module proposals are unrun and not production. Do not fake creation provenance through prototype/name/result filtering or change actual Source/Native/API/assertion budgets to make checks pass.

Read README.md, docs/COMPATIBILITY.md and exact manifests before more work. The previously isolated phase23 Attr/CSS/focus/text-decoration, Cookie ingress and genuine interface definitions are now integrated and fully regression-tested at78dbea8. Exact CDP lifecycle dispatch is now integrated at92908b9. Cookie delete/clear/attached SET, Page/dialog, permission/geolocation, binary body/post-data/limits/cache/Fetch/download, trusted input/semantic tools and wider runtime modules remain next. Static inventory /workspace/shared/cdp-gap-inventory-handoff/static1 traces206 Native commands. Its deferred lifecycle implementation is superseded by the corrected two-file dispatch packet in proposals/phase24-domain-dispatch/evidence-packet. Other clone/UA/Pointer/owned-context packets stay separate. A proposal's presence is not production acceptance. Preserve failed epochs and exact source/hash boundaries.

Serialize runtime, native-build, browser/network, heap and deadline-sensitive validation jobs. Do not overlap them across agents; static inspection can continue. Use checks appropriate to changes and retain actual executable/source identities. Never weaken assertions, invent passing outcomes or silently extend production/reference time budgets.

Before starting a service, request http://127.0.0.1:9222/json/version internally. Reuse only a matching task-owned service with current source; restart owned services after runtime changes. If another service owns the port, leave it running and use a free port with RED_PANDA_CDP. Verify owned PID/argv/startTicks before signaling; terminal interruption alone may leave a process running. Live processes, connections and cookie/storage state do not survive restoration. Start in a long-running TTY:
exec node --experimental-vm-modules bin/red-panda.js serve

Default127.0.0.1:9222. From another initialized shell:
curl --fail --silent http://127.0.0.1:9222/health
npm run example:puppeteer

The self-contained PureScript example must print HTTP200 — Red Panda demo and the example.com link. RED_PANDA_CDP overrides the endpoint; RED_PANDA_URL is optional and must be a trusted permitted site. Do not present localhost links as previews. The onboarding service at pushed92908b9 was restarted after exact priorPID/argv/startTicks verification; health and actual PureScript example pass,6832 runtime/dependency inputs unchanged and tracked runtime clean. This instance proof does not establish fresh-task restoration.

Validation after changes:
npm run check
npm run build:automation -- --strict --pedantic-packages
npm test

Tests own their local fixture/CDP servers. Preserve all proxy bypasses and rendering dependencies. npm run prepare:reference verifies the pinned short-ref archive,574 HTML fixtures and original assertion harness in ignored .cache/lightpanda-reference, retaining upstream licenses. It is test-only. Optional official Native binary:
/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux
SHA256 9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f
npm run test:reference -- /workspace/shared/lightpanda-reference/lightpanda-x86_64-linux

All13 bounded groups pass at78dbea8. Complete frozen Native-only455/eight-profile epoch has451 verified passes and4 separately classified nonpasses with corrected replays where observed. Keep canonical9582/9584 exclusive for exact-profile runs. Full engine equivalence remains unfinished.

Completed whole-workspace repository discovery at92908b9:177 Git roots,1574 directory links,1 project+173 dependency/cache/empty roots+3 verified unborn no-remote task-validation copies;0unknown/errors/outside links. The84 additional roots are copied PureScript dependency Git caches in the owned dispatch-validation copy; actual full HEADs and sanitized remote identities match the original dependency caches. Only project membership is github.com mtonnberg/red-panda mounted red-panda at exact pushed92908b9d94a9f0b083afa99deb777ed01aa269d5. Discovery proof .cache/validation/phase24-onboarding/repository-discovery.json.

Saving this draft does not execute scripts, apply configuration or publish it. Review and save changes in environment settings, then publish through the product when desired. Fresh-task restoration has not been independently verified.

Latest pushed commit92908b9d94a9f0b083afa99deb777ed01aa269d5 narrows Session lifecycle dispatch to exact known enable/disable names and makes explicit known disables idempotent. Malformed nested names no longer mutate Network event state. Existing Runtime cleanup executes only while enabled; substantive DOM routing and known extensions stay explicit. Actual Native three-document HTTP controls and the corrected candidate both show Network events OFF/ON/OFF; original wrong-state/error payloads are retained. Final25 focused cases pass each24.19/24.22/26.13; unchanged compiled PureScript100 passes24.22. Fresh Root25 passes with8339 monitored inputs unchanged and syntax passes. This is a scoped increment over the prior1906 full suite; no full1909 claim is made. Packet proposals/phase24-domain-dispatch; exact patch96fa23fb90f4c41b9c5a71732df32eaf48d11f11c8c8f4a18ce963a8dd4f1f52. Health plus actual PureScript example pass at92908b9 with6832 stable inputs and tracked runtime clean. Cookie deletion/clear/attached-write Native-first controls are a separate ongoing tranche, not merged acceptance. Branding remains Red Panda by explicit user decision.
