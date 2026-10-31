// Host-only diagnostic graph. No private record is returned to page code.
const records=new WeakMap(),ids=new WeakMap(),rows=[];let serial=0;
export function registerErrorDepth(window,record){records.set(window,new WeakRef(record));if(!ids.has(record))ids.set(record,++serial)}
export function readErrorDepth(window){return records.get(window)?.deref()?.depth}
export function observeErrorDepth(phase,record){rows.push({phase,owner:ids.get(record),depth:record.depth})}
export function errorDepthObservations(){return rows.slice()}
