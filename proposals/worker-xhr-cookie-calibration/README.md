# Native-calibrated Worker XHR credential test

The composed candidate correctly omits an unqualified/default SameSite cookie for the cross-site request from 127.0.0.1 to 0.0.0.0. The old unit expected that cookie whenever withCredentials was true. Actual Native contradicts that expectation for both async and sync Worker PUT requests, with both real HTTP Set-Cookie and Native CDP cookie seeding.

The one-hunk test-only patch preserves the positive credential check using the measured eligible case: a genuine HttpOnly Secure SameSite=None destination cookie on trustworthy loopback 127.0.0.2. A second, default SameSite destination cookie must remain omitted. The exact response Cookie assertion still requires only `destination=actual` when credentials are enabled and an empty Cookie otherwise. The four combinations retain their status, creator Origin, PUT method and real binary-body assertions. No production source, cookie policy, transport, native artifact or timeout is changed.

The actual Native/candidate probe covers creator 127.0.0.1 and destinations 0.0.0.0, 127.0.0.2 and the same-site 127.0.0.1 control. Each uses async/sync × credentials false/true and real `[0,128,255]` uploads. Each destination has HTTP and CDP seeds for unqualified, Lax, Strict, None and Secure None. Raw seed command results, URL-selected cookie metadata, response values and actual wire requests are retained. All 6,824 baseline inputs remained unchanged.

Native findings:

- Both cross-site destinations omit unqualified/default, Lax and Strict cookies, with either seeding channel and either XHR mode.
- On 127.0.0.2, real Secure SameSite=None cookies are delivered only with credentials enabled. On 0.0.0.0, the HTTP request delivers none of the seeded cookies.
- Same-site 127.0.0.1 includes the eligible cookies with either credentials setting.
- Native rejects CDP SameSite=None without Secure (`success:false`) on all three hosts. The candidate currently accepts and transmits those cookies; that separate runtime gap is preserved, not fixed by this test correction.
- Native sends two preflights in each four-request cross-site matrix; the candidate sends four. All observed preflights are cookie-free. Cache reuse versus sync-path behavior is unclassified. The existing candidate count-four assertion is retained as an implementation regression check and is not called Native count parity.

`Network.getCookies` queried an HTTP URL, so omitted Secure cookies at 0.0.0.0 prove HTTP read/send ineligibility, not rejection from storage. Native's CDP Secure None command can return success:true there. The artifact does not equate success, storage and URL eligibility.

The exact corrected testcase passed on Node 24.22.1: one matched test, not the full 26-test file. Its controller exited zero in 4.293 seconds and all 6,823 inputs remained unchanged. The entire file on all three SDKs is deferred until Root composes the independent lazy-transport change. Original test bytes, exact source/native/dependency identities, both complete guards and logs are retained.

`candidate/` is the owned exact copied private phase22 101-leaf runtime used for the proof, plus the test correction. The integration patch contains only the test hunk. No Root or private phase22 production file was edited. History and Location handoffs remain immutable.
