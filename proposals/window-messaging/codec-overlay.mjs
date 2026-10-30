// Exact opt-in edits to the existing independent messaging realm. Production
// source stays untouched; root can review/apply these edits after source freeze.
const moduleURL=new URL('./platform-codec.mjs',import.meta.url).href;
export function transformMessaging(source){
 const edit=(before,after)=>{if(!source.includes(before))throw new Error(`Platform codec anchor changed: ${before}`);source=source.replace(before,after)};
 edit(' * Blob/File/SharedArrayBuffer and DOM platform objects currently reject rather\n * than losing their native state while cloning.', ' * Blob/File preserve their immutable bytes and private metadata through graph\n * codecs. SharedArrayBuffer and other DOM platform objects reject explicitly.');
 edit('  const EventTarget = realm.EventTarget;','  const codec = createPlatformCodec(realm);\n  const deliveryQueues = new WeakMap(), pendingDeliveries = new Set();\n  const EventTarget = realm.EventTarget;');
 edit('function encode(value, allowed, seen = new Map()) {','function encode(value, allowed, seen = new Map(), platforms) {');
 edit('    if (types.isSharedArrayBuffer(value)) throw cloneError(\'SharedArrayBuffer messaging is not implemented\');',`    const platform = codec.serialize(value);
    if (platform) { const placeholder = {}; seen.set(value, placeholder); platforms.set(placeholder, platform); return placeholder; }
    if (types.isSharedArrayBuffer(value)) throw cloneError('SharedArrayBuffer messaging is not implemented');`);
 for(const value of['value.cause','key','item','value[key]'])source=source.replaceAll(`encode(${value}, allowed, seen)`,`encode(${value}, allowed, seen, platforms)`);
 edit('    const message = { data: encode(data, allowed), ports };','    const platforms = new Map();\n    const message = { data: encode(data, allowed, new Map(), platforms), ports };\n    if (platforms.size) message.platforms = platforms;');
 edit('function adopt(value, seen = new Map()) {','function adopt(value, seen = new Map(), platforms) {');
 edit('    if (value instanceof NativePort) { const result = wrap(value); seen.set(value, result); return result; }','    if (platforms?.has(value)) { const result = codec.deserialize(platforms.get(value)); seen.set(value, result); return result; }\n    if (value instanceof NativePort) { const result = wrap(value); seen.set(value, result); return result; }');
 for(const value of['value.buffer','value.cause','key','item','value[key]'])source=source.replaceAll(`adopt(${value}, seen)`,`adopt(${value}, seen, platforms)`);
 edit('    const seen = new Map(), ports = new I.Array();\n    for (const port of message.ports) ports.push(adopt(port, seen));\n    return { data: adopt(message.data, seen), ports: I.Object.freeze(ports) };',`    const platforms = codec.records(message), seen = new Map(), ports = new I.Array(message.ports.length);
    for (let index = 0; index < message.ports.length; index++) Object.defineProperty(ports, index, {value: adopt(message.ports[index], seen, platforms), enumerable: true, configurable: true, writable: true});
    return { data: adopt(message.data, seen, platforms), ports: Object.freeze(ports) };`);
 edit(`  function dispatchMessage(target, message, type = 'message') {
    const { data, ports } = receive(message); emit(target, type, data, ports);
  }`, `  function dropMessage(message) { for (const port of message?.ports ?? []) if (port instanceof NativePort) port.close(); }
  function deliver(target, message, callback, guard = () => true) {
    const valid = () => { const port = PORTS.get(target); return live() && guard() && (!port || (!port.closed && !port.detached)); };
    const previous = deliveryQueues.get(target);
    if (!previous && !codec.needsAsync(message)) {
      if (!valid()) { dropMessage(message); return; }
      return callback(receive(message));
    }
    const work = { message }; pendingDeliveries.add(work);
    let operation;
    operation = (previous ?? Promise.resolve()).then(async () => {
      if (!valid()) { dropMessage(message); return; }
      await codec.hydrate(message);
      if (!valid()) { dropMessage(message); return; }
      callback(receive(message));
    }).catch(error => {
      dropMessage(message);
      if (valid()) { try { emit(target, 'messageerror', null, I.Object.freeze(new I.Array())); } catch (eventError) { reportError(eventError); } }
    }).finally(() => {
      pendingDeliveries.delete(work);
      if (deliveryQueues.get(target) === operation) deliveryQueues.delete(target);
    });
    deliveryQueues.set(target, operation); return operation;
  }
  function dispatchMessage(target, message, type = 'message', guard) {
    return deliver(target, message, ({data, ports}) => emit(target, type, data, ports), guard);
  }
  function prepareBroadcast(data) {
    const prepared = prepare(data);
    let message;
    try { message = nativeClone(prepared.message); prepared.commit(); }
    catch (error) { if(error?.name==='DataCloneError')throw cloneError(error.message);throw error; }
    const pending = codec.needsBroadcastBytes(message);
    if (!pending) codec.stripNativeHandles(message);
    return {message, pending};
  }`);
 edit('  function clone(data, options) {\n    const prepared = prepare(data, options);',"  function clone(data, options) {\n    const prepared = prepare(data, options);\n    if (codec.needsAsync(prepared.message)) throw cloneError('Synchronous clone cannot asynchronously read an embedded native Blob');");
 edit('    disposed = true;\n    for (const state of [...owned])', '    disposed = true;\n    for (const work of pendingDeliveries) dropMessage(work.message); pendingDeliveries.clear();\n    for (const state of [...owned])');
 edit('return { MessageChannel, MessagePort, prepare, receive, dispatchMessage, clone, discard, wrap,','return { MessageChannel, MessagePort, prepare, receive, deliver, prepareBroadcast, broadcastBody: codec.broadcastBody, dispatchMessage, clone, discard, wrap,');
 return`import { createPlatformCodec } from ${JSON.stringify(moduleURL)};\n`+source;
}
