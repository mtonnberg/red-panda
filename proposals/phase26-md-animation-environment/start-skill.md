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

Current pushed project commit: d41fd69740fd5d13d41ab99143b20b89cc032d9b on work. The ongoing task is full independent Lightpanda Browser functionality in Red Panda, not a Lightpanda engine fork. Keep Red Panda product/UA/client-hint branding by explicit user decision. PureScript owns Puppeteer workflows and resource lifetimes; JS FFI only adapts actual operations. Commits and pushes for this ongoing implementation task are authorized. Do not call a bounded milestone complete replication.

Latest combined validation at d41fd69: 1,992 JavaScript cases,117 actual PureScript Puppeteer checks,13 Native differential groups, syntax and strict/pedantic builds all pass;10,016 monitored inputs unchanged. Frozen commands/raw logs/resource snapshots and exact27 runtime/test/reference leaves over48380c5 are in proposals/phase26-full-accepted. This full run used Node24.22.1. Separate selected Markdown98 and animation32 checks pass on each of24.19/24.22/26.13; each Markdown SDK ran5+93 separate epochs, first animation SDK4+28. Do not turn selected cross-SDK checks into a whole-suite-on-every-SDK claim.

Earlier implemented features still include: real cookie delete/clear/attached writes and UTF-8 HTTP cookie transport; context-owned one-shot JavaScript dialogs with genuine native entry fronts; actual thrown-value handles; Page close/stop with genuine cancellation and received-prefix completion; canonical-node LP.version/getMarkdown aliases; actual permissions/geolocation state and genuine VM values; bounded retained response/POST bytes and eviction; typed PureScript permissions/geolocation, complete-Cookie deletion and response bytes.

Current animation composition captures the private Window task queue, resolves the actual finished Promise, drains genuine V8 jobs in its owning timed VM task, then directly dispatches automatic finish. Explicit finish/cancel remain queued. Native7 whole producer/reaction objects and6 causal timing projections match, including finish after actual frame removal. Real200ms infinite event/Promise callbacks recover, retain future actual checkpoint flags/order/query and close. External-init and explicit legacy Host-JSDOM Promise modes still exit1 with real Node async-hook corruption; hooks remain enabled in those negatives. The exact original four-case diagnostic has4case passes plus1file-level poisoned-timer teardown failure. All old R3/default-hook/minimal-node failures stay immutable; no private async-hook reset, Promise.then rewrite or fake flags.

Historical failures stay separate: the first 37-leaf full run passed 1,951/1,954, failing animation detail, the first AudioData native heap scan and a CLI child timeout. The queue inversion has genuine causal evidence; heap/CLI causes remain unexplained even though narrow/whole-file diagnostics and the new full run pass. The first ambient Node26 timing probe hit its original 20 s outer cap; later canonical stage traces and original28 pass. Do not relabel a timeout or infer an environment cause without evidence. Prior full 1,906/100/13 and Source63/private104 checkpoints remain historical distinct graphs.

Full independent replication is unfinished. Read README.md, docs/COMPATIBILITY.md and exact manifests. Current open areas include full private author-style/slot Markdown and public CSSOM identity, genuine File/FileList first birth and disk upload, full CDP/CLI transport/cache/Fetch/download/input/semantic tools, reusable Window/Document/module authority, complete Promise interruption, broader layout/media/worker isolation, WPT and performance. The unchanged upstream literal Lightpanda-name assertion is intentional branding divergence; retain its failure and do not claim later unexecuted assertions passed.

The prerequisite48380c5 changed Promise rejection attribution to authentic V8 creation-context equality through the existing native binding, never public Promise prototype chains or reusable proxy identity. All21 focused attribution/error checks pass on each prepared SDK, plus100 separate existing regressions and49 main-checkout error/animation/lifecycle checks. The latter exited0 with49/49,8536stable; controller TAP-prefix accounting rejection is preserved with a separate actual spec-reporter supplement. That focused milestone did not claim a fresh full suite; the new1992 combined graph above is separately verified. Keep all raw epochs in proposals/promise-attribution-authority. Normal VMWindows no longer enable the unnecessary init-only ownership hook; explicit Host-JSDOM installs retain conditional birth observation. External/legacy init-hook interruption and Native late-handler routing remain gaps. This is an ownership fix, not disabling ownership to force recovery.

Canonical private author-style Markdown V5 is now production in d41fd69: actual source Document style authority, main render-context URLs, genuine inactive/adopted documents, measured assigned-plus-fallback slots and paragraph boundaries. Native common declaration/Node poison reads0 on the FIRST LP call; unsupported Native legacy declaration Map is UNEXERCISED, while a candidate-only genuineMap-shadow control is EXERCISED. Public CSSOM identity/text mutation, complex selectors and broader shadow formatting remain incomplete. No authored getters, DOM clones or canned rendered outputs supply producer state. Read proposals/lp-private-author-style and preserve all rejected/setup epochs.

File-input and utility DataTransfer candidates are NOT production. Disk-input R2 passed17 focused plus Native access/iterator/constructor/20core comparisons and physical VM File/FileList checks; legacy constructors are Host. R3 adds actual200ms captured VM watchdog but leaks dispatch state on interruption. R4 genuine pinned dispatch recovery is source-only and awaits7 recovery modes plus normal goldens; errors-reporting depth may need a real private participant. Puppeteer nonempty upload uses the protocol; empty upload uses actual utility DataTransfer and authored untrusted events. Native utility exposure/local4 and later7same-backend profiles are positive; ordinary cross-world object arguments are genuinely rejected. Utility factory and PureScript12 new assertions (conditional129) are unbuilt/unmerged. Do not bypass the real empty client branch or retarget already-born fronts.

