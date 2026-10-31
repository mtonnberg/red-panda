Worker cancellation and event foundation

These three raw oracle tables were obtained from the pinned Native executable
SHA256 9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f,
using actual dedicated Blob workers with worker resources enabled. They contain
48 independently executed controls. The JavaScript inputs are retained beside
the tables. The proposal retains the CDP expressions, probe hash and raw logs.

The independent adapter creates Event/EventTarget/MessageEvent/ErrorEvent and
AbortController/AbortSignal public values in the selected VM. Host WeakMaps own
real private Node event/controller/signal backends. Node prototypes and symbol
markers confer no public brands. Real Node AbortSignal.any dependencies set
reasons before source callbacks and dispatch dependent events afterward; actual
abort cleanup resists authored stopImmediatePropagation. Callback arguments,
listener identity/order/capture/once/passive/handler state, and cancellation
flow through the actual backend. Native's empty composedPath for these worker
targets and preserved composed flag through initEvent are measured here.

Worker fetch unwraps only a genuinely registered signal to its actual backend.
Request/Response/Headers/Blob and other existing Node-backed Worker values are
outside this frontend change; in particular Request.signal is not claimed as a
selected-VM wrapper. No nested workers, new scheduler support, or additional
worker event interfaces are introduced. Worker termination still destroys the
owned thread; close cancels the adapter's timeout jobs and removes listeners.

The focused test also runs direct public V8 sameRealm/creationGlobal checks in
a real Node thread for eleven public objects/functions/getters, repeats the
checks after nulling prototypes, and rejects Host creation contexts. It uses
the existing source-and-binary-verified native heap binding without a heap scan.

The DOMException dependency is owned by the separate Worker DOMException
proposal; exact module SHA256 is
02dff903451159c4dee70ac10cae2163ca6d5b5dea4e48069cb36bc761b655a3.
