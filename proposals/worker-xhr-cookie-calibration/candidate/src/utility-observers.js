// Actual utility-realm observation over the existing shared layout. The public
// classes, private state, records and callback arrays are allocated in that VM.
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
import { canonicalUtilityValue } from './isolated-world.js';
import { nodeIdentity } from './remote-values.js';
import { createInternalMutationObserver } from './mutations.js';
import { getLayoutStyle } from './styles.js';

function intersectionFactory(g, bridge) {
  const states = new WeakMap(), entries = new WeakMap(), active = new Set();
  const apply = Reflect.apply, rect = DOMRectReadOnly.fromRect;
  let queued = false, timer, stopped = false;
  const brand = observer => { const state = states.get(observer); if (!state) throw new TypeError('Illegal invocation'); return state; };
  const element = value => { if (!bridge.isElement(value)) throw new TypeError('invalid argument'); };
  function margins(input = '0px') {
    const parts = String(input).replace(/\/\*[\s\S]*?\*\//g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) parts.push('0px');
    if (parts.length > 4 || parts.some(value => !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?:px|%)$/i.test(value))) throw new DOMException('The string did not match the expected pattern', 'SyntaxError');
    const values = parts.map(value => ({ value: Number.parseFloat(value), unit: value.endsWith('%') ? '%' : 'px' }));
    const [a, b = a, c = a, d = b] = values;
    return [a, b, c, d];
  }
  const marginText = values => values.map(part => `${part.value}${part.unit}`).join(' ');
  class IntersectionObserverEntry { constructor() { throw new TypeError('Illegal Constructor'); } }
  for (const name of ['time','target','rootBounds','boundingClientRect','intersectionRect','isIntersecting','intersectionRatio','isVisible']) {
    Object.defineProperty(IntersectionObserverEntry.prototype,name,{configurable:true,enumerable:true,get() { if (!entries.has(this)) throw new TypeError('Illegal invocation'); return entries.get(this)[name]; }});
  }
  Object.defineProperty(IntersectionObserverEntry.prototype,Symbol.toStringTag,{value:'IntersectionObserverEntry',configurable:true});
  function measure(state,target) {
    const measured=bridge.measure(target,state.root),bounds=measured.bounds;
    let root=measured.root;
    const offsets=state.margin.map(part=>part.unit==='%'?part.value*root.width/100:part.value);
    root={x:root.x-offsets[3],y:root.y-offsets[0],width:root.width+offsets[3]+offsets[1],height:root.height+offsets[0]+offsets[2]};
    const left=Math.max(bounds.left,root.x),top=Math.max(bounds.top,root.y),right=Math.min(bounds.right,root.x+root.width),bottom=Math.min(bounds.bottom,root.y+root.height);
    const intersects=measured.validRoot&&measured.rendered&&right>=left&&bottom>=top,area=bounds.width*bounds.height;
    const intersection={x:left,y:top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
    const entry=Object.create(IntersectionObserverEntry.prototype);
    entries.set(entry,{time:bridge.now(),target,rootBounds:apply(rect,DOMRectReadOnly,[root]),boundingClientRect:apply(rect,DOMRectReadOnly,[bounds]),intersectionRect:apply(rect,DOMRectReadOnly,[intersects?intersection:{x:0,y:0,width:0,height:0}]),isIntersecting:intersects,intersectionRatio:intersects?(area?intersection.width*intersection.height/area:1):0,isVisible:intersects&&measured.visible});
    return entry;
  }
  function arm() { if (!stopped&&active.size&&timer===undefined) timer=bridge.setTimer(()=>{timer=undefined;schedule();},16); }
  function deliver() {
    queued=false;if(stopped)return;
    for(const observer of active){const state=states.get(observer);for(const[target,previous]of state.targets){if(!bridge.connected(target))continue;const entry=measure(state,target),index=state.thresholds.filter(value=>value<=entry.intersectionRatio).length;if(!previous||previous.index!==index||previous.intersecting!==entry.isIntersecting){state.records.push(entry);state.targets.set(target,{index,intersecting:entry.isIntersecting});}}}
    for(const observer of [...active]){const state=states.get(observer),records=state.records.splice(0);if(records.length)try{apply(state.callback,observer,[records,observer]);}catch(error){bridge.report(error);}}
    arm();
  }
  function schedule() { if(!stopped&&!queued&&active.size){queued=true;bridge.microtask(deliver);} }
  class IntersectionObserver {
    constructor(callback,options={}) {
      if(typeof callback!=='function')throw new TypeError('invalid argument');
      options=options??{};const root=options.root??null;if(root!==null&&!bridge.isRoot(root))throw new TypeError('invalid argument');
      let thresholds=Array.isArray(options.threshold)?Array.from(options.threshold,Number):[Number(options.threshold??0)];
      if(thresholds.some(value=>!Number.isFinite(value)))throw new TypeError('invalid argument');
      if(thresholds.some(value=>value<0||value>1))throw new RangeError('');
      if(!thresholds.length)thresholds=[0];thresholds=Object.freeze(thresholds.sort((a,b)=>a-b));
      const margin=margins(options.rootMargin),scrollMargin=margins(options.scrollMargin),trackVisibility=Boolean(options.trackVisibility),delay=Math.max(trackVisibility?100:0,Math.trunc(Number(options.delay)||0));
      states.set(this,{callback,root,thresholds,margin,rootMargin:marginText(margin),scrollMargin:marginText(scrollMargin),trackVisibility,delay,targets:new Map(),records:[]});
    }
    observe(target){const state=brand(this);element(target);if(!state.targets.has(target))state.targets.set(target,null);bridge.watch(target);active.add(this);schedule();}
    unobserve(target){const state=brand(this);element(target);state.targets.delete(target);if(!state.targets.size)active.delete(this);if(!active.size&&timer!==undefined){bridge.clearTimer(timer);timer=undefined;}}
    disconnect(){const state=brand(this);state.targets.clear();state.records=[];active.delete(this);if(!active.size&&timer!==undefined){bridge.clearTimer(timer);timer=undefined;}}
    takeRecords(){return brand(this).records.splice(0);}
  }
  for(const name of ['root','rootMargin','scrollMargin','thresholds','trackVisibility','delay'])Object.defineProperty(IntersectionObserver.prototype,name,{configurable:true,enumerable:true,get(){return brand(this)[name];}});
  Object.defineProperty(IntersectionObserver.prototype,Symbol.toStringTag,{value:'IntersectionObserver',configurable:true});
  Object.assign(g,{IntersectionObserver,IntersectionObserverEntry});
  return {schedule,dispose(){stopped=true;active.clear();if(timer!==undefined)bridge.clearTimer(timer);timer=undefined;}};
}

export function installUtilityIntersection(page,world,main=page.dom.window) {
  const document=main.document,signal=page.documentAbort.signal;
  const canonical=canonicalUtilityValue;
  const identify=value=>nodeIdentity(canonical(value));
  const owner=target=>{const doc=target.ownerDocument??target;return [...(page.registry?.frames.values()??page.frames?.frames.values()??[page])].find(candidate=>candidate.dom.window.document===doc)??page;};
  let disposed=false,controller;const roots=new WeakSet();
  const mutations=createInternalMutationObserver(main,()=>controller?.schedule());
  const watch=target=>{const root=canonical(target).getRootNode();if(!roots.has(root)){roots.add(root);mutations.observe(root,{attributes:true,childList:true,subtree:true,characterData:true});}};
  const bridge={
    isElement:value=>identify(value)?.nodeType===1,
    isRoot:value=>[1,9].includes(identify(value)?.nodeType),
    connected:value=>{const node=canonical(value);return !disposed&&node.isConnected&&node.ownerDocument===document;},
    measure(value,rootValue){const target=canonical(value),root=rootValue===null?null:canonical(rootValue),layout=owner(target).layout;
      return {bounds:layout.rect(target),root:root?.nodeType===1?owner(root).layout.rect(root):{x:0,y:0,...layout.viewport},rendered:layout.rects(target).length>0,validRoot:root===null||root===document||root.contains(target),visible:getLayoutStyle(target)?.visibility!=='hidden'};},
    now:()=>performance.now(),watch,
    microtask:callback=>queueMicrotask(()=>{if(!disposed)callback();}),
    setTimer:(callback,ms)=>setTimeout(()=>{if(!disposed)callback();},ms),clearTimer:timer=>clearTimeout(timer),
    report:error=>{if(!disposed){const event=new world.global.ErrorEvent('error',{error,cancelable:true});if(world.global.dispatchEvent(event))page.emit('pageError',error);}},
  };
  controller=vm.compileFunction(`return (${intersectionFactory.toString()})(globalThis,bridge)`,['bridge'],{parsingContext:world.context})(bridge);
  watch(document);const schedule=()=>controller.schedule();main.addEventListener('scroll',schedule);main.addEventListener('resize',schedule);
  const dispose=()=>{if(disposed)return;disposed=true;controller.dispose();mutations.disconnect();main.removeEventListener('scroll',schedule);main.removeEventListener('resize',schedule);signal.removeEventListener('abort',dispose);};
  signal.addEventListener('abort',dispose,{once:true});if(signal.aborted)dispose();return {schedule,dispose};
}