Network.setBlockedURLs remains unimplemented. Native first probe observed schema/atomicity and actual fetch/script blocking, then stopped at TargetAlreadyLoaded before document/pattern/redirect/worker/ownership phases. Preserve partial epoch; use genuine one-context/one-target per connection setup for continuation and MEASURE connection policy scope, not assume shared service ownership.

The official complete Node24.22.1 source archive was checksum-verified and acquired at /workspace/shared/node-provider-source-v24.22.1. A genuine Contextify carrier/per-context traced Value/HDO provider source prototype is uncompiled/uninstalled. Static R1 review found pending-ticket and public-proxy ordinary-contextification rooting collisions; R2 fixes the first, R3 shared weak reservations across simultaneously live IsolateData are in progress. Continuous-IsolateData lifetime is an explicit prototype precondition. Preserve immutable R1/R2 and peer reviews; do not build/promote known unsafe R1. It imports no Lightpanda engine. Runtime/toolchain, GC, snapshots and cross-token Promise handling remain unproved. Never rebrand contexts, pin Promise constructors, replace isolate hooks without ownership/delegation, reset private async-hook registries, retarget public wrappers or filter genuine heap results to imitate provenance.

For commits in this task use the established public identity through per-command Git options: -c user.name='M T' -c user.email='mtonnberg@users.noreply.github.com'. Preserve global user settings; the default private address is rejected by GitHub privacy protection.

Historical complete registered-fixture census uses 455 fixtures under eight exact registration profiles, not a uniform runner. Native:451 verified passes and four separately classified nonpasses. Historical candidate:338 pass/98 assertion failure/18 load timeout/1 unsupported-image-option at its own old graph. Later curated63/63 are not a current455 score. Fresh exact-profile plans are in proposals/phase25-remaining-static; current full455 and WPT remain unrun. Next adapted455 plan is /workspace/shared/registration455-adapted-plan-20261031: freeze exact pushed d41fd69, then run serially only under a runtime lease. It preserves real Red Panda UA/client hints and every fixture assertion; only external testing.js runner eligibility recognizes RedPanda alongside Lightpanda. Literal branding stays a counted nonpass. No temporary UA override is allowed for this new census. Preserve source load2s plus fresh2/8s assertion budgets and explicit resources/preload/features. HtmlRunner's global WS50 can be requested, but TLS/UA/watchdog global mismatches must stay explicit.

Serialize runtime, native-build, browser/network, heap and deadline-sensitive validation jobs across agents. Static independent inspection may continue. Use the REA skill at /workspace/shared/rea-tools/node_modules/rea-agents/skills/reverse-engineer-anything/SKILL.md for relevant target/runtime questions. Never weaken original Source/Native/API/assertion/heap budgets, fabricate output/provenance, or turn truncated results into success.

Service startup: inspect http://127.0.0.1:9222/json/version internally. Reuse only a matching task-owned current-source service; restart owned services after runtime changes. Verify saved PID/argv/startTicks before signaling. If another service owns the port, leave it running and use a free port with RED_PANDA_CDP. Live processes/connections/storage do not survive restoration. Start in a long-running TTY:
exec node --experimental-vm-modules bin/red-panda.js serve

From another initialized shell:
curl --fail --silent http://127.0.0.1:9222/health
npm run example:puppeteer

The self-contained example must print HTTP 200 — Red Panda demo and ["https://example.com/"]. RED_PANDA_CDP selects another endpoint; RED_PANDA_URL is optional and must be a trusted permitted site. Do not present localhost as a preview. The exact owned prior service was stopped after PID/argv/startTicks verification; the new service at pushedd41fd69 passes health and the actual PureScript example with6,843 unchanged inputs and tracked runtime clean. Proof .cache/validation/phase26-md-animation-environment. This is current-instance evidence, not fresh-task restoration.

Validation after code changes:
npm run check
npm run build:automation -- --strict --pedantic-packages
npm test

Tests own their local fixture/CDP servers. Preserve all proxy bypasses and rendering dependencies. npm run prepare:reference verifies the pinned short-ref archive,574 HTML fixtures and original assertion harness in ignored .cache/lightpanda-reference, retaining upstream licenses. It is test-only. Optional official Native binary:
/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux
SHA256 9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f
npm run test:reference -- /workspace/shared/lightpanda-reference/lightpanda-x86_64-linux

Fresh whole-workspace discovery atd41fd69:263 Git roots,1,646 directory links, one project,259 dependency/cache/empty roots and three verified unborn no-remote validation copies; zero unknowns/errors/outside links. The86 newly copied PureScript dependency/registry caches match original full HEADs and sanitized remotes. Sole project membership: github.com mtonnberg/red-panda, relative mount red-panda, exact pushed commitd41fd69740fd5d13d41ab99143b20b89cc032d9b. Discovery proof .cache/validation/phase26-md-animation-environment/repository-discovery.json.

Saving this draft does not execute scripts, apply configuration or publish it. Review and save changes in environment settings, then publish through the product when desired. Fresh-task restoration has not been independently verified.

