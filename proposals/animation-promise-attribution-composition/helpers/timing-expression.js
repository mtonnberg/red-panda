// Diagnostic only: this is deliberately distinct from the unchanged oracle.
// The original 4/6/12/35/0 delays remain; blockMS is an explicit workload.
(async function(blockMS){
 const rows=[],wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),element=document.createElement('div');
 const clock=performance.now.bind(performance);
 for(const mode of['pause-play','cancel-play','finish-play']){
  const started=clock(),events=[],mark=(name,data={})=>events.push({name,at:clock()-started,...data});
  mark('before-animate');const animation=element.animate();mark('after-animate');
  const finished=animation.finished;mark('after-first-finished-getter');finished.then(()=>mark('first-promise-resolved'),error=>mark('first-promise-rejected',{error:error.name}));mark('after-promise-handler');
  animation.onfinish=event=>mark('finish-event',{state:animation.playState,trusted:event.isTrusted});
  animation.oncancel=event=>mark('cancel-event',{state:animation.playState,trusted:event.isTrusted});mark('after-event-handlers');
  const firstRegistered=clock()-started;
  setTimeout(()=>{mark('first-before',{state:animation.playState});animation[mode.split('-')[0]]();mark('first-after',{state:animation.playState})},4);
  const playRegistered=clock()-started;
  setTimeout(()=>{mark('play-before',{state:animation.playState});animation.play();animation.finished.catch(()=>{});mark('play-after',{state:animation.playState})},6);
  const sampleRegistered=clock()-started;
  setTimeout(()=>mark('middle',{state:animation.playState}),12);
  mark('after-timer-registration',{firstRegistered,playRegistered,sampleRegistered});
  if(blockMS){const began=clock();while(clock()-began<blockMS){}mark('blocked-loop-end',{requestedMS:blockMS});}
  await wait(35);await wait(0);mark('end',{state:animation.playState});
  rows.push({mode,blockMS,events,state:animation.playState,finishEvents:events.filter(e=>e.name==='finish-event').length,cancelEvents:events.filter(e=>e.name==='cancel-event').length});
  animation.finished.catch(()=>{});animation.cancel();
 }
 return rows;
})(__BLOCK_MS__)
