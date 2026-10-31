# Start the synchronous HTTP transport on its first real request

Browser construction started a Node transport thread and blocked on a separate 2000 ms readiness handshake, even for pages using only asynchronous navigation. A composed viewport test failed at that constructor wait before its metric assertions. The underlying slow Host startup remains unexplained.

The baseline trace ran one actual async-only Browser/Page navigation with zero synchronous fetch calls. It still created a thread: child entry/ready occurred at 90.404/90.452 ms and the original wait returned at 90.558 ms. Parent online delivery was later, at 384.55 ms; delivery time is not producer startup time. This quiet positive does not reproduce or erase the earlier 2-second failure.

The candidate owns an idle transport until the first validated synchronous dispatch. It then starts the genuine independent Node thread and sends the real request; Node naturally queues it until the original listener exists. The unused readiness handshake is removed. Startup is included in the existing request deadline. Cookie, redirect, CORS, headers, actual HTTP/body processing, request callbacks and VM deadlines keep their algorithms and budgets.

Cancellation before first dispatch tolerates no worker. Closing an unused transport starts none. Later requests reuse the same actual thread. An actual unexpected exit records a transport failure for later requests; it produces no response. The viewport fixture also registers Browser cleanup before createPage, without changing its expressions or expectations.

Four leaves: two runtime files, one existing fixture cleanup and five new lifecycle/resource/HTTP tests in a new file. There are no startup warmups, test modes, fake backends, source fixture changes or deadline increases.

The focused run completed **32/32 checks in 18.00 seconds** on Node 24.22.1, with 1850 own runtime/test/native/oracle/reference inputs unchanged. It includes all existing synchronous XHR and viewport cases. New controls observe actual WORKER resources, real first HTTP bytes and transport reuse, close-before-use, request-callback abort before startup, original 1000 ms hanging-request cancellation with a real closed response socket, and actual unexpected thread exit. Existing VM 80/200 ms interruption and callback cleanup controls pass unchanged.

`integration.patch` applies to the exact copied private composition. `source-manifest.json` pins all before/after leaves; `test-names.json` lists the actual 32 matched checks. `evidence.tar.gz` preserves the original rejected Root epoch, diagnostic-only baseline source diff/clocks, focused commands/results and source guards. A postrun sidecar verifies all 6579 shared dependencies against the earlier frozen Root manifest with zero differences/new files. It explicitly distinguishes that later comparison from the independently recorded 1850-file before/after guard. No Native engine execution is claimed for this internal Node lifecycle correction; existing actual Native viewport observations remain pinned.

Other SDKs and Root composed/full validation remain pending. No Root/private production files were edited by this handoff.
