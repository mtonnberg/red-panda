// Single Host authority for registration and actual frame-retirement delivery.
const hooks=new WeakMap();
export function onFrameRetirement(window,callback){let callbacks=hooks.get(window);if(!callbacks){callbacks=new Set();hooks.set(window,callbacks)}callbacks.add(callback);return()=>callbacks.delete(callback)}
export function notifyFrameRetirement(window){for(const callback of hooks.get(window)??[])callback()}
