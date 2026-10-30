# Document-content lifecycle public controls

The pinned official native binary rejects `Page.setDocumentContent` with-32601
`'Page.setDocumentContent' wasn't found`. The preserved request included the real
frameId and HTML referencing an owned held external script. No script request was
made, and the original complete document remained unchanged. See
[document-content-native-unsupported.json](document-content-native-unsupported.json)
and its hash-bound [driver](document-content-lifecycle-probe.mjs). Later
networkIdle events in that timeline belong to the initial navigation and do not
establish method support.

A separate ordinary `Runtime.evaluate` control executes
`document.open(); document.write(html); document.close(); "written"`.
[document-write-lifecycle-probe.mjs](document-write-lifecycle-probe.mjs) serves the
actual external script from an owned port0 server and releases its bytes after a
300ms host timer. No second CDP command is needed to release it, so CDP command
serialization cannot deadlock the control. The probe uses no heap API.
[document-write-native-lifecycle.json](document-write-native-lifecycle.json)
retains the full ordered console/protocol/HTTP timeline and response.

The observed sequence was:

1. Inline-start runs with readyState loading; HTTP requests the held script.
2. Host releases script bytes; held script runs while loading, then inline-tail.
3. readyState interactive; document DOMContentLoaded callback;
   Page.domContentEventFired; lifecycle DOMContentLoaded.
4. readyState complete; window load callback; Page.loadEventFired;
   lifecycle load; Page.frameStoppedLoading.
5. Runtime.evaluate response returns the actual string `written`.
6. Network-almost-idle/idle follow later.

There was no `init` event in this document-write reset window. Final actual DOM
state was readyState complete, held-script value42 and the written paragraph's
text. The original script wait/release was about300ms; these are one bounded
process's observations, not general timing guarantees or an implemented native
Page.setDocumentContent contract.

For the candidate's additional setDocumentContent method, a real document reset
forwarder should own the lifecycle events. An unconditional immediate
init/DOMContentLoaded/load emission can duplicate the forwarder's genuine events
and announce load before held resources execute. Root owns that integration and
its separate candidate regressions. Neither probe changes production code.
