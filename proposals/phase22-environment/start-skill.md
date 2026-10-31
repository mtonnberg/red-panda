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

Pushed checkpoint dacebc3377c4057fb56e0f628be28b6494de6d7c passes1854 JavaScript tests,100 PureScript Puppeteer checks,13 Native differential groups, syntax and strict/pedantic PureScript builds. docs/reference/phase22-integration/validation.json identifies the actual112-leaf runtime/test/bin/PS delta and12423 unchanged monitored inputs. Commands: npmtest728.92s, Native23.01s, syntax22.02s, strict1.34s. Raw epochs are in proposals/phase22-integration/root-final-validation. Earlier rejected full epochs remain preserved; intermittent audio and CLI failures were not retrospectively relabeled or assigned an unproved cause. Diagnostic wrappers now retain collected assertion/pipe errors without changing their deadlines.

The checkpoint implements actual viewport/scroll state and trusted task delivery, private Target backing, Worker/utility Fetch and messaging, joint history/Navigation/form targets, reload/cancellation, actual Location construction/navigation, additional genuine VM form interfaces and Option aliases. Document load completes independently of suspended module evaluation; PureScript explicitly waits for the real module result. Internal scroll delivery shares the cancellable Window timer checkpoint. SyncHTTP starts its real thread at first validated synchronous dispatch. Worker bootstrap and duplicate CLI pre-exec imports were reduced, with actual mechanism/cost evidence, not a general Native performance-parity claim.

Focused checks pass each prepared SDK: viewport/stream recovery39, positive Window task/messaging54 and scroll checkpoint/consumers60. The existing saved-script CLI case (3 original child commands, unchanged15000ms deadline) also passes24.19/26 with7079 inputs unchanged;24.22 passes in the full suite. Earlier private original104 composition passes264 checks per SDK and63/63 Native/candidate unchanged source fixtures with9129 stable inputs. Its actual2s load plus fresh2/8s assertion budgets are preserved; that source result is NOT execution of the later112-leaf graph. Historical full455 candidate results remain338pass/98assertionfail/18loadtimeout/1unsupported-image-option; curated positives never rewrite them.

Full independent replication remains incomplete. Native MQL/private viewport semantics, zero-delay scheduling, literal Lightpanda client-hint identity, genuine Window/Document/module boundaries and broader network/layout/media/isolation/performance still differ. Retain Red Panda identity pending user direction. Public V8 owned contexts do not provide Node's private Contextify/ModuleWrap callback contracts; optional future kernel/module proposals are unrun and not production. Do not fake creation provenance through prototype/name/result filtering or change actual Source/Native/API/assertion budgets to make checks pass.

Read README.md, docs/COMPATIBILITY.md and exact manifests before implementing more. Future phase23 Attr/CSS/focus/text-decoration, Cookie ingress and genuine interface definitions are statically composed in an owned copy (31paths) and explicitly UNRUN/unapplied at this snapshot. Other clone/UA/Pointer/owned-context packets also remain separate. A proposal's presence or old isolated success does not establish combined production support. Preserve all previous failed epochs and before/after hash boundaries.

Serialize runtime, native-build, browser/network, heap and deadline-sensitive validation jobs. Do not overlap them across agents; static inspection can continue. Use checks appropriate to changes and retain actual executable/source identities. Never weaken assertions, invent passing outcomes or silently extend production/reference time budgets.

Before starting a service, request http://127.0.0.1:9222/json/version internally. Reuse only a matching task-owned service with current source; restart owned services after runtime changes. If another service owns the port, leave it running and use a free port with RED_PANDA_CDP. Verify owned PID/argv/startTicks before signaling; terminal interruption alone may leave a process running. Live processes, connections and cookie/storage state do not survive restoration. Start in a long-running TTY:
exec node --experimental-vm-modules bin/red-panda.js serve

Default127.0.0.1:9222. From another initialized shell:
curl --fail --silent http://127.0.0.1:9222/health
npm run example:puppeteer

The self-contained PureScript example must print HTTP200 — Red Panda demo and the example.com link. RED_PANDA_CDP overrides the endpoint; RED_PANDA_URL is optional and must be a trusted permitted site. Do not present localhost links as previews. The onboarding service at pushed dacebc3 was restarted after exact prior-PID verification; health and actual example pass,6824 runtime/dependency inputs unchanged and tracked runtime clean. This instance proof does not establish fresh-task restoration.

Validation after changes:
npm run check
npm run build:automation -- --strict --pedantic-packages
npm test

Tests own their local fixture/CDP servers. Preserve all proxy bypasses and rendering dependencies. npm run prepare:reference verifies the pinned short-ref archive,574 HTML fixtures and original assertion harness in ignored .cache/lightpanda-reference, retaining upstream licenses. It is test-only. Optional official Native binary:
/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux
SHA256 9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f
npm run test:reference -- /workspace/shared/lightpanda-reference/lightpanda-x86_64-linux

All13 bounded groups pass at dacebc3. Complete frozen Native-only455/eight-profile epoch has451 verified passes and4 separately classified nonpasses with corrected replays where observed. Keep canonical9582/9584 exclusive for exact-profile runs. Full engine equivalence remains unfinished.

Completed whole-workspace repository discovery at dacebc3:93 Git roots,1549 directory links,1 project+89 dependency/cache/empty roots+3 verified unborn no-remote task-validation copies;0unknown/errors/outside links. Only project membership is github.com mtonnberg/red-panda mounted red-panda at exact pushed dacebc3377c4057fb56e0f628be28b6494de6d7c. Discovery proof .cache/validation/phase22-onboarding/repository-discovery.json.

Saving this draft does not execute scripts, apply configuration or publish it. Review and save changes in environment settings, then publish through the product when desired. Fresh-task restoration has not been independently verified.

