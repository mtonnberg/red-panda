(()=>{const out=[],row=(name,fn)=>{try{out.push([name,fn()])}catch(e){out.push([name,{error:e.name,message:e.message}])}},read=e=>[e.type,e.bubbles,e.cancelable,e.composed,e.defaultPrevented,e.returnValue];
for(const k of ['statusCode','lineNumber','columnNumber'])for(const v of [-1,1.8,65535,65536,4294967295,4294967296,NaN,Infinity,'4',null])row(k+':'+String(v),()=>new SecurityPolicyViolationEvent('x',{[k]:v})[k]);
for(const n of ['SecurityPolicyViolationEvent','PromiseRejectionEvent']){
 row(n+':conversionOrder',()=>{const calls=[];let options=new Proxy({}, {get(t,k){calls.push(String(k));return undefined}});new globalThis[n]({toString(){calls.push('type');return 'x'}},options);return calls});
 for(const v of [undefined,null,3,'x',true,Symbol('x')])row(n+':dictionary:'+String(v),()=>{const e=new globalThis[n]('x',v);return read(e)});
 row(n+':newTarget',()=>{let calls=[];const nt=new Proxy(function(){},{get(t,k,r){if(k==='prototype')calls.push('prototype');return Reflect.get(t,k,r)}});const e=Reflect.construct(globalThis[n],[{toString(){calls.push('type');return 'x'}},{}],nt);return [calls,Object.getPrototypeOf(e)===nt.prototype]});
 row(n+':readonly',()=>{const e=new globalThis[n]('x'),p=Object.getPrototypeOf(e);return Reflect.ownKeys(p).map(k=>{const d=Object.getOwnPropertyDescriptor(p,k);return[String(k),d.enumerable,d.configurable,d.writable,typeof d.get,typeof d.set]})});
}
for(const v of [null,undefined,Promise.resolve(1),Object.create(Promise.prototype),new Proxy(Promise.resolve(1),{}),{then(){}},0])row('promiseValue:'+String(v),()=>{const e=new PromiseRejectionEvent('x',{promise:v,reason:undefined});return[e.promise===v,e.promise===null,e.reason===null,e.reason===undefined]});
row('reasonUndefined',()=>{const e=new PromiseRejectionEvent('x',{reason:undefined});return [e.reason===null,e.reason===undefined]});
for(const v of [NaN,Infinity,-Infinity,-0,1.2,-1.2])row('mouseInit:'+String(v),()=>{const e=document.createEvent('MouseEvent');e.initMouseEvent('x',true,true,window,0,v,v,v,v);return[e.clientX,e.clientY,e.screenX,e.screenY,Object.is(e.clientX,-0),Number.isNaN(e.clientX)]});
for(const v of [-1,0,1,2,3,4,7,65535,65536])row('which:'+v,()=>new MouseEvent('x',{button:v}).which);
row('coordinatesConversionOrder',()=>{const calls=[];new MouseEvent('x',new Proxy({}, {get(t,k){calls.push(String(k));return undefined}}));return calls});
row('beforeUnloadConversion',()=>{const e=document.createEvent('BeforeUnloadEvent');let calls=[];Object.getOwnPropertyDescriptor(BeforeUnloadEvent.prototype,'returnValue').set.call(e,{toString(){calls.push('string');return 'x'}});e.preventDefault();return [calls,read(e)]});
row('factoryOwner',()=>{const other=document.implementation.createHTMLDocument('x');const e=Document.prototype.createEvent.call(other,'CompositionEvent');e.initCompositionEvent('x');return [e instanceof CompositionEvent,e.view,e.data]});
return out})()
