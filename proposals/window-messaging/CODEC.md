# Platform graph codec and broadcast relay

The codec extends the existing independent MessagePort graph encoder instead
of replacing it with a JSON serializer. Actual Node structured clone and real
Node ports still perform serialization, copying and transfer. Source DOM Blob
and File instances are recognized through pinned implementation classes;
worker NativeBlob/File instances use captured native intrinsic getters. Source
authored marker fields and Symbol.toStringTag never select a platform node.

For a recognized platform value, encode creates one fresh graph placeholder,
stores its genuine typed metadata in a private envelope Map, and records that
placeholder in the ordinary graph's shared-reference map. Metadata carries
actual copied DOM bytes or an immutable native Blob handle, MIME and, for File,
actual name and lastModified. Native cloning of the whole envelope preserves
the identity between a placeholder in data/Map keys/arrays and its key in the
private metadata Map. Decode substitutes an actual captured receiver Blob/File
constructor result once, then reuses that object for every graph reference.
The metadata Map is never exposed to page code.

DOM Blob bytes are captured synchronously from the real implementation buffer.
Worker blobs are immutable, so a real cloned NativeBlob handle captures the
posted value without asynchronously reading mutable authored input. Node bytes
are read with the captured public Blob.arrayBuffer intrinsic, not private Node
symbols or an authored method override. Per-target delivery queues hold later
messages until an earlier hydration finishes and recheck document/port lifetime
before event delivery. Abort/disposal closes undelivered transferred endpoints.

Synchronous Window structuredClone can construct actual DOM blobs from local
byte snapshots; synchronous worker structuredClone can construct actual native
blobs/files from immutable native handles. A host-injected NativeBlob with no
synchronous DOM byte snapshot remains an explicit unsupported case for the
synchronous Window clone operation. Async Window/port/worker event delivery
supports that real handle through public byte hydration.

Node24.22.1 and Node26.13.0 both fail native BroadcastChannel posting of a Blob
or File to two recipients. The independent runtime probe and reports retain
the minimal reproduction. Broadcasting a native platform handle therefore
cannot substitute for a working multi-recipient implementation.

The BC transport uses these private frames over actual Node BroadcastChannels:

1. A ready byte envelope posts as one message, taking Node's real recipient
   snapshot immediately.
2. An envelope needing native byte reads first synchronously clones its native
   handle to the actual parent MessagePort, then posts a native BC reservation.
   Only actual recipients of that reservation create a pending delivery slot.
3. The source signals ready after reservation publication. The parent reads
   its own immutable clone, removes native handles from the wire graph and
   broadcasts the genuine byte body through a private native publisher.
4. A body fills only a matching reservation. New channels lacking that
   reservation ignore it. Later ready messages wait behind earlier reserved
   slots; closing a receiver discards its pending slots.

The parent relay owns staged jobs independently of the Worker facade's
terminated flag. Relay frames are handled before normal Worker message/drop
checks. Physical thread exit flushes staged jobs even if forced termination
interrupted the ready signal. When exit triggers publication, any source
reservation that existed was posted before physical exit and therefore before
the body's later native publication; without a reservation, receivers ignore
the body. A closed source channel does not cancel already posted serialized
data. Native handles are unref'd, and the private publisher closes after flush.

No local callback bus delivers a user broadcast. Parent MessagePorts carry the
immutable serialization work to its owner; actual NativeBroadcastChannels fix
recipients and deliver reservation/body frames. Internal frame fields are not
read from authored message payloads, which remain nested in their independently
encoded graph. BrowserContext/origin/name namespace tokens stay private.

The focused controls verify real byte/name/mtime/realm identity, cycles and
Map/Set aliases, actual port/buffer transfer interaction, numeric prototype
setters, per-recipient independence, FIFO, late subscription, closed receivers,
sender close, immediate Worker termination and actual physical termination
between reservation and ready. SharedArrayBuffer remains DataCloneError, as
observed in the target.
