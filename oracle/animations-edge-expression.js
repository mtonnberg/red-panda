(()=>{const out=[],attempt=(name,fn)=>{try{const value=fn();out.push([name,{value:value===undefined?'__undefined__':value}])}catch(e){out.push([name,{error:e.name,message:e.message}])}};
attempt('constructor-parents',()=>({animation:Object.getPrototypeOf(Animation)===EventTarget,event:Object.getPrototypeOf(AnimationPlaybackEvent)===Event}));
for(const C of[Animation,AnimationPlaybackEvent])attempt('constructor-prototype:'+C.name,()=>{const d=Object.getOwnPropertyDescriptor(C,'prototype');return{writable:d.writable,enumerable:d.enumerable,configurable:d.configurable}});
attempt('playback-event-call',()=>{const e=AnimationPlaybackEvent('x');return{type:e.type,instance:e instanceof AnimationPlaybackEvent}});
attempt('derived-event',()=>{class Derived extends AnimationPlaybackEvent{}const e=new Derived('derived',{currentTime:1});return{derived:e instanceof Derived,base:e instanceof AnimationPlaybackEvent,event:e instanceof Event,currentTime:e.currentTime}});
attempt('eventtarget-as-animation',()=>{const fake=Reflect.construct(EventTarget,[],Animation);Animation.prototype.play.call(fake);return true});
attempt('changed-constructor-parent',()=>{const C=AnimationPlaybackEvent,old=Object.getPrototypeOf(C);try{Object.setPrototypeOf(C,function(){throw Error('authored superclass')});const e=new C('original');return{type:e.type,event:e instanceof Event}}finally{Object.setPrototypeOf(C,old)}});
return out;})()
