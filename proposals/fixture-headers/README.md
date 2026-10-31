# Explicit upstream fixture response headers

`headers-contract.patch` applies after the original fixture-helper proposal and
`../native455-canonical/followup.patch`. It changes the **upstream test profile**
only and adds six focused checks. No engine code changes.

Pinned `net/xhr.html` asserts the complete response header set. Node added Date,
Connection and Keep-Alive headers absent from that source contract. The frozen
455-selection baseline retains that actual XHR failure. The correction uses
public ServerResponse seams before response construction: `sendDate = false`,
`removeHeader('Connection')`, and `removeHeader('Keep-Alive')`.

Focused real HTTP/TCP checks pass **6/6 on Node 24.22.1 and 6/6 on Node 26.13.0**.
They verify the exact XHR header list and duplicate values; authored Date,
Connection and Keep-Alive sidecar headers survive; HEAD length and streaming
chunking survive; raw response bytes remain exact; and both legacy profiles
retain their automatic headers.

A separate unchanged Native `net/xhr.html` replay now **passes**, with a recorded
root load event and complete document before assertions, its own 2,000 ms load
budget, a fresh 2,000 ms assertion budget, exact iframe+worker flags, nonzero
native-branch assertions, and Native exit 0. The helper graph, patch, replay,
and base hashes are in `manifest.json`. Both canonical ports were rebound and
closed successfully after the replay.

No full 455 run was performed on this header-corrected graph. The earlier
451/455 positive count and its four nonpassing outcomes remain unchanged in
`../native455-canonical/`; this is one separately attributed corrected control.
