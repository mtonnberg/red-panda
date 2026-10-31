// Independent observations of the existing surrogate layout, not a CSS renderer.
import { createInternalMutationObserver } from './mutations.js';
const installed = new WeakMap();

function resizeFactory(g, bridge) {
  const states = new WeakMap(), entries = new WeakMap(), sizes = new WeakMap();
  const active = new Set();
  let queued = false, timer, stopped = false;
  const brand = value => { const state = states.get(value); if (!state) throw new g.TypeError('Illegal invocation'); return state; };
  const element = value => { if (!bridge.isElement(value)) throw new g.TypeError('invalid argument'); };
  class ResizeObserverSize {
    constructor() { throw new g.TypeError('Illegal Constructor'); }
    get inlineSize() { if (!sizes.has(this)) throw new g.TypeError('Illegal invocation'); return sizes.get(this).width; }
    get blockSize() { if (!sizes.has(this)) throw new g.TypeError('Illegal invocation'); return sizes.get(this).height; }
  }
  const box = value => { const size = Object.create(ResizeObserverSize.prototype); sizes.set(size, value); return [size]; };
  class ResizeObserverEntry {
    constructor() { throw new g.TypeError('Illegal Constructor'); }
  }
  for (const name of ['target','contentRect','contentBoxSize','borderBoxSize','devicePixelContentBoxSize']) {
    Object.defineProperty(ResizeObserverEntry.prototype, name, { configurable:true, enumerable:true,
      get() { if (!entries.has(this)) throw new g.TypeError('Illegal invocation'); return entries.get(this)[name]; } });
  }
  const entry = (target, value) => {
    const result = Object.create(ResizeObserverEntry.prototype);
    entries.set(result, { target, contentRect:g.DOMRectReadOnly.fromRect({ x:0, y:0, ...value }),
      contentBoxSize:box(value), borderBoxSize:box(value), devicePixelContentBoxSize:box(value) });
    return result;
  };
  function arm() {
    if (!stopped && active.size && timer === undefined) timer = bridge.setTimer(() => { timer=undefined; schedule(); },16);
  }
  function deliver() {
    queued=false;
    if (stopped) return;
    const batches = new Map();
    for (const observer of active) {
      const state=brand(observer), batch=[];
      for (const [target, previous] of state.targets) {
        const value=bridge.measure(target);
        if (value.width !== previous.width || value.height !== previous.height) {
          state.targets.set(target,value); batch.push(entry(target,value));
        }
      }
      if (batch.length) batches.set(observer,batch);
    }
    for (const [observer,batch] of batches) {
      const state=brand(observer);
      const remaining=batch.filter(value=>state.targets.has(value.target));
      if (!active.has(observer) || !remaining.length) continue;
      try { state.callback.call(observer,remaining,observer); } catch(error) { bridge.report(error); }
    }
    arm();
  }
  function schedule() { if (!stopped && !queued && active.size) { queued=true; bridge.microtask(deliver); } }
  class ResizeObserver {
    constructor(callback) {
      if (typeof callback !== 'function') throw new g.TypeError('invalid argument');
      states.set(this,{callback,targets:new Map()});
    }
    observe(target, options = {}) {
      const state=brand(this); element(target);
      // The measured native profile accepts/ignores box values; all exposed
      // sizes use the same layout box, including device-pixel-content-box.
      if (options !== null && options !== undefined && !['object','function'].includes(typeof options)) throw new g.TypeError('invalid argument');
      if (!state.targets.has(target)) state.targets.set(target,{width:0,height:0});
      bridge.watch(target); active.add(this); schedule();
    }
    unobserve(target) {
      const state=brand(this); element(target); state.targets.delete(target);
      if (!state.targets.size) active.delete(this);
      if (!active.size && timer !== undefined) { bridge.clearTimer(timer); timer=undefined; }
    }
    disconnect() {
      brand(this).targets.clear(); active.delete(this);
      if (!active.size && timer !== undefined) { bridge.clearTimer(timer); timer=undefined; }
    }
  }
  for (const Constructor of [ResizeObserver,ResizeObserverEntry,ResizeObserverSize]) {
    Object.defineProperty(Constructor.prototype,Symbol.toStringTag,{configurable:true,value:Constructor.name});
    for (const name of Object.getOwnPropertyNames(Constructor.prototype)) if (name !== 'constructor') {
      Object.defineProperty(Constructor.prototype,name,{...Object.getOwnPropertyDescriptor(Constructor.prototype,name),enumerable:true});
    }
    Object.defineProperty(g,Constructor.name,{configurable:true,writable:true,value:Constructor});
  }
  return { schedule, dispose() { stopped=true; for(const observer of active)brand(observer).targets.clear();active.clear(); bridge.clearTimer(timer); timer=undefined; } };
}

function report(page, window, error) {
  if (typeof window.reportError === 'function') { window.reportError(error); return; }
  const event = new window.ErrorEvent('error',{error,message:String(error?.message??error),cancelable:true});
  if (window.dispatchEvent(event)) page.emit?.('pageError',error);
}

export function installResizeObserver(page, window, layout = page.layout) {
  if (installed.has(window)) return installed.get(window);
  if (!layout?.rect || !window?.document || typeof window.eval !== 'function') throw new TypeError('Resize observation requires a document realm and layout');
  const document=window.document,signal=page.documentAbort?.signal,previousClose=window.close;
  const elementGetter=Object.getOwnPropertyDescriptor(window.Element.prototype,'tagName').get;
  let mutations,controller,disposed=false;
  const observedRoots=new WeakSet();
  const watch=root=>{ if (!observedRoots.has(root)) { observedRoots.add(root); mutations.observe(root,{attributes:true,childList:true,characterData:true,subtree:true}); } };
  controller=window.eval(`(${resizeFactory.toString()})`)(window,{
    isElement(value) { try { elementGetter.call(value); return true; } catch { return false; } },
    measure(target) {
      if (disposed || window.document!==document || !target.isConnected || target.ownerDocument !== document) return {width:0,height:0};
      const value=layout.rect(target); return {width:value.width,height:value.height};
    },
    report:error=>report(page,window,error),
    watch(target) { watch(target.getRootNode()); },
    microtask:callback=>window.queueMicrotask(()=>{if(window.document!==document){dispose();return;}callback();}),
    setTimer:(callback,ms)=>window.setTimeout(()=>{if(window.document!==document){dispose();return;}callback();},ms),clearTimer:timer=>window.clearTimeout(timer),
  });
  mutations=createInternalMutationObserver(window,controller.schedule);watch(document);
  window.addEventListener('resize',controller.schedule);
  window.addEventListener('load',controller.schedule);
  const dispose=()=>{
    if (disposed) return; disposed=true; controller.dispose();mutations.disconnect();
    window.removeEventListener('resize',controller.schedule);window.removeEventListener('load',controller.schedule);
    window.removeEventListener('unload',dispose);signal?.removeEventListener('abort',dispose);page.off?.('close',dispose);
    if(window.close===close)window.close=previousClose;
  };
  const close=function(){dispose();return previousClose.call(window);};window.close=close;
  signal?.addEventListener('abort',dispose,{once:true});page.once?.('close',dispose);window.addEventListener('unload',dispose,{once:true});
  const result={schedule:controller.schedule,dispose};installed.set(window,result);
  if (signal?.aborted || page.closed) dispose();
  return result;
}
