# Upstream fixture transport proposal

This isolated proposal expands the test server and records all **455 registered
fixture paths in 8 source profiles** at upstream
`948d773786380bae36f046639fc61e2ddddd212a`. It does not run a full registration
matrix or establish browser parity. No Root production files were edited, and
no engine implementation is imported. The pinned external source retains its
license; these fixture transports were written independently from observable
route definitions.

Apply `integration-current.patch`; its SHA-256 and base file hashes are in
`manifest.json`. The seven-file patch passes `git apply --check` against the
recorded current Root. Frozen leaves are in `leaves/`; executed helper hashes
and the small post-Native delta are separated in `evidence/source-freeze.json`.

The new `upstream` server profile adds real progressive SSE and reconnect/reset
state, WebSocket upgrades/frames/commands on an explicitly owned second port,
raw byte-exact HTTP responses, gzip and brotli byte transports, resource timing
headers, counters, beacon request records, stylesheet/script encoding payloads,
images, redirects/referer/header echo, attachments, and actual static `.headers`
sidecars. Ordinary HTTP responses retain Node framing; `/raw/*` and the Latin-1
response bypass it. Cross-host and absolute redirects keep upstream's canonical
9582 targets. Ephemeral transport checks do not rewrite fixture assertions.

There is no separate CORS route family in pinned `test_routes.zig`: CORS response
behavior comes from `/echo_headers`, `/echo_referer`, and static sidecars. The
new profile implements their actual headers, including real OPTIONS handling;
it does not grant CORS globally. Static normalization accepts repeated leading
slashes inside the fixture prefix, then applies canonical realpath containment
to the fixture and its sidecar. Traversal and symlink escapes remain rejected.

Fresh source extraction finds **216 active literal calls, 14 nondefault calls,
574 HTML files, and 455 unique registered paths**. Earlier notes describing
15 option overrides were inaccurate. Directory registration is nonrecursive;
metadata tags do not determine registration. The map contains every fixture
hash, exact options, source lines and source hashes, all support-file hashes,
and the separate 2,000/8,000 ms source budgets. These are source-syntax findings,
not a compiled Zig build/import-filter claim.

| Source profile | Registered paths | Native control coverage here |
|---|---:|---|
| iframe + worker, 2,000 ms | 440 | SSE, compression, resource timing, worker WebSocket pass; full WebSocket fails |
| same resources + exact injected script | 1 | Pass |
| stylesheet only | 5 | Charset fixture passes; other four unrun |
| beacon + iframe only | 1 | Pass |
| image only | 1 | Pass |
| iframe + worker, 8,000 ms | 4 | Unrun |
| serviceworker + iframe + worker, 8,000 ms | 1 | Unrun |
| serviceworker + iframe + worker, 2,000 ms | 2 | Unrun |

The runner's optional `--registration-map` requires isolated owned browser
processes. It applies each selected fixture's exact resource/experimental flags,
injected script, source timeout and hash; a supplied `--timeout` is recorded as
a separate diagnostic override. The `upstream` profile resets server state
between fixtures. `--websocket-port` is explicit, and reports retain WebSocket
requests, child exit/signal and bounded stderr. Existing static/xhr-subset modes
remain available. The process readiness helper no longer imports engine code.

Validation is **9/9 focused transport checks on Node 24.22.1 and Node 26.13.0**.
They exercise actual HTTP/TCP bytes, gzip/brotli, CORS preflight headers,
state/reset, streaming chunk gates, source image bytes, encodings, sidecars,
confinement, WebSocket framing/commands, and owned shutdown. Final logs are
`evidence/server-tests-final-node24.log` and `server-tests-final-node26.log`.

Actual pinned Native controls ran serially on explicitly reserved 9582/9584,
then released both ports. Eight of nine distinct unchanged fixture controls
pass with source profiles and source budgets: eventsource, compression stream,
stylesheet charset, image fetch, beacon, resource timing, injection, and
WebSocket worker. **Full `net/websocket.html` fails** both in the original
2,000 ms run and in the separate 15,000 ms/document-complete +100 ms diagnostic.
Six upgrades arrive, no commands, and many fixtures observe abnormal closure;
the owned Native process exits normally with code 0. This remains an observed
failure of that complete external control. Its cause is unresolved; it is not
a missing-route, unobserved, timeout, process-crash, or pass classification.

Seven separately authored Native controls pass: actual CORS preflight and
missing-ACAO rejection, brotli/gzip decoding, a single WebSocket with text,
binary, Origin and clean-close exchange, real attachment bytes written to disk
with download events, and a 404 attachment leaving no file. These establish
specific route transports, not all WebSocket or download behavior. Reports and
control source are in `evidence/native-*.json` and `native-route-controls.mjs`.

The Native epoch is frozen separately. After those controls, the final patch
corrects conditional raw-response matching to search the entire reconstructed
request head, including marker text in a header value, and clarifies metadata
when optional WebSocket transport is disabled. Final focused tests verify both;
Native controls were not rerun after that narrow change. Raw response wire
hashes and source hashes are in `evidence/route-artifacts.json`.

Remaining limits: no 455-fixture runtime matrix or candidate run was performed;
three source profiles remain unobserved; the full Native WebSocket control is
unresolved. Delays are capped at 120 seconds, incoming WebSocket frames use the
source's 128 KiB buffer bound, requested outgoing WebSocket messages are capped
at 64 MiB, and `/status/` accepts 200–599. Node ordinary HTTP wire headers differ
from Zig; exact header-byte tests must use the raw routes. Safe fixture-root
confinement intentionally rejects paths beyond the fixture root. No claim is
made for arbitrary upstream server inputs, TLS, broader WPT coverage, or actual
network performance parity.

To rebuild the map and select a diagnostic subset after integration:

```sh
python3 scripts/upstream-fixture-map.py \
  --source-root .cache/lightpanda-reference/browser-948d773786 \
  --output /tmp/red-panda-fixture-map
node scripts/conformance.mjs \
  --root .cache/lightpanda-reference/browser-948d773786/src/browser/tests \
  --binary /path/to/browser --isolate --fixture-profile upstream \
  --port 9582 --websocket-port 9584 \
  --registration-map /tmp/red-panda-fixture-map/registration-map.json \
  --test net/eventsource.html --report /tmp/eventsource-source-budget.json
```

`registered-fixtures.json` is a complete **selection**, not a result report.
Do not run it at occupied canonical ports or combine source-budget evidence
with 15-second diagnostic evidence into a single parity rate.
