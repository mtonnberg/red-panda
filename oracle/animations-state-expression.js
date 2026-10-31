(async()=>{
 const rows=[],norm=x=>x===undefined?'__undefined__':typeof x==='number'&&!Number.isFinite(x)?String(x):x;
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),el=document.createElement('div');
 const snapshot=a=>({state:a.playState,startTime:norm(a.startTime),effect:a.effect===null?'null':typeof a.effect,timeline:a.timeline===null?'null':typeof a.timeline,pending:a.pending});
 const make=()=>{const a=el.animate([{opacity:0},{opacity:1}],{duration:1e9,iterations:Infinity});a.finished.catch(()=>{});return a};
 for(const action of['play','pause','finish','reverse','cancel']){
  const a=make(),firstReady=a.ready,firstFinished=a.finished,events=[];a.onfinish=e=>events.push(['finish',e.currentTime,e.timelineTime,e.isTrusted,a.playState]);a.oncancel=e=>events.push(['cancel',e.currentTime,e.timelineTime,e.isTrusted,a.playState]);
  firstReady.then(x=>events.push(['ready',x===a,a.playState]));firstFinished.then(x=>events.push(['resolved',x===a,a.playState]),e=>events.push(['rejected',e.name,e.message,a.playState]));
  const before=snapshot(a),returned=a[action](),after=snapshot(a),same={ready:firstReady===a.ready,finished:firstFinished===a.finished};a.finished.catch(()=>{});await Promise.resolve();const micro=events.slice();await wait(35);rows.push([action,{before,returned:norm(returned),after,same,micro,events:events.slice(),end:snapshot(a)}]);a.cancel();a.finished.catch(()=>{});
 }
 for(const start of['running','paused','idle','finished'])for(const action of['play','pause','finish','reverse','cancel']){
  const a=make();if(start==='paused')a.pause();if(start==='idle')a.cancel();if(start==='finished')a.finish();a.finished.catch(()=>{});const r=a.ready,f=a.finished;let returned,error;try{returned=norm(a[action]())}catch(e){error=[e.name,e.message]}a.finished.catch(()=>{});rows.push(['transition:'+start+':'+action,{state:a.playState,returned,error,readySame:r===a.ready,finishedSame:f===a.finished,startTime:norm(a.startTime)}]);a.cancel();a.finished.catch(()=>{});
 }
 {const a=make(),order=[];a.finished.then(()=>order.push('promise'));a.addEventListener('finish',()=>order.push('first-listener'));a.onfinish=()=>order.push('handler');a.addEventListener('finish',()=>order.push('last-listener'));a.finish();order.push('sync');await Promise.resolve();const micro=order.slice();await wait(25);rows.push(['finish-order',{micro,order}]);}
 {const a=make(),events=[];a.addEventListener('finish',()=>events.push('finish'));a.addEventListener('cancel',()=>events.push('cancel'));a.finish();a.cancel();a.finished.catch(()=>{});await wait(25);rows.push(['finish-then-cancel',{events,state:a.playState}]);}
 {const a=make(),events=[];a.addEventListener('finish',()=>events.push('finish'));a.addEventListener('cancel',()=>events.push('cancel'));a.cancel();a.play();a.finished.catch(()=>{});await wait(35);rows.push(['cancel-then-play',{events,state:a.playState}]);}
 {const a=make(),events=[];a.finished.then(()=>events.push('old-promise'),()=>events.push('old-reject'));a.finish();a.play();a.finished.then(()=>events.push('new-promise'),()=>events.push('new-reject'));a.addEventListener('finish',()=>events.push('event'));await wait(35);rows.push(['finish-then-play',{events,state:a.playState}]);}
 {const a=make(),events=[];a.pause();await wait(25);events.push(snapshot(a));a.startTime=33;a.play();await a.finished;events.push(snapshot(a));rows.push(['pause-resume',events]);}
 {const a=make();a.startTime=77;a.pause();const paused=a.startTime;a.finish();const finished=a.startTime;a.cancel();rows.push(['time-mutators',{paused,finished,canceled:a.startTime}]);}
 return rows;
})()
