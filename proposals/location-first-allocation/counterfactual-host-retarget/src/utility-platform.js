// Trusted original document scheduling captured before author code. Each public
// entry and callback executes in its own real utility VM; no main API is aliased.
import vm from 'node:vm';
import { createInvocationTrampoline } from './invocation.js';
const prepared = new WeakMap();
const apply = Reflect.apply;
export function prepareUtilityPlatform(window) {
  if (!prepared.has(window)) prepared.set(window, {
    request:window.requestAnimationFrame, cancel:window.cancelAnimationFrame,
    performance:window.performance,
  });
}
function animationFactory(g,bridge) {
  const methods={
    requestAnimationFrame(callback) { if(typeof callback!=='function')throw new TypeError('invalid argument');return bridge.request(callback); },
    cancelAnimationFrame(handle) { const value=+handle;bridge.cancel(Number.isFinite(value)?Math.trunc(value)>>>0:0); },
  };
  for(const[name,value]of Object.entries(methods))Object.defineProperty(g,name,{value,writable:true,configurable:true,enumerable:true});
}
export function installUtilityAnimationFrame(page,world,main=page.dom.window,{report=error=>page.emit('pageError',error)}={}) {
  const source=prepared.get(main);
  if(!source||typeof source.request!=='function'||typeof source.cancel!=='function')throw new Error('The actual document scheduler must be prepared before author code');
  const pending=new Set(),signal=page.documentAbort.signal,invocation=createInvocationTrampoline(world.context);
  let disposed=false;
  // This is a genuine generated Performance wrapper over the shared document
  // implementation. The main wrapper and its authored expandos are not reused.
  Object.defineProperty(world.global,'performance',{value:world.wrap(source.performance),configurable:true,enumerable:true});
  const bridge={
    request(callback) {
      if(disposed)return 0;
      let id;id=apply(source.request,main,[timestamp=>{pending.delete(id);if(disposed)return;try{invocation.invoke(callback,world.global,[timestamp],{timeout:Math.min(page.timeout,2000),displayErrors:false});}catch(error){report(error);}}]);
      pending.add(id);return id;
    },
    cancel(handle) {apply(source.cancel,main,[handle]);pending.delete(handle);},
  };
  vm.compileFunction(`(${animationFactory.toString()})(globalThis,bridge)`,['bridge'],{parsingContext:world.context})(bridge);
  const dispose=()=>{if(disposed)return;disposed=true;for(const id of pending)apply(source.cancel,main,[id]);pending.clear();signal.removeEventListener('abort',dispose);};
  signal.addEventListener('abort',dispose,{once:true});if(signal.aborted)dispose();return {dispose};
}
