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

Current pushed project commit: 92a6c3891798bdc02e3be07490df0ddab75b42b8 on work. The ongoing task is full independent Lightpanda Browser functionality in Red Panda, not a Lightpanda engine fork. Keep Red Panda product/UA/client-hint branding by explicit user decision. PureScript owns Puppeteer workflows and resource lifetimes; JS FFI only adapts actual operations. Commits and pushes for this ongoing implementation task are authorized. Do not call a bounded milestone complete replication.

Latest combined validation at this exact 44-code-leaf graph: 1,956 JavaScript cases, 117 actual PureScript Puppeteer checks, 13 Native differential groups, syntax and strict/pedantic builds all pass; 9,995 monitored inputs unchanged. Frozen commands/raw output/source composition: proposals/phase25-full-accepted. The 43 new feature cases passed separately on Node24.19/24.22/26.13; the 28 affected animation scheduling checks also passed on all three SDKs. Do not describe the whole 1,956-case suite as executed on all three SDKs.

Implemented increment: real cookie delete/clear/attached writes and UTF-8 HTTP cookie transport; context-owned one-shot JavaScript dialogs with genuine native entry fronts; actual thrown-value handles; Page close/stop with genuine cancellation and received-prefix completion; canonical-node LP.version/getMarkdown aliases; actual permissions/geolocation state and genuine VM values; bounded retained response/POST bytes and eviction; typed PureScript permissions/geolocation, complete-Cookie deletion and response bytes.

The safe animation increment captures the actual private Window queue after lifecycle initialization. Original finish/play/0-delay event code is unchanged. Six controlled state projections match. Six of seven whole Native producer/lifetime objects match; finish after actual iframe removal is still missing. A rejected direct-dispatch/native-checkpoint experiment matched ordinary semantics but crashed Node async hooks when a real 200 ms Promise reaction was interrupted. It is not production. Retain proposals/animation-scheduling-recovery and all failed epochs; do not ship that rejected patch or disable ownership hooks to force recovery.

Historical failures stay separate: the first 37-leaf full run passed 1,951/1,954, failing animation detail, the first AudioData native heap scan and a CLI child timeout. The queue inversion has genuine causal evidence; heap/CLI causes remain unexplained even though narrow/whole-file diagnostics and the new full run pass. The first ambient Node26 timing probe hit its original 20 s outer cap; later canonical stage traces and original28 pass. Do not relabel a timeout or infer an environment cause without evidence. Prior full 1,906/100/13 and Source63/private104 checkpoints remain historical distinct graphs.

Full independent replication is unfinished. Read README.md, docs/COMPATIBILITY.md and exact manifests. Current open areas include full private author-style/slot Markdown and public CSSOM identity, genuine File/FileList first birth and disk upload, full CDP/CLI transport/cache/Fetch/download/input/semantic tools, reusable Window/Document/module authority, complete Promise interruption, broader layout/media/worker isolation, WPT and performance. The unchanged upstream literal Lightpanda-name assertion is intentional branding divergence; retain its failure and do not claim later unexecuted assertions passed.

Current isolated style and file-input candidates are not production and retain their exact older bases. Do not copy their Browser/CDP files over this commit. Compose explicit verified deltas and validate the combined graph. The private style bridge has earlier real negative/positive epochs; V3 remains unrun. File-input Native20/baseline20 plus first-access8 establish real bytes/atomicity and nominal realm behavior; its candidate and extra Native access-path6/12 focused controls remain unrun. Native nominal prototype evidence is not physical V8 creation proof.

Future owned-context/provider designs are unimplemented. Public V8 owned contexts do not supply genuine Node Contextify/ModuleWrap registration. A cooperative Node source extension with a unique genuine per-document carrier and a traced per-Context wrapper/HDO anchor is a static project-runtime option, not an installed capability. Exact reserved slots, snapshots, GC and cross-token Promise handling require proof. Never rebrand contexts, pin Promise constructors, replace isolate hooks without exact ownership/delegation, reset private async-hook registries, retarget public wrappers or filter genuine heap results to imitate creation provenance.

Historical complete registered-fixture census uses 455 fixtures under eight exact registration profiles, not a uniform runner. Native:451 verified passes and four separately classified nonpasses. Historical candidate:338 pass/98 assertion failure/18 load timeout/1 unsupported-image-option at its own old graph. Later curated63/63 are not a current455 score. Fresh exact-profile plans are in proposals/phase25-remaining-static; current full455 and WPT remain unrun. Preserve source load2s plus fresh2/8s assertion budgets and explicit resources/preload/features. HtmlRunner's global WS50 can be requested, but TLS/UA/watchdog global mismatches must stay explicit.

Serialize runtime, native-build, browser/network, heap and deadline-sensitive validation jobs across agents. Static independent inspection may continue. Use the REA skill at /workspace/shared/rea-tools/node_modules/rea-agents/skills/reverse-engineer-anything/SKILL.md for relevant target/runtime questions. Never weaken original Source/Native/API/assertion/heap budgets, fabricate output/provenance, or turn truncated results into success.

Service startup: inspect http://127.0.0.1:9222/json/version internally. Reuse only a matching task-owned current-source service; restart owned services after runtime changes. Verify saved PID/argv/startTicks before signaling. If another service owns the port, leave it running and use a free port with RED_PANDA_CDP. Live processes/connections/storage do not survive restoration. Start in a long-running TTY:
exec node --experimental-vm-modules bin/red-panda.js serve

From another initialized shell:
curl --fail --silent http://127.0.0.1:9222/health
npm run example:puppeteer

The self-contained example must print HTTP 200 — Red Panda demo and ["https://example.com/"]. RED_PANDA_CDP selects another endpoint; RED_PANDA_URL is optional and must be a trusted permitted site. Do not present localhost as a preview. The exact owned prior service was stopped after PID/argv/startTicks verification; the new service at pushed92a6c38 passes health and the actual PureScript example with6,841 unchanged inputs and tracked runtime clean. Proof .cache/validation/phase26-onboarding. This is current-instance evidence, not fresh-task restoration.

Validation after code changes:
npm run check
npm run build:automation -- --strict --pedantic-packages
npm test

Tests own their local fixture/CDP servers. Preserve all proxy bypasses and rendering dependencies. npm run prepare:reference verifies the pinned short-ref archive,574 HTML fixtures and original assertion harness in ignored .cache/lightpanda-reference, retaining upstream licenses. It is test-only. Optional official Native binary:
/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux
SHA256 9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f
npm run test:reference -- /workspace/shared/lightpanda-reference/lightpanda-x86_64-linux

Fresh whole-workspace discovery at92a6c38:263 Git roots,1,630 directory links, one project,259 dependency/cache/empty roots and three verified unborn no-remote validation copies; zero unknowns/errors/outside links. The86 newly copied PureScript dependency/registry caches match original full HEADs and sanitized remotes. Sole project membership: github.com mtonnberg/red-panda, relative mount red-panda, exact pushed commit92a6c3891798bdc02e3be07490df0ddab75b42b8. Discovery proof .cache/validation/phase26-onboarding/repository-discovery.json.

Saving this draft does not execute scripts, apply configuration or publish it. Review and save changes in environment settings, then publish through the product when desired. Fresh-task restoration has not been independently verified.
