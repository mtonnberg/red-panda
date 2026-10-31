// Host-private ownership of the actual top-level navigation HTTP reader.
// Finishing early returns only received bytes to the normal document parser.
const transfers=new WeakMap(),stopReasons=new WeakSet();
export function beginNavigationTransfer(page,controller){
 const transfer={page,controller,signal:controller.signal,phase:'request',reader:null,finishedEarly:false,stopReason:null};
 transfers.set(page,transfer);return transfer;
}
export function navigationResponseReader(page,signal,reader){
 const transfer=transfers.get(page);
 if(!transfer||transfer.signal!==signal||transfer.signal.aborted||transfer.phase!=='request')return null;
 transfer.phase='body';transfer.reader=reader;return transfer;
}
export function finishNavigationReader(transfer){if(transfer){transfer.reader=null;transfer.phase='received'}}
export function endNavigationTransfer(transfer){
 if(!transfer)return;
 transfer.reader=null;transfer.phase='complete';
 if(transfers.get(transfer.page)===transfer)transfers.delete(transfer.page);
}
export function stopNavigationRequest(page){
 const transfer=transfers.get(page);
 if(transfer?.finishedEarly)return true;
 if(transfer?.phase==='body'&&transfer.reader&&!transfer.signal.aborted){
  transfer.finishedEarly=true;
  // cancel settles the actual pending reader.read and closes its HTTP body.
  // Mark ownership first: cancellation can enqueue arbitrary promise reactions.
  try{Promise.resolve(transfer.reader.cancel()).catch(()=>{})}catch{}
  return true;
 }
 const controller=transfer?.controller??page.navigationAbort;
 if(controller&&!controller.signal.aborted){
  const reason=new DOMException('net::ERR_ABORTED','AbortError');stopReasons.add(reason);
  if(transfer)transfer.stopReason=reason;
  controller.abort(reason);
 }
 return false;
}
export function stoppedNavigationError(error){return error!==null&&(typeof error==='object'||typeof error==='function')&&stopReasons.has(error)}
