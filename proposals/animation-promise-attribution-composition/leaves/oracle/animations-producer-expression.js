// Additional Native calibration: distinguish actual automatic, explicit-finish
// and explicit-cancel producers without a close-spaced wall-clock assertion.
(async()=>{
 const rows=[],element=document.createElement('div');
 for(const mode of['automatic','explicit-finish','explicit-cancel']){
  const animation=element.animate(),order=[],first=animation.finished;
  first.then(()=>order.push('promise:resolved'),error=>order.push('promise:rejected:'+error.name));
  let observed;const eventDone=new Promise(resolve=>{
   const handler=event=>{order.push('event:'+event.type);observed={type:event.type,state:animation.playState,trusted:event.isTrusted,event:event instanceof AnimationPlaybackEvent,target:event.target===animation,currentTime:event.currentTime,timelineTime:event.timelineTime};resolve()};
   animation.onfinish=handler;animation.oncancel=handler;
  });
  if(mode==='explicit-finish')animation.finish();else if(mode==='explicit-cancel')animation.cancel();
  order.push('after-action:'+animation.playState);
  await Promise.all([first.catch(()=>{}),eventDone]);await Promise.resolve();
  rows.push({mode,order,event:observed,state:animation.playState});
  animation.onfinish=null;animation.oncancel=null;animation.finished.catch(()=>{});animation.cancel();
 }
 return rows;
})()
