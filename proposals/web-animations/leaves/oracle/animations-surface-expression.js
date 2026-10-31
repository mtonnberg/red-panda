(()=>{
 const out=[],names=['Animation','AnimationPlaybackEvent','AnimationEffect','KeyframeEffect','AnimationTimeline','DocumentTimeline'];
 const norm=value=>value===undefined?'__undefined__':typeof value==='number'&&!Number.isFinite(value)?String(value):value;
 const attempt=(name,fn)=>{try{out.push([name,{value:fn()}]);}catch(e){out.push([name,{error:e.name,message:e.message}]);}};
 for(const name of names)attempt('global:'+name,()=>({type:typeof globalThis[name],own:Object.hasOwn(globalThis,name),prototype:typeof globalThis[name]==='function'?Object.getOwnPropertyNames(globalThis[name].prototype):null}));
 attempt('document-surface',()=>({timeline:norm(document.timeline),getAnimations:typeof document.getAnimations,elementAnimate:typeof Element.prototype.animate,elementGetAnimations:typeof Element.prototype.getAnimations,shadowGetAnimations:typeof ShadowRoot.prototype.getAnimations}));
 for(const [label,args]of [['none',[]],['null',[null]],['objects',[{},{}]],['numeric',[12,42]]])attempt('new Animation:'+label,()=>{const a=new Animation(...args);const row={tag:Object.prototype.toString.call(a),eventTarget:a instanceof EventTarget,keys:Object.keys(a)};for(const key of ['id','currentTime','startTime','playbackRate','playState','pending','replaceState','effect','timeline','ready','finished','onfinish','oncancel','onremove'])row[key]=['ready','finished'].includes(key)?{promise:a[key] instanceof Promise}:norm(a[key]);a.finished?.catch(()=>{});a.cancel?.();return row;});
 attempt('Animation-call',()=>norm(Animation()));
 for(const name of names)if(typeof globalThis[name]==='function')attempt('shape:'+name,()=>({length:globalThis[name].length,constructorDescriptor:Object.getOwnPropertyDescriptor(globalThis[name].prototype,'constructor'),descriptors:Object.fromEntries(Reflect.ownKeys(globalThis[name].prototype).map(key=>{const d=Object.getOwnPropertyDescriptor(globalThis[name].prototype,key);return[String(key),{enumerable:d.enumerable,configurable:d.configurable,writable:d.writable,get:d.get?.name,set:d.set?.name,valueType:typeof d.value,length:typeof d.value==='function'?d.value.length:undefined}]}))}));
 return out;
})()
