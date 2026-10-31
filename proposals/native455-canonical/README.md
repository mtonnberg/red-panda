# Complete Native registration/profile baseline

The frozen canonical epoch selected and attempted **all 455 unique literal
upstream fixture registrations in all 8 source profiles**. Its unchanged raw
outcomes are **451 verified passes, 2 observed assertion failures, 1 load-stage
timeout, and 1 owned-driver deadline without a final fixture report**. This is
not a full 455 accepted pass, a candidate comparison, a compiled Zig test-suite
result, a WPT claim, or a performance comparison.

The canonical classification is `classified-matrix.json`; `matrix.json` retains
the raw driver outcomes and provisional tags. Every fixture has an individual
report or explicit missing-report/deadline record, stdout/stderr files, source
hash, exact registration profile, command, and owned process details. Raw
`fixture-route-unavailable` tags are audited against the pinned source: absent
negative-test files and in-flight/canceled responses are not missing server
routes. No confirmed missing-route gap remains in this epoch.

| Source profile | Selected | Frozen epoch outcome |
|---|---:|---|
| iframe + worker; 2,000 ms assertions | 440 | 436 pass; four nonpasses below |
| same resources + exact injected script | 1 | 1 pass |
| stylesheet only | 5 | 5 pass |
| beacon + iframe only | 1 | 1 pass |
| image only | 1 | 1 pass |
| iframe + worker; 8,000 ms assertions | 4 | 4 pass |
| serviceworker enabled + iframe + worker; 8,000 ms | 1 | 1 pass |
| serviceworker enabled + iframe + worker; 2,000 ms | 2 | 2 pass |

Registration is extracted from 216 active literal calls, 14 with nondefault
options, at `948d773786380bae36f046639fc61e2ddddd212a`; directory calls enumerate
immediate HTML children. Tags do not determine registration. There are 574 HTML
files in the pinned tree; unregistered support files were served but were not
promoted to test selections. Build/import filters are outside this syntax map.
The fixture/profile map SHA-256 is
`066ad73e170657f43d79ca4f35b0741c18cec15dbed44bb1dba0518bf400c9b8`.

The source readiness contract matters. `src/testing.zig:454` waits up to
2,000 ms for `.load`; `Runner.zig:303` defines this as frame load-state complete.
Only afterward does `testing.zig:456` start the fresh registration assertion
budget of 2,000 or 8,000 ms. The frozen driver observes the actual root-frame
load lifecycle event and complete document before calling `assertOk`, then
starts a fresh assertion budget. There is **no fixed settling delay**. Each
successful report records its load barrier, native harness branch, exact
Lightpanda/1.0 instrumentation UA, nonzero-assertion enforcement, source budget,
and source-profile match. Automation setup/owned teardown limits are separate.
This is an external raw-CDP replay, not an invocation of the private Zig runner.

Native identity is the actual owned executable, SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
`provenance.json` records Node 24.22.1, all helper and WebSocket dependency hashes,
source root and 854 source/support hashes. All pinned files, frozen helper files,
binary and 19 dependency files were unchanged at postflight. The 454 completed
fixture reports match their fixture/profile/budget/binary/harness identities;
the missing report's identities remain unobserved rather than being described
as actual hash mismatches.

The run was serial, with a fresh owned fixture server and Native process for
every fixture, canonical HTTP 9582 and WebSocket 9584, real fixture bytes and
stateful transports, exact resource/experimental flags and exact injection.
No candidate run, heap suite, PureScript suite, or broad Node suite was run by
this agent concurrently. Both ports were released after the run and bounded
replays. `ports-released.json` and `owned-process-cleanup.json` preserve cleanup
observations; no live owned browser remains. One deadline process is an already
terminated zombie adopted by PID 1 and cannot be reaped by this nonparent agent.

## Four frozen nonpasses

| Fixture | Classification | Evidence and separate replay |
|---|---|---|
| `frames/blob/blob_url.html` | Source load barrier timeout | No root load event within 2,000 ms; no assertOk call. Separate diagnostic still has interactive readyState and native harness available. Native exits 0 during owned cleanup. |
| `net/websocket.html` | Observed application assertions fail | Root load observed, many binary/close/upgrade cases fail, Native exits 0. Worker WebSocket passes in the full epoch; earlier single real-wire Native controls pass. Cause of the full control failure remains unresolved. |
| `net/xhr.html` | Confirmed response-header setup mismatch | Native exposes Node's added Date/Connection/Keep-Alive headers, contrary to the unchanged fixture's expected complete header set. Actual failed assertions remain recorded. A separate upstream-only server correction and exact source-budget replay pass; see `../fixture-headers/`. |
| `node/compare_document_position.html` | Owned-driver deadline; final report unavailable | Controller ended its own process group after 20.6 s; no source-stage final report exists, so no Native crash or assertion failure is inferred. Separate readiness probe and exact frozen-driver rerun pass with Native exit 0. Original row remains unchanged. |

The two bounded diagnostic replays call no assertOk and are separate from the
baseline. The additional compare-position exact-driver rerun does call the
unchanged harness and passes. The corrected-header XHR replay uses a different,
explicitly hashed server graph and passes. Neither supplementary pass replaces
an original row or changes the frozen **451/455** positive count. No unexpected
Native crash signal or nonzero Native exit was observed in the completed
reports; the deadline group's forced cleanup is an owned termination.

## Corrections and preserved epochs

The initial `../native455-baseline/` epoch was stopped at 321 selections after
confirming immediate assertOk polling violated source load readiness. Its 306
apparent passes and 15 failures remain raw observations with an explicit
load-contract mismatch warning; early passes can miss later inline scripts.
The separate `../native455-load-first/` epoch was stopped at 168 selections to
correct an actual static POST setup gap. Both partial epochs and their reports
remain unchanged. They are not combined into this matrix.

`followup.patch` adds the source load/then-assert driver option and allows actual
static-file request methods in the upstream profile, matching pinned
TestHTTPServer.sendFile. It applies after `../fixture-routes/integration-current.patch`.
Nine focused transport checks including real POST/PUT bytes pass; representative
Native controls establish readiness and method behavior. The patch and base
hashes are in `followup-manifest.json`. The separate
`../fixture-headers/headers-contract.patch` subsequently suppresses only implicit
headers using public Node APIs, preserving authored headers, raw bytes and
legacy profiles. Its six checks pass on Node 24 and 26, and its isolated Native
XHR replay passes. No full 455 run was performed on that later header graph.

## Next priorities

Integrate the three validation helper patches before measuring the current
candidate. In particular, correct the server's implicit headers instead of
filtering real response headers in the browser engine. Freeze the candidate
graph and run the same selection/profile/readiness map serially; compare actual
matching source hashes and profiles, keeping the four Native nonpasses and
supplemental controls separate.

Only genuine Native-positive/candidate-failure pairs justify new implementation
priorities. This Native-only run does not establish which current candidate
features fail. The 451 full-epoch positives provide broad new controls; the
separate exact compare-position and corrected-XHR positives provide narrowly
attributed additional evidence. Use the worker and single-wire WebSocket
positives for bounded functionality while the complete WebSocket control is
unresolved. Investigate blob load liveness and the transient driver deadline
as validation/oracle issues before assigning candidate engine defects.
