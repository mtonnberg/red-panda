The retained Native net/websocket.html assertion failure is caused by a test-runner global quota mismatch. Native CLI defaults to 8 concurrent WebSocket transports (Config.zig:748); the pinned in-process test runner explicitly configures 50 (testing.zig:562). Network.zig:211 checks the genuine process-global WebSocket pool before allocating a transport. The failure is not evidence that binary payloads, cookies, or Origin handling are broken: fresh serial real-wire controls pass those operations through the unchanged independent fixture server.

The old baseline remains unchanged and failed: proposals/native455-canonical/reports/331-net__websocket.html.json SHA256 2f1b88293fa94543f14635a09ba0204aa238ddcd195f2193dcb70a3c897428a6. It observed 8 actual upgrades, then close1006/error outcomes for excess sockets. Do not promote that old row, change its args, or revise its pass count using this differently configured replay. diagnosis.json adds the separate classification runner-global-websocket-quota-setup-mismatch only after obtaining the complete positive fixture control.

Actual Native binary SHA256: 9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f. Source pin948d773786380bae36f046639fc61e2ddddd212a. Unchanged fixture SHA256: 5f559245dc47d633077655a7337a4c8d873292eb5cdd4a028e1aa40537ef8eb6. testing.js SHA256:23e2ebbd851e64a68b1e357a38ed2e6d5d5f72217cb2e14671c4d3eecf6c861b. TestWSServer.zig SHA256:67567c360bc580c8ed7ed7986cbebd67138ce538e2c48f431a5f1c259b00d0e4. The independent wire helper remains unchanged, SHA256 fa4aca14229154b1f1f0b1b513bcd164a32cb81e155ca54e16d9376486094616.

Evidence uses genuine authored WebSocket connections, HTTP upgrades and payloads. Fresh16 controls open exactly8 by default and all16 with the sole extra native argument --ws-max-concurrent50. Explicit50 also opens every connection in batches4/8/16/32 (60 real upgrades). Mixed default batches sometimes have7 available slots while earlier connections are still finishing; release timing is not fully specified by this bounded diagnosis. Serial controls actually exchange text, typed arrays, ArrayBuffer, Int32Array, Blob,10000-byte generated data, server-close1001, Cookie and Origin. No output, API result, socket or assertion was fabricated.

After Root explicitly released its canonical lease, two separate unchanged full-fixture replays used the same unmodified registration map/profile fa94522d56ca, source2000ms load then2000ms assertion budgets, native harness branch and actual owned HTTP9582/WS9584 listeners:

* native-canonical-default8.json reproduces failure with8 upgrades; original per-fixture/process args stay unchanged.
* native-canonical-global50.json passes the complete unchanged fixture with28 upgrades and nonzero real harness observations. Only the explicitly separate runner-global WS quota differs. SHA256:2ad225fa47b336ce24532b56ab852bdec451d0540780b4dc573b1a8b3bef3d0f.

The replay lease is over. Both processes and servers exited, and9582/9584 successfully bound/listened/closed afterward (canonical-ports-released.json,09:32:10.742Z). No further canonical port use is authorized by these artifacts.

The narrow helper patch adds optional repeatable --runner-global-arg. It supplies no defaults and does not rewrite any registration profile. It requires an owned binary, can be used alongside --registration-map, and reports runnerGlobalArgs separately from fixtureBrowserArgs while retaining the effective actual argv. Existing --browser-arg/registration-map exclusivity remains intact. Reports explicitly state that other source globals were not automatically applied. This prevents a source test-global quota from being silently mislabeled as a fixture-specific option. Existing no-option behavior stays unchanged. Native node/is_equal_node.html on an ephemeral fixture port verified this combined option/profile path; an unowned endpoint rejects the new option before connecting.

Other global differences are separately audited in global-configuration-audit.json. The source test disables TLS verification, sets UA suffix internal-tester and disables the watchdog; the frozen external run used CLI TLS/watchdog defaults and a deliberate instrumentation UA. Independent real HTTPS controls verify default rejection versus success with the sole insecure flag, and a sole UA suffix changes the actual UA while TLS still fails. The accepted watchdog flag was not exercised with a30-second busy loop; its behavioral difference remains source-audited. Other HttpClient defaults agree through the same serve-mode getters (128 HTTP concurrent, host6, connect8000ms, transfer15000ms,1GiB response cap, no nav delay, burst1, auto HTTP,20 redirects), but were not stress-tested here. No blanket global-configuration equivalence is claimed.

Reproduce the explicitly different native global profile after acquiring a fresh canonical port lease:

    node scripts/conformance.mjs --root /path/to/pinned/src/browser/tests \
      --binary /path/to/pinned/lightpanda --isolate --fixture-profile upstream \
      --source-load-contract --registration-map /path/to/unchanged/registration-map.json \
      --port 9582 --websocket-port 9584 --test net/websocket.html \
      --runner-global-arg=--ws-max-concurrent --runner-global-arg=50 \
      --report /new/report.json

Evidence driver sources retain original ../scripts and ../test imports and should be placed in a direct repository child evidence directory when rerun. TLS controls require generating a fresh local test certificate/key; the private generated key is not packaged. The retained certificate is public evidence only.

No WebSocket wire-helper correction, Native WebSocket API defect, or Red Panda production fix is established by this work. No browser source, frozen baseline, registration map or runtime default was edited. A future Red Panda CLI/quota implementation needs independent default8/explicit50 calibration and genuine shared socket ownership/slot release; the fixture requiring50 does not authorize changing the product default to50.
