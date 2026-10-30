# Lightpanda reference observations

Target: official Linux x86_64 nightly downloaded on 2026-10-30 from
https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-x86_64-linux
Version: 1.1.0-nightly.11326+948d77378.
SHA-256: 9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f.
Verified against the digest published by the official GitHub release asset page,
retained in assets.html. Native ELF x86-64 metadata independently observed with
REA inspect-with-objdump. No TLS or checksum verification was disabled.

REA 6.8.0 used via CLI. Process capture initially lacked the optional PTY native
package; installing matching @lydell/node-pty-linux-x64@1.1.0 fixed it. Captures in
evidence-index.json completed with exit/settlement observations and no truncation.
The index identifies exact Evidence IDs. All complete captures are retained.

## Observed CLI behavior

- fetch supports --dump html, markdown; --json returns url, http_status,
  headers [{name,value}], dump, content, error plus diagnostic metadata.
- Inline and external scripts run and change the DOM before default load returns.
- --wait-ms 250 is a maximum deadline, not mandatory 250ms sleep. With default
  load waiting, asynchronous fetch and a 40ms timer were not reflected in output.
- --wait-until done --wait-ms 1000 reflected both fetch data and timer mutation.
- --wait-selector '#api:not(:empty)' reflected fetch data but did not wait for
  the unrelated timer.
- Markdown omits script contents and resolves anchor hrefs to absolute URLs.
  Whitespace is specific to Lightpanda; no markdown byte equivalence was claimed.
- HTTP 404 content is still dumped. --fail-on-http-error yields exit code 22.

## Observed CDP behavior

Owned Lightpanda server on 127.0.0.1:9318:
- GET /json/version returns Browser Lightpanda/1.0, Protocol-Version 1.3,
  User-Agent Lightpanda/1.0, Lightpanda-Version and root WebSocket URL.
- GET /json and /json/list initially return []; GET /json/protocol returns the
  complete advertised subset, retained in cdp-protocol.json.
- CDP probe created/disposed a context, created/attached a target with flatten,
  enabled Page/Runtime, navigated, evaluated JS and DOM queries, clicked a button
  through JS, set/read a cookie and dumped markdown through LP.dump.
- Page.navigate response provides frameId/loaderId. Attached session messages
  carry sessionId. Runtime.evaluate returns {result:{type,value}} for primitives.
- Runtime.executionContextCreated includes id, origin, uniqueId, auxData
  isDefault/type/frameId, plus loaderId after navigation.
- Navigation emits frameStartedNavigating/frameStartedLoading, clears contexts,
  frameNavigated, creates context, DOM.documentUpdated, domContentEventFired,
  loadEventFired and frameStoppedLoading in the recorded sequence.

cdp-probe.mjs accepts an optional WebSocket endpoint to run the same sequence
against another implementation while fixture.mjs serves 127.0.0.1:9317.

## Limits

These are bounded runtime observations of a small deterministic local fixture.
They do not establish full CDP, DOM or JavaScript compatibility, performance,
rendering, remote-site behavior, adversarial isolation or source equivalence.
The full browser engine was not decompiled. Static headers describe the binary;
process captures describe actual observable execution. Warnings about inability
to create a default data directory were emitted by the official binary under
this environment's filesystem policy and did not prevent the exercised workflow.

## Additional batch and preload observations

Four more REA process captures used the same verified official binary. Each
completed without truncation; the deliberate mixed-success batch exited 1.

- `batch-errors-evidence.json` (`ev_b4d5af39a9aea7ebb1d5162d1293f8e93848d42c37ba7ebe3329f85303bbf651`):
  multiple URLs produce an ordered `results` array. A 404 page still has a dump
  and null error. A refused connection reports HTTP status 0 and
  `CouldntConnect`. A navigation failure overrides `--fail-on-http-error`'s 22
  with exit 1, while successful pages still appear.
- `preload-order-evidence.json` (`ev_43898a4bc9de9d91b6a9291403c87fac0a377be35a91322dae7d8a4e549db5c3`):
  inline preload, file preload, then another inline preload produced `ABC`,
  observed by a script in the loaded document.
- `cookie-persistence-evidence.json` (`ev_94a994e8363d344df0ee281b97b07579aa366e5a8d39097b71010555669e9244`):
  a JSON cookie file supplied a dummy HttpOnly cookie to an HTTP request.
  `output-cookies.json` contains the jar read back from the command's output file.
- `batch-cookie-sharing-evidence.json` (`ev_4564b3df10428c1df88c1f221e563cc343441e16d0041ad4438d88e7b376ddad`):
  a cookie set by the first page was absent from the second page's request.
  This establishes separate CLI page cookie state for this fixture, rather than
  a shared browsing session.

The additional scenarios contain their original ephemeral fixture address.
`scripts/compare-lightpanda.mjs` creates a fresh local fixture and temporary files
to repeat these comparisons portably. Its Netscape-import and plain-text checks
are direct differential tests, separate from these four REA captures.

## Request header and user-agent observations

`request-headers-enabled-evidence.json`
(`ev_23564527302e119617db2274509e5565aa54bce07b335623e5abc54ace9403d9`)
captures the verified binary through an owned CDP server and local HTTP fixture.
Navigation, an external script, and a page fetch all received configured extra
headers, a user-agent override, and `Accept-Language: sv-SE`. The page's navigator
reported the same user agent and language. Extra headers took precedence over a
conflicting header passed to fetch. Setting an empty header object removed them
on the following navigation. Resources and fetches sent the page URL as their
same-origin referrer; navigation did not.

The preliminary `request-headers-evidence.json`
(`ev_d811640c326e85a3594c0eee3bb88be87ee794e208e93d9242da76928ce17e9d`)
omitted `Network.enable`: user-agent/language overrides worked but the native
browser did not apply extra headers. The enabled capture tests this diagnosis;
the differential suite uses an enabled Network domain, as Puppeteer does. These
results do not establish native behavior for every domain enable/disable order.

Both captures finished with exit 0 and no truncation. The wrapper prints the
SHA-256 of the reference binary it launches; its process Evidence describes the
Node wrapper and resulting observations rather than a decompilation of the native
browser. `request-headers-probe.mjs` accepts the verified binary path and an
optional `enable-network` argument for reproduction.
