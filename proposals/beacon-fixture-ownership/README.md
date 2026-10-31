# Beacon fixture cleanup ownership

This fixes a proven test-fixture resource leak. It does **not** identify the original phase21 quota failure trigger and changes no browser/beacon implementation, quota, assertion, or timeout.

`patch.diff` changes only `test/beacon.test.js`: the fixture owns server setup and Browser/Page creation inside its `try/finally`; it closes both servers even if Browser cleanup throws. Previously two servers were already listening when Browser/Page setup ran outside cleanup ownership. A setup exception could therefore leave the test child alive after its failure and all later test lines had printed. The error still fails the test; it is not swallowed or converted to success.

The exact Root447-file src/test/native/scripts/bin/package graph was copied to `/workspace/shared/beacon-regression-20261031`. All447 hashes match Root phase21 `full-source-before.json`, and Root remained unchanged through the final guard. Only the isolated test file differs. See `evidence/base-source.json`, `root-epoch-match.json`, and `test-integrity.json`. All eight actual test bodies after the fixture are byte-identical; Browser timeout remains1000ms. Handler logic changes only indentation.

## Actual observations

The original quota case passed in isolation742ms, and with `--use-env-proxy`974ms. The entire original unchanged file passed8/8 without that flag, with that flag, and with the exact full-run launch environment. The exact environment is `NODE_USE_ENV_PROXY=1`, NODE_OPTIONS absent, and both NO_PROXY/no_proxy equal `localhost,127.0.0.1,::1,localhost,127.0.0.1,::1,0.0.0.0,127.0.0.1,127.0.0.2,127.255.1.2,localhost,::1,[::1]`. No proxy credentials were read or recorded.

A separate owned diagnostic preload observed the unchanged original file passing8/8 in4.20seconds. Every retained beacon controller settled to pending0 and bytes0; Browser cleanup completed; natural beforeExit had only two stdio PipeWraps. Actual transport errors were the expected deliberate `/disconnect` SocketError and canceled-navigation AbortError. Diagnostics are separate artifacts and absent from the patch/production. Fetch event type labels were overwritten by the logged resource-type field in this diagnostic epoch; raw records and their actual error/elapsed fields are retained, and the summary accounts for that instrumentation limitation.

Root's actual failed quota line took3960ms, then later beacon cases passed. Its exact child400487 remained sleeping with seven threads/five sockets after all beacon lines. Parent inspected its exact executable/cwd and nonsecret launch environment, then stopped that exact child to let the full runner continue. `root-owned-child-before-stop.json` preserves Parent's observation; initial unprivileged permission-denied reads are separately preserved rather than treated as empty results. Those facts are consistent with the proven fixture leak but do not establish Root's original exception. Its full final stack is needed to distinguish setup, transport, deadline, assertion, or another trigger. This package never counts the stopped full epoch as acceptance.

## Independent negative control and candidate

The **identical** separate `inject-setup-failure.mjs` deliberately throws `OWNED_INJECTED_SETUP_FAILURE` from Browser.createPage after both real HTTP servers listen. This is an intentionally injected failure, not reproduction of Root's unknown trigger. Its500ms observation interval is unref'ed and cannot keep the process alive.

- Original fixture: actual test fails, both real Server/TCPServerWrap handles remain listening across observations, and the child does not exit. Its owned process group is stopped by the external4second diagnostic guard. See `injected-setup-failure.{jsonl,log}` and `injected-setup-failure-result.json`.
- Candidate fixture, same injection SHA `30010ed6d5bc70f4267cb5b91c9663035c78db6ef80ab575221397a6936af1fb`: the test still fails with the same injected error; the child exits naturally code1 in1.79seconds, without the external guard. Both previously observed owned server ports refuse connections after exit. See `injected-setup-failure-candidate*`.
- Candidate normal run: all unchanged eight tests pass8/8 and child exits code0 in3.90seconds with the exact full-run environment. `candidate-file-exact-env.log` retains the original quota test and its actual request assertions.

No broad suite, heap query, build, canonical port, Native oracle, deadline weakening, or production diagnostic was used. No beacon semantic change is justified by these results. Initial command cwd and patch-preparation syntax mistakes occurred before execution/mutation and are noted in `harness-notes.json`; they are not test results.

Apply only `patch.diff` after Root's current full-run source freeze ends. `base/` and `candidate/` preserve exact test leaves. All diagnostic sources/logs are read-only evidence, not shipped runtime dependencies. Original Root quota trigger remains an explicit unresolved finding until its raw final stack is available.
