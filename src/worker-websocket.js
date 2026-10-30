import { WebSocket as Socket } from 'ws';

/** Real dedicated/service-worker socket connections with realm event adapters.
 * Cookie, proxy and redirect policy integration remain explicit limitations.
 */
export function installWebSocket(realm, { evaluate, origin, baseURL, signal, active = () => !signal?.aborted, trustEvent = value => value } = {}) {
  if (typeof evaluate !== 'function') throw new TypeError('An actual realm evaluator is required');
  const ownerActive = active; let disposed = false;
  active = () => !disposed && ownerActive();
  const states = new WeakMap(), live = new Set();
  let emit;
  const state = object => { const result = states.get(object); if (!result) throw new realm.TypeError('Illegal invocation'); return result; };
  const bridge = {
    open(object, input, protocols) {
      let url;
      try { url = new URL(String(input), typeof baseURL === 'function' ? baseURL() : baseURL ?? realm.location?.href); } catch { throw new realm.DOMException('Invalid WebSocket URL', 'SyntaxError'); }
      if (url.protocol === 'http:') url.protocol = 'ws:';
      if (url.protocol === 'https:') url.protocol = 'wss:';
      if (!['ws:', 'wss:'].includes(url.protocol) || url.href.includes('#') || url.username || url.password) throw new realm.DOMException('Invalid WebSocket URL', 'SyntaxError');
      const list = typeof protocols === 'string' ? [protocols] : Array.from(protocols ?? [], String);
      if (list.some(value => !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value))) throw new realm.DOMException('Invalid WebSocket subprotocol', 'SyntaxError');
      const s = { object, url: url.href, protocol: '', extensions: '', readyState: 0, binaryType: 'blob', pendingBytes: 0, queue: Promise.resolve() };
      states.set(object, s);
      if (!active()) throw new realm.DOMException('The worker is disposed', 'InvalidStateError');
      let socket;
      try { socket = new Socket(s.url, [...new Set(list)], {
        origin: origin ?? realm.location?.origin ?? 'null', perMessageDeflate: false, maxPayload: 16 * 1024 * 1024,
        // Native accepts duplicate offered protocols and sends them verbatim.
        // ws validates a unique negotiation set; its public request hook lets
        // the genuine HTTP upgrade retain the original ordered offer bytes.
        finishRequest(request) { if (list.length) request.setHeader('Sec-WebSocket-Protocol', list.join(', ')); request.end(); },
      }); }
      catch (error) { throw new realm.DOMException(String(error.message), 'SyntaxError'); }
      s.socket = socket; live.add(s);
      socket.on('open', () => { if (!active()) { socket.terminate(); return; } s.readyState = 1; s.protocol = socket.protocol; s.extensions = socket.extensions; emit(object, 'open'); });
      socket.on('message', (bytes, binary) => {
        if (!active()) return;
        let data = bytes.toString();
        if (binary) {
          const array = new realm.Uint8Array(bytes.length); array.set(bytes);
          data = s.binaryType === 'arraybuffer' ? array.buffer : new realm.Blob([array.buffer]);
        }
        emit(object, 'message', { data, origin: '' });
      });
      socket.on('error', () => { if (active()) emit(object, 'error'); });
      socket.on('close', (code, reason) => {
        live.delete(s); s.readyState = 3;
        if (active()) emit(object, 'close', { code, reason: reason.toString(), wasClean: code !== 1006 });
      });
    },
    get(object, key) { const s = state(object); return key === 'bufferedAmount' ? s.pendingBytes + (s.socket?.bufferedAmount ?? 0) : s[key]; },
    binaryType(object, value) { const s = state(object); value = String(value); if (['blob', 'arraybuffer'].includes(value)) s.binaryType = value; },
    send(object, value) {
      const s = state(object);
      if (s.readyState === 0) throw new realm.DOMException('The object is in an invalid state', 'InvalidStateError');
      let data = value, length, binary = false;
      const blob = value instanceof Blob;
      if (blob) { length = value.size; binary = true; }
      else if (ArrayBuffer.isView(value)) { data = new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice(); length = data.byteLength; binary = true; }
      else if (Object.prototype.toString.call(value) === '[object ArrayBuffer]') { data = new Uint8Array(value).slice(); length = data.byteLength; binary = true; }
      else { data = String(value); length = Buffer.byteLength(data); }
      s.pendingBytes += length;
      if (s.readyState >= 2) return;
      s.queue = s.queue.then(async () => {
        if (!active()) return;
        if (blob) data = new Uint8Array(await Blob.prototype.arrayBuffer.call(value));
        if (s.socket.readyState !== Socket.OPEN) return;
        await new Promise(resolve => s.socket.send(data, { binary }, () => resolve()));
      }).catch(() => { if (active()) emit(object, 'error'); }).finally(() => { s.pendingBytes -= length; });
    },
    close(object, code, reason = '') {
      const s = state(object); reason = String(reason);
      if (code !== undefined) { code = Number(code) >>> 0; if (code !== 1000 && (code < 3000 || code > 4999)) throw new realm.DOMException('The object does not support the operation or argument', 'InvalidAccessError'); }
      if (Buffer.byteLength(reason) > 123) throw new realm.DOMException('WebSocket close reason is too long', 'SyntaxError');
      if (s.readyState >= 2) return;
      const connecting = s.readyState === 0; s.readyState = 2;
      if (connecting) { s.socket.close(); return; }
      void s.queue.then(() => { if (active()) s.socket.close(code, reason); });
    },
  };
  const result = evaluate(`(bridge => {
    class CloseEvent extends Event {
      constructor(type, init={}){super(type,init);Object.defineProperties(this,{code:{value:Number(init.code??0)>>>0,enumerable:true},reason:{value:String(init.reason??''),enumerable:true},wasClean:{value:Boolean(init.wasClean),enumerable:true}})}
      get [Symbol.toStringTag](){return 'CloseEvent'}
    }
    class WebSocket extends EventTarget {
      constructor(url,protocols){super();if(arguments.length===0)throw new TypeError('A WebSocket URL is required');bridge.open(this,url,protocols)}
      get url(){return bridge.get(this,'url')}get protocol(){return bridge.get(this,'protocol')}get extensions(){return bridge.get(this,'extensions')}
      get readyState(){return bridge.get(this,'readyState')}get bufferedAmount(){return bridge.get(this,'bufferedAmount')}
      get binaryType(){return bridge.get(this,'binaryType')}set binaryType(value){bridge.binaryType(this,value)}
      send(data){if(arguments.length===0)throw new TypeError('A WebSocket payload is required');return bridge.send(this,data)}
      close(code,reason){return bridge.close(this,code,reason)}
      get [Symbol.toStringTag](){return 'WebSocket'}
    }
    const handlers=new WeakMap();
    for(const type of ['open','message','error','close'])Object.defineProperty(WebSocket.prototype,'on'+type,{enumerable:true,configurable:true,get(){return handlers.get(this)?.[type]??null},set(value){let record=handlers.get(this);if(!record){record=Object.create(null);handlers.set(this,record)}if(record[type])this.removeEventListener(type,record[type]);record[type]=typeof value==='function'?value:null;if(record[type])this.addEventListener(type,record[type])}});
    for(const [name,value]of Object.entries({CONNECTING:0,OPEN:1,CLOSING:2,CLOSED:3}))for(const target of[WebSocket,WebSocket.prototype])Object.defineProperty(target,name,{value,enumerable:true});
    return {WebSocket,CloseEvent,emit(object,type,init){const event=type==='message'?new MessageEvent(type,init):type==='close'?new CloseEvent(type,init):new Event(type);object.dispatchEvent(bridge.trust(event))}};
  })`)({ ...bridge, trust: trustEvent });
  emit = result.emit;
  Object.assign(realm, { WebSocket: result.WebSocket, CloseEvent: result.CloseEvent });
  const dispose = () => { disposed = true; for (const s of live) { s.readyState = 3; s.socket.terminate(); } live.clear(); signal?.removeEventListener('abort', dispose); };
  signal?.addEventListener('abort', dispose, { once: true });
  return { dispose };
}
