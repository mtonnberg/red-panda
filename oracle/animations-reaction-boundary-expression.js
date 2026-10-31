// Additional Native-only calibration. No expected event/lifetime policy here.
(async()=>{
 const rows=[],wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),element=document.createElement('div');
 for(const mode of['deep-chain','reaction-cancel','reaction-replay']){
  const animation=element.animate(),order=[],events=[],first=animation.finished;
  const record=event=>{order.push('event:'+event.type+':'+animation.playState);events.push({type:event.type,state:animation.playState,trusted:event.isTrusted,target:event.target===animation,event:event instanceof AnimationPlaybackEvent})};
  animation.onfinish=record;animation.oncancel=record;
  first.then(()=>{
   order.push('reaction:1');
   if(mode==='deep-chain')Promise.resolve().then(()=>{order.push('reaction:2');Promise.resolve().then(()=>order.push('reaction:3'))});
   else if(mode==='reaction-cancel'){animation.cancel();order.push('after-cancel:'+animation.playState)}
   else{animation.play();order.push('after-play:'+animation.playState)}
  });
  await wait(35);await wait(0);rows.push({mode,order,events,state:animation.playState,sameFinished:first===animation.finished});
  animation.onfinish=null;animation.oncancel=null;animation.finished.catch(()=>{});animation.cancel();
 }
 {
  const frame=document.createElement('iframe');frame.src='/';const loaded=new Promise(resolve=>frame.onload=resolve);document.body.append(frame);await loaded;
  const child=frame.contentWindow,PlaybackEvent=child.AnimationPlaybackEvent,animation=child.document.createElement('div').animate(),order=[],events=[],first=animation.finished;
  animation.onfinish=event=>{order.push('event:finish');events.push({type:event.type,state:animation.playState,trusted:event.isTrusted,target:event.target===animation,event:event instanceof PlaybackEvent})};
  first.then(()=>{order.push('reaction');frame.remove();order.push('after-remove')});
  await wait(35);await wait(0);let state,stateError;try{state=animation.playState}catch(error){stateError={name:error.name,message:error.message}}
  rows.push({mode:'reaction-removes-iframe',order,events,state,stateError,connected:frame.isConnected});
  animation.onfinish=null;animation.finished.catch(()=>{});animation.cancel();
 }
 return rows;
})()
