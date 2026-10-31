# Frozen Red Panda registration/profile comparison

The independent candidate at **ee39586d629b80d87cb074ba8cf832dcf917296a** attempted
all455 unique registered fixture paths in all8 source profiles. Raw results:
**338 verified passes,98 observed assertion failures,18 source-load timeouts,
and1 unsupported image-resource CLI setup failure**. This is a frozen source
checkpoint, not acceptance of the later working implementation.

`matrix.json` retains original outcomes; `classified-matrix.json` distinguishes
the setup failure and timeouts from actual assertion failures. Every selection
has its individual report, command, source/profile/budget identity and raw
stdout/stderr. All338 passes observed actual root complete/load, then started a
fresh2000/8000ms assertion budget and reached the unchanged harness's nonzero
Native-branch assertOk. No fixed settle or assertion rewriting was used.
A load timeout occurs before assertOk; the harness-observation flag does not
establish that testing.js was absent. The image option rejection occurred
before browser readiness, with its load-stage identities unobserved rather
than proven hash mismatches.

The code was exported from the committed tree into a separate nongit directory,
with its own copied node_modules and exact native build artifacts. The launcher
and6654 source/helper/dependency/build inputs stayed unchanged, as did all854
pinned source/support inputs and the launcher/binary identity. Root development
continued separately. Scoped Native probes/feature checks existed concurrently;
this is no timing-isolation or performance-equivalence claim. Registration-map
SHA256 is066ad73e170657f43d79ca4f35b0741c18cec15dbed44bb1dba0518bf400c9b8.

Each fixture ran serially with its own candidate process and actual canonical
HTTP9582/WebSocket9584 fixture transports. Five reported termination signals
belong to owned cleanup after deadlines; no crash is inferred. Both ports were
bind/listen/close reusable afterward, and no owned candidate process remained.
Raw unavailable-route tags include intentional404s and canceled/inflight
requests and need source audit before being called missing server routes.

The independent `../native455-canonical/` matrix remains451 frozen positives
and4 nonpasses, with its later exact header/compare-position replays separate.
New `websocket-runner-global` evidence diagnoses the original full-WebSocket
Native nonpass: CLI quota8 differs from the compiled test runner's50. A separate
explicit50 replay passes. Neither that replay nor later candidate feature
replays rewrite this matrix, its registrations, or a previous Native row.
No compiled Zig/WPT result or full browser replication follows from these counts.
