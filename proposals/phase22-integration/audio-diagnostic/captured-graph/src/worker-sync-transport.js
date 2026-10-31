let requestId = 0;

export function completeWorkerSocketPolicy(shared,policy,error) {
  const state=new Int32Array(shared,0,2),destination=new Uint8Array(shared,8);
  let encoded=new TextEncoder().encode(JSON.stringify(error?{error:String(error.message??error)}:{policy}));
  if(encoded.length>destination.length)encoded=new TextEncoder().encode(JSON.stringify({error:'Socket policy exceeds its metadata limit'}));
  destination.set(encoded.subarray(0,destination.length));Atomics.store(state,1,Math.min(encoded.length,destination.length));Atomics.store(state,0,1);Atomics.notify(state,0);
}
export function createSyncWorkerSocketPolicy(port,{maxBytes=1024*1024,timeoutMs=5000}={}) {
  return (url,protocols)=>{
    const shared=new SharedArrayBuffer(maxBytes+8),state=new Int32Array(shared,0,2);
    port.postMessage({kind:'socketPolicy',url,protocols,sync:shared});
    if(Atomics.wait(state,0,0,timeoutMs)==='timed-out'||Atomics.load(state,0)!==1)throw new DOMException('Socket policy did not complete','TimeoutError');
    const result=JSON.parse(new TextDecoder().decode(new Uint8Array(shared,8,Atomics.load(state,1))));
    if(result.error)throw new DOMException(result.error,'NetworkError');return result.policy;
  };
}

// Both ends use the existing worker request/parent Page.fetch channel. Only the
// private synchronous envelope adds base64 to retain arbitrary bytes in JSON.
export function completeWorkerSyncResponse(shared, result, error) {
  const state = new Int32Array(shared, 0, 2), destination = new Uint8Array(shared, 8);
  let encoded;
  try {
    encoded = new TextEncoder().encode(JSON.stringify(error ? { error: String(error.message ?? error) }
      : { ...result, bytes: undefined, bodyBase64: Buffer.from(result.bytes).toString('base64') }));
    if (encoded.length > destination.length) throw new Error('Synchronous worker response exceeds its 8MiB envelope limit');
  } catch (cause) { encoded = new TextEncoder().encode(JSON.stringify({ error: String(cause.message) })); }
  destination.set(encoded.subarray(0, destination.length)); Atomics.store(state, 1, Math.min(encoded.length, destination.length));
  Atomics.store(state, 0, 1); Atomics.notify(state, 0);
}

export function createSyncWorkerRequest(port, { maxBytes = 8 * 1024 * 1024, timeoutMs = 5000 } = {}) {
  return (url, init, requestTimeout = 0) => {
    const shared = new SharedArrayBuffer(maxBytes + 8), state = new Int32Array(shared, 0, 2), id = `xhr-sync-${++requestId}`;
    port.postMessage({ kind: 'request', id, url, init, script: false, resourceType: 'XHR', sync: shared, syncBinary: true });
    const waited = Atomics.wait(state, 0, 0, requestTimeout > 0 ? Math.min(timeoutMs, requestTimeout) : timeoutMs);
    if (waited === 'timed-out' || Atomics.load(state, 0) !== 1) {
      port.postMessage({ kind: 'cancel', id }); throw new DOMException('Synchronous worker request did not complete', 'TimeoutError');
    }
    const result = JSON.parse(new TextDecoder().decode(new Uint8Array(shared, 8, Atomics.load(state, 1))));
    if (result.error) throw new DOMException(result.error, 'NetworkError');
    result.bytes = new Uint8Array(Buffer.from(result.bodyBase64, 'base64')); delete result.bodyBase64; return result;
  };
}
