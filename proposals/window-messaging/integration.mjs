// Opt-in source overlays only. Never edits production Browser/Worker sources.
import { registerHooks } from 'node:module';
import { transformMessaging } from './codec-overlay.mjs';
const moduleURL=new URL('./messaging.mjs',import.meta.url).href;
const bindingURL=new URL('./entry-binding.mjs',import.meta.url).href;
const thisURL=import.meta.url;
const patches=new Map([
 [new URL('../../test/messaging.test.js',import.meta.url).href,{
  imports:'',edits:[["  assert.throws(() => carrier.port1.postMessage(new window.Blob(['unsupported'])), { name: 'DataCloneError' });", "  const clonedBlob = window.structuredClone(new window.Blob(['supported']));\n  assert.ok(clonedBlob instanceof window.Blob); assert.equal(clonedBlob.size, 9);"]]
 }],
 [new URL('../../src/browser.js',import.meta.url).href,{
  imports:`import { installWindowMessaging, installBroadcast } from ${JSON.stringify(moduleURL)};\nimport { binding as messagingEntry } from ${JSON.stringify(bindingURL)};\n`,
  edits:[['    installGeometry(window);','    installWindowMessaging(this, window, {entry: messagingEntry});\n    installBroadcast(this, window);\n    installGeometry(window);']]
 }],
 [new URL('../../src/workers.js',import.meta.url).href,{
  imports:`import { broadcastConfig } from ${JSON.stringify(new URL('./broadcast-config.mjs',import.meta.url).href)};\nimport { createBroadcastRealm, createBroadcastRelay } from ${JSON.stringify(new URL('./broadcast-realm.mjs',import.meta.url).href)};\n`,
  edits:[
   ['// Blob/File/SharedArrayBuffer message cloning and\n// importScripts has an 8MiB response limit.', '// Blob/File message values preserve native bytes and metadata through private codecs.\n// SharedArrayBuffer messages reject explicitly. importScripts has an 8MiB response limit.'],
   ['    #thread; #abort =', '    #thread; #broadcastRelay; #abort ='],
   ["      let startupBlob = url.protocol === 'blob:' ? resolveBlobURL(page, url.href) : undefined;", "      let startupBlob = url.protocol === 'blob:' ? resolveBlobURL(page, url.href) : undefined;\n      this.#broadcastRelay = createBroadcastRelay(messaging, broadcastConfig(page,window));"],
   ["      this.#thread.on('message', async message => {", "      this.#thread.on('message', async message => {\n        if(message.kind==='broadcastRelay'){this.#broadcastRelay.accept(message);return;}\n        if(message.kind==='broadcastReady'){this.#broadcastRelay.ready(message.id);return;}\n        if(message.kind==='broadcastCancel'){this.#broadcastRelay.cancel(message.id);return;}"],
   ["this.#thread.once('exit', () => { owned.delete(this);", "this.#thread.once('exit', () => { this.#broadcastRelay.exit(); owned.delete(this);"],
   ["execArgv: typeof vm.SourceTextModule === 'function' ? ['--experimental-vm-modules'] : []",`execArgv: [...(typeof vm.SourceTextModule === 'function' ? ['--experimental-vm-modules'] : []), '--import', ${JSON.stringify(thisURL)}]`],
   ['        redPandaWorker: true, url: url.href, type, name:', '        redPandaWorker: true, broadcast: broadcastConfig(page, window), url: url.href, type, name:'],
   ['ready = false, closed = false, context, emit, messaging, streams;', 'ready = false, closed = false, context, emit, messaging, streams, broadcast;'],
   ['messaging?.dispose();', 'messaging?.dispose(); broadcast?.dispose();'],
   ['else { const event = messaging.receive(message); emit(event.data, event.ports); }', "else { messaging.deliver(vm.runInContext('globalThis', context), message, ({data,ports})=>emit(data,ports)); }"],
   ['if (!closed) { const event = messaging.receive(message); emit(event.data, event.ports); }', "if (!closed) { messaging.deliver(vm.runInContext('globalThis', context), message, ({data,ports})=>emit(data,ports)); }"],
   ["const createTrustedMessage = (type, data, ports) => { const event = new MessageEvent(type, { data, ports });", "const createTrustedMessage = (type, data, ports, origin = '') => { const event = new MessageEvent(type, { data, ports, origin });"],
   ['  Object.assign(context, { MessageChannel: messaging.MessageChannel, MessagePort: messaging.MessagePort });',
    `  Object.assign(context, { MessageChannel: messaging.MessageChannel, MessagePort: messaging.MessagePort });\n  broadcast = createBroadcastRealm(vm.runInContext('globalThis', context), {messaging, config:workerData.broadcast, active:()=>!closed, relay:value=>parentPort.postMessage(value), dispatch:(target,type,data,ports,origin)=>target.dispatchEvent(createTrustedMessage(type,data,ports,origin)), reportError:value=>dispatchError(value)});\n  Object.assign(context,{BroadcastChannel:broadcast.BroadcastChannel});`],
  ]
 }],
]);
export function transformSource(url,source){
 const patch=patches.get(url),messaging=url===new URL('../../src/messaging.js',import.meta.url).href;
 if(messaging)return transformMessaging(source);if(!patch)return source;
 for(const[before,after]of patch.edits){if(!source.includes(before))throw new Error(`Messaging integration anchor changed: ${url}: ${before}`);source=source.replace(before,after)}return patch.imports+source;
}
export const hook=registerHooks({load(url,context,nextLoad){const loaded=nextLoad(url,context);if(!patches.has(url)&&url!==new URL('../../src/messaging.js',import.meta.url).href)return loaded;const source=typeof loaded.source==='string'?loaded.source:new TextDecoder().decode(loaded.source);return{...loaded,source:transformSource(url,source)}}});
