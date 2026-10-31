// Host-private protocol retirement checkpoint, before actual document teardown.
const subscribers=new WeakMap();
export function onPageClosing(page,callback){
 let callbacks=subscribers.get(page);if(!callbacks){callbacks=new Set();subscribers.set(page,callbacks)}callbacks.add(callback);
 return()=>{callbacks.delete(callback);if(!callbacks.size&&subscribers.get(page)===callbacks)subscribers.delete(page)};
}
export function notifyPageClosing(page){
 const callbacks=subscribers.get(page);if(!callbacks)return;
 subscribers.delete(page);
 for(const callback of callbacks)callback();
}
