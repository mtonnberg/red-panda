(async()=>{
 const timer=setTimeout,then=Promise.prototype.then,rows=[],events=[],labels=new WeakMap();
 const wait=ms=>new Promise(resolve=>timer(resolve,ms));
 const frame=document.createElement('iframe');frame.src='about:blank';document.body.append(frame);
 const w=frame.contentWindow,ForeignPromise=w.Promise,foreignCall=w.Function('reject','reason','reject(reason)'),foreignHandle=w.Function('promise','then','Reflect.apply(then,promise,[undefined,()=>{}])');
 function listen(global,label){for(const type of ['unhandledrejection','rejectionhandled'])global.addEventListener(type,e=>{events.push({target:label,type,label:labels.get(e.promise),reason:e.reason===null?null:String(e.reason),trusted:e.isTrusted,cancelable:e.cancelable,promiseIdentity:labels.has(e.promise)});e.preventDefault()})}
 listen(window,'main');listen(w,'frame');
 async function observe(label,make,deliver=(reject)=>reject(label),handle=(promise)=>Reflect.apply(then,promise,[undefined,()=>{}])){const start=events.length;let reject;const promise=make(r=>{reject=r});labels.set(promise,label);deliver(reject);await wait(25);handle(promise);await wait(25);rows.push({label,events:events.slice(start)})}
 const ordinary=C=>capture=>new C((_resolve,reject)=>capture(reject));
 await observe('ordinary-main',ordinary(Promise));
 await observe('foreign-created-main-executor',ordinary(ForeignPromise));
 await observe('main-created-foreign-reject',ordinary(Promise),reject=>foreignCall(reject,'main-created-foreign-reject'));
 await observe('foreign-created-foreign-reject',ordinary(ForeignPromise),reject=>foreignCall(reject,'foreign-created-foreign-reject'));
 const NullChain=class extends Promise{};Object.setPrototypeOf(NullChain.prototype,null);
 await observe('subclass-null-chain',ordinary(NullChain));
 const ForeignChain=class extends Promise{};Object.setPrototypeOf(ForeignChain.prototype,ForeignPromise.prototype);
 await observe('subclass-foreign-chain',ordinary(ForeignChain));
 await observe('main-promise-foreign-late-handler',ordinary(Promise),undefined,promise=>foreignHandle(promise,then));
 await observe('retired-frame',ordinary(ForeignPromise),reject=>{frame.remove();reject('retired-frame')});
 return{scope:'actual Native attribution; no predetermined creation/current-context policy',rows};
})()
