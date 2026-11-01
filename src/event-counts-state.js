// Host-private counters belonging to a successful actual Window generation.
// No event wrapper, authored property, listener invocation or URL identifies it.
const owners = new WeakMap(), fronts = new WeakMap(), iterators = new WeakMap(), performances = new WeakMap();
export const eventCountNames = Object.freeze(['auxclick','click','contextmenu','dblclick','mousedown','mouseenter','mouseleave','mouseout','mouseover','mouseup','pointerover','pointerenter','pointerdown','pointerup','pointercancel','pointerout','pointerleave','gotpointercapture','lostpointercapture','touchstart','touchend','touchcancel','keydown','keypress','keyup','beforeinput','input','compositionstart','compositionupdate','compositionend','dragstart','dragend','dragenter','dragleave','dragover','drop']);
const indexes = new Map(eventCountNames.map((name,index)=>[name,index]));
export function createEventCountState(owner) {
  if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) throw new TypeError('An actual Window owner is required');
  if (owners.has(owner)) throw new TypeError('EventCounts owner cannot be retargeted');
  const counts = new Uint32Array(eventCountNames.length), state = {counts};
  owners.set(owner,state);
  return {read(index){return counts[index];},dispose(){if(owners.get(owner)===state)owners.delete(owner);}};
}
export function countDispatchedEvent(target,event) {
  const state = owners.get(target._globalObject), index = indexes.get(event.type);
  if (state && index !== undefined && state.counts[index] !== 0xffffffff) state.counts[index]++;
}
// Shared successful-producer authority permits borrowing between genuine
// Window realms without accepting copied symbols/prototypes or Proxy shells.
export function bindEventCountFront(front,state) {
  if(fronts.has(front))throw new TypeError('EventCounts front cannot be rebound');
  fronts.set(front,state);
}
export function hasEventCountFront(front){return fronts.has(front);}
export function readEventCountFront(front,index){return fronts.get(front).read(index);}
export function bindEventCountIterator(front,source,kind) {
  if(!fronts.has(source)||iterators.has(front))throw new TypeError('Iterator requires a genuine successful EventCounts source');
  iterators.set(front,{source,kind,index:0});
}
export function hasEventCountIterator(front,kind){const state=iterators.get(front);return state!==undefined&&state.kind===kind;}
export function nextEventCountIterator(front,kind){const state=iterators.get(front);if(!state||state.kind!==kind)throw new TypeError('Internal iterator brand mismatch');return state.index===eventCountNames.length?-1:state.index++;}
export function readEventCountIterator(front,index){return fronts.get(iterators.get(front).source).read(index);}

export function bindPerformanceEventCounts(performance,front){if(!fronts.has(front)||performances.has(performance))throw new TypeError('Performance/EventCounts authority cannot be rebound');performances.set(performance,front);}
export function performanceEventCounts(performance){return performances.get(performance);}
