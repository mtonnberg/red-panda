(async()=>{
 const rows=[];
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 let log=[];await new Promise(resolve=>{log.push('sync');Promise.resolve().then(()=>log.push('micro'));setTimeout(()=>{log.push('timer1');Promise.resolve().then(()=>log.push('micro1'))},0);setTimeout(()=>{log.push('timer2');resolve()},0)});rows.push({kind:'micro-zero',log});
 for(const kind of ['message-first-zero','timer-first-zero','busy-overdue','busy-cancel']){
  const sender=new BroadcastChannel('owned-order-'+kind),receiver=new BroadcastChannel('owned-order-'+kind);log=[];let id;
  receiver.onmessage=e=>{log.push(['message',e.data]);if(kind==='busy-cancel')clearTimeout(id)};
  if(kind==='timer-first-zero')id=setTimeout(()=>log.push('timer'),0);
  sender.postMessage('actual message');
  if(kind!=='timer-first-zero')id=setTimeout(()=>log.push('timer'),kind.startsWith('busy')?100:0);
  if(kind.startsWith('busy')){const end=performance.now()+120;while(performance.now()<end){}}
  await pause(kind.startsWith('busy')?40:30);rows.push({kind,log});clearTimeout(id);sender.close();receiver.close();
 }
 return JSON.stringify({rows,boundary:'Authored heldout task orders, actual callbacks/messages; busy120ms diagnostic only, original runtime delays unchanged'});
})()
