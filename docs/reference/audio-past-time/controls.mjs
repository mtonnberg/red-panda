// Authored heldouts; actual context/automation/buffer outputs, no mock or patch.
export async function audioControl(name){
 const spin=ms=>{const end=performance.now()+ms;while(performance.now()<end){}},pause=ms=>new Promise(r=>setTimeout(r,ms));
 const snapshot=(label,c,p)=>({label,time:c.currentTime,state:c.state,value:p.value});
 const error=e=>({name:e.name,message:e.message,typeError:e instanceof TypeError,rangeError:e instanceof RangeError,domException:e instanceof DOMException});
 if(name==='delayed-all-scheduling'){
  const rows=[];
  for(const method of['setValueAtTime','linearRampToValueAtTime','exponentialRampToValueAtTime','setTargetAtTime','setValueCurveAtTime']){
   const c=new AudioContext(),p=c.createGain().gain,steps=[];steps.push(snapshot('fresh',c,p));spin(12);steps.push(snapshot('before-implicit-setter',c,p));p.value=.625;steps.push(snapshot('after-implicit-setter',c,p));let failure=null,result;
   try{result=method==='setTargetAtTime'?p[method](.1875,0,0):method==='setValueCurveAtTime'?p[method]([.1875,.8125],0,.064):p[method](.1875,0)}catch(e){failure=error(e)}
   steps.push(snapshot('after-past-explicit-call',c,p));let futureFailure=null;try{p.setValueAtTime(.9375,1000)}catch(e){futureFailure=error(e)}steps.push(snapshot('after-future-set',c,p));rows.push({method,steps,returnedThis:result===p,failure,futureFailure});await c.close();
  }
  for(const kind of['offset','playbackRate','frequency']){
   const c=new AudioContext(),node=kind==='offset'?c.createConstantSource():kind==='playbackRate'?c.createBufferSource():c.createOscillator(),p=node[kind];spin(12);const steps=[snapshot('before-implicit-setter',c,p)];p.value=.5625;steps.push(snapshot('after-implicit-setter',c,p));let failure=null;try{p.setValueAtTime(.3125,0)}catch(e){failure=error(e)}steps.push(snapshot('after-past-explicit-call',c,p));rows.push({kind,steps,failure});await c.close();
  }
  return{rows};
 }
 if(name==='past-cancel-and-hold'){
  const rows=[];for(const method of['cancelScheduledValues','cancelAndHoldAtTime']){
   const c=new AudioContext(),p=c.createGain().gain;p.value=.625;const t=c.currentTime;p.setValueAtTime(.1875,t+.008);await pause(24);const steps=[snapshot('after-real-past-event',c,p)];p.setValueAtTime(.8125,c.currentTime+.3);steps.push(snapshot('future-event-added',c,p));let failure=null,result;try{result=p[method](0)}catch(e){failure=error(e)}steps.push(snapshot('after-past-cancellation',c,p));rows.push({method,t,steps,returnedThis:result===p,failure});await c.close();
  }return{rows};
 }
 if(name==='suspended-clock-past-set'){
  const c=new AudioContext(),p=c.createGain().gain,delivery=[];c.onstatechange=()=>delivery.push({state:c.state,time:c.currentTime});spin(12);const beforeSuspend=c.currentTime;await c.suspend();const frozen=c.currentTime;p.value=.5625;const steps=[snapshot('suspended-implicit-setter',c,p)];p.setValueAtTime(.1875,0);steps.push(snapshot('suspended-past-event',c,p));spin(12);steps.push(snapshot('suspended-after-busy-work',c,p));await c.close();await pause(0);return{beforeSuspend,frozen,steps,delivery,closedState:c.state};
 }
 if(name==='offline-cache-and-past-render'){
  const c=new OfflineAudioContext(1,384,8000),s=c.createConstantSource(),g=c.createGain();s.offset.value=.875;g.gain.value=.5;s.connect(g).connect(c.destination);s.start();const suspended=c.suspend(128/8000),done=c.startRendering();await suspended;const steps=[snapshot('after-real-first-quantum',c,g.gain)];g.gain.value=.5625;steps.push(snapshot('after-intrinsic-setter',c,g.gain));g.gain.setValueAtTime(.1875,0);steps.push(snapshot('after-past-event-before-render',c,g.gain));await c.resume();const buffer=await done,channel=buffer.getChannelData(0),indices=[0,127,128,255,256,383];steps.push(snapshot('after-real-render',c,g.gain));return{steps,rate:buffer.sampleRate,length:buffer.length,channels:buffer.numberOfChannels,actualFloat32:channel instanceof Float32Array,indices,samples:indices.map(i=>channel[i])};
 }
 if(name==='invalid-time-and-coercion-order'){
  const c=new AudioContext(),rows=[];spin(12);
  const methods=['setValueAtTime','linearRampToValueAtTime','exponentialRampToValueAtTime','setTargetAtTime','setValueCurveAtTime','cancelScheduledValues','cancelAndHoldAtTime'];
  const invoke=(p,method,time,value=.1875)=>method==='setTargetAtTime'?p[method](value,time,0):method==='setValueCurveAtTime'?p[method]([.1875,.8125],time,.064):method.startsWith('cancel')?p[method](time):p[method](value,time);
  for(const method of methods)for(const[kind,time]of[['negative',-1],['NaN',NaN],['Infinity',Infinity],['negative-zero',-0]]){
   const p=c.createGain().gain;p.value=.625;const before=snapshot('before',c,p);let failure=null,result;try{result=invoke(p,method,time)}catch(e){failure=error(e)}rows.push({method,kind,before,after:snapshot('after',c,p),returnedThis:result===p,failure});
  }
  const p=c.createGain().gain;p.value=.625;const trace=[],value={valueOf(){trace.push({conversion:'value-before',time:c.currentTime});spin(6);trace.push({conversion:'value-after',time:c.currentTime});return .34375}},time={valueOf(){trace.push({conversion:'time-before',time:c.currentTime});spin(6);trace.push({conversion:'time-after',time:c.currentTime});return 0}};let failure=null;try{p.setValueAtTime(value,time)}catch(e){failure=error(e)}const coercion={trace,failure,after:snapshot('after-real-delayed-coercions',c,p)};
  const invalidTrace=[];let invalidFailure=null;try{p.setValueAtTime({valueOf(){invalidTrace.push('value');return NaN}},{valueOf(){invalidTrace.push('time');return 0}})}catch(e){invalidFailure=error(e)}await c.close();return{rows,coercion,invalidValueCoercion:{trace:invalidTrace,failure:invalidFailure}};
 }
 throw Error('Unknown authored control');
}
