# Independent streams and text/compression transforms

Reference: verified Lightpanda executable
`/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux`, version
`1.1.0-nightly.11326+948d77378`, SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
Evidence uses data documents and an owned local HTTP server/worker. No upstream
production implementation was copied. Raw probe expressions, exit statuses and
outputs are preserved in `streams-native-*.json`.

Native Window and dedicated Worker expose the same 16 constructors:

- ReadableStream, ReadableStreamDefaultReader, ReadableStreamDefaultController.
- WritableStream, WritableStreamDefaultWriter, WritableStreamDefaultController.
- TransformStream, TransformStreamDefaultController.
- ByteLengthQueuingStrategy and CountQueuingStrategy.
- TextEncoder, TextDecoder, TextEncoderStream and TextDecoderStream.
- CompressionStream and DecompressionStream.

Native BYOB reader/controller/request constructors are absent. Reader, writer
and controller direct construction throws TypeError `Illegal Constructor`.
Native reader.closed, ReadableStream.tee, WritableStream.abort/close and
writer.abort are absent; reader methods and writer.closed/ready are present.
An asynchronous iterator is present. gzip, deflate and deflate-raw are accepted;
br, GZIP and empty formats throw TypeError. These facts were measured in Window
and availability was separately measured inside a genuinely fetched Worker.
The native Worker also executes the complete cancellation/UTF-8/gzip/pressure
behavior fixture and produces the same result as Window.

Confirmed native quirks reproduced with real stream state:

- Reader.cancel releases its lock synchronously, even when underlying cleanup
  returns an unresolved promise. Pending reads resolve done; later reads reject.
- ReadableStream source.type `bytes` and `other` both produce a default
  controller. getReader({mode:'byob'}) still produces a default reader, accepting
  ordinary string chunks. The adapter ignores these options rather than
  exposing a pretend BYOB implementation.
- TextEncoderStream independently encodes every chunk. A surrogate pair split
  between chunks becomes two U+FFFD characters. A real TransformStream and
  Node's UTF-8 TextEncoder implement this while retaining actual backpressure.
  TextDecoderStream retains incomplete UTF-8 bytes and decodes a split euro sign.

`streams-independent-behavior.json` records exact equality with one native
behavior fixture: cancellation reason/state, split-surrogate encoded bytes,
complete gzip bytes, desiredSize and pull count. The native gzip output was
also independently inflated using Node zlib. This is a bounded fixture agreement,
not a general byte-compatibility or complete browser-parity claim.

## API and integration

```js
import { installStreams, STREAM_CONSTRUCTORS } from './streams.js';
const streams = installStreams(page, window);
// install before inline scripts, after any initial TextEncoder/Decoder setup
const body = streams.adopt(rawResponse.body); // null is preserved
streams.dispose();                         // idempotent
```

The installation is idempotent per realm. Options accept `{signal}`; the default
is `page.documentAbort?.signal`. The returned object contains the frozen
constructor map, adopt(value), dispose(reason), and a disposed getter.
`STREAM_CONSTRUCTORS` is a frozen inventory of names. No top-level global is
modified by importing the module, and no new dependency is required.

Window integration must install before Fetch and page code. Fetch Request.body
and Response.body getters should return `streams.adopt(raw.body)`; native bodies
already satisfy instanceof window.ReadableStream through the constructor's
native-brand instance test, but adoption adds the document's constructor/methods,
realm promises, realm read records and Uint8Array results. Existing Fetch handles
its network/document abort behavior; this module does not implement networking.
Real Node Response(stream), text consumption and clone are tested to ensure the
adapter preserves Node's stream internal slots and Fetch brand recognition.

Worker integration after vm.createContext:

```js
const workerRealm = vm.runInContext('globalThis', context);
const streams = installStreams(null, workerRealm, { signal: workerLifetimeSignal });
```

Install before startup script/module evaluation; the VM must provide its normal
Promise/Function/Error/Object/Array/Uint8Array intrinsics, and should expose its
DOMException. Adopt native Worker Fetch bodies too. Native module functions are
reused through adapters; this module performs no message transport and changes
no Worker or Fetch implementation on its own.

Promises, methods/constructors, ordinary read records, TextEncoder output and
Node-origin Uint8Array chunks are adapted to the receiving realm. Source/sink
callbacks receive real adopted controllers, the original callback receiver and
ordinary realm chunks without changing their identities. Throwing source/sink
errors, controller errors, actual lock state, writer.ready/closed, queue pressure,
pipe cancellation/abort and transformation errors use real Node WebStreams.
Compression bytes are validated by independent zlib inflation, not by matching a
canned response. Decoders reject malformed UTF-8 with fatal mode; decompression
rejects malformed compressed input.

Dispose rejects pending adapter promises with AbortError (or supplied reason),
cancels adopted readers/unlocked readable streams, aborts adopted writers/unlocked
writable streams, and errors tracked controllers. Actual cancel/abort algorithms
run for directly owned sources/sinks. The document signal invokes this once.
Constructors and operational methods reject after disposal. Pure state getters
remain inspectable. Ownership tags use WeakMap keys and an iterable set of
WeakRefs; FinalizationRegistry holdings and unregister tokens contain only those
WeakRefs. The installation therefore does not retain completed/consumed Fetch
bodies, readers or controllers. Settled adapter operations remove their pending
entries. Disposal takes a temporary strong snapshot of still-live instances,
performs cancellation/error propagation, then releases that snapshot; its timing
does not depend on garbage collection or finalizer delivery.

## Explicit remaining gaps

- A working tee() method is deliberately retained beyond the observed native
  surface because Node Fetch Response.clone() calls that public method. It
  creates actual tee branches and preserves clone behavior. Node's other
  string-named prototype extensions are shadowed with undefined, so reflective
  own-property lists still differ from the reference.
- The native prototype remains in each adapter's prototype chain to satisfy
  Node Fetch brand checks. Consequently adapted stream instances do not inherit
  the document's Object.prototype. This is not full realm isolation. Constructor
  subclassing and exact cross-realm/prototype/error-message identity are not
  established. The VM/DOM bridges are not a security sandbox.
- Streams are not transferable through this browser's messaging implementation.
  This helper neither enables nor acknowledges unsupported transfers. A stream
  shared directly by host code between realms has one mutable adapter prototype;
  host code must not adopt the same object into multiple live realms.
- Internally acquired readers/writers in an ongoing pipe are not all directly
  tracked. Controller errors propagate, but disposal does not guarantee invocation
  of every custom cancellation callback in such pipelines. The pipeTo signal is
  the tested way to request full source cancellation and sink abort. Fetch also
  retains its existing transport cancellation hook.
- Native non-string TextEncoderStream input probes (undefined, null, number)
  failed to settle before a two-second SIGKILL deadline; this does not establish
  a successful native coercion/error contract. The independent implementation
  stringifies these values. Rejected native cancellation cleanup also produced
  no result in the bounded saved-script probe. Such hangs are not emulated.
- General encoding-label differences, all queue/error scheduling permutations,
  compressed-output byte equality outside the recorded fixture, large stream
  resource limits and exact native lifetime/GC behavior remain unverified.

Validation: `node --test test/streams.test.js` exercises real local HTTP Fetch,
Response(stream)/clone/abort, reader locks, source pull pressure, writer.ready,
actual transforms, asynchronous iteration, source/sink reason identity, piping
signals/errors, UTF-8 chunk boundaries, all three compression formats, malformed
input, disposal and a separately created Worker-like VM realm.
