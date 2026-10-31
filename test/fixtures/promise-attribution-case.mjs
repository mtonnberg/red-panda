import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {types} from 'node:util';
import {installErrors} from '../../src/errors.js';
import {getHeapBinding} from '../../src/native-heap.js';
const mode=process.argv[2],binding=getHeapBinding(),hostThen=Promise.prototype.then,tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function realm({host=false}={}){const events=[],errors=[],page={closed:false,documentAbort:new AbortController()};let controller;
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<body>',{...(!host?{runScripts:'dangerously'}:{}),virtualConsole:vc,beforeParse(w){controller=installErrors(page,w)}}),w=dom.window;
 const onUnhandled=e=>{events.push({type:e.type,promise:e.promise,reason:e.reason,trusted:e.isTrusted,cancelable:e.cancelable});e.preventDefault()};
 w.addEventListener('unhandledrejection',onUnhandled);w.addEventListener('rejectionhandled',e=>events.push({type:e.type,promise:e.promise,reason:e.reason,trusted:e.isTrusted,cancelable:e.cancelable}));
 return{dom,w,page,controller,events,errors,onUnhandled,close(){page.closed=true;page.documentAbort.abort();dom.window.close()}};
}
const defer=C=>{let reject;const promise=new C((_resolve,r)=>{reject=r});return{promise,reject}};
const handle=promise=>Reflect.apply(hostThen,promise,[undefined,()=>{}]);
const proof=(value,anchor)=>{const before={genuine:types.isPromise(value),selected:binding.sameRealm(value,anchor),globalSelected:binding.creationGlobal(value)===binding.creationGlobal(anchor),host:binding.sameRealm(value,{})},prototype=Object.getPrototypeOf(value);Object.setPrototypeOf(value,null);const after={selected:binding.sameRealm(value,anchor),globalSelected:binding.creationGlobal(value)===binding.creationGlobal(anchor),host:binding.sameRealm(value,{})};Object.setPrototypeOf(value,prototype);return{before,after}};
const noExtraErrors=f=>assert.deepEqual(f.errors,[]);
if(mode==='authority'){
 const a=realm(),b=realm(),rows=[];let traps=0;
 try{for(const label of ['ordinary','null-after-init','subclass-null-chain','subclass-foreign-chain','vm-constructor-host-newtarget','subclass-proxy-chain']){
  let result;
  if(label==='ordinary'||label==='null-after-init')result=defer(a.w.Promise);
  else if(label==='vm-constructor-host-newtarget'){let reject;result={promise:Reflect.construct(a.w.Promise,[(_resolve,r)=>{reject=r}],Promise),get reject(){return reject}}}
  else{const C=a.w.eval('(class extends Promise {})');Object.setPrototypeOf(C.prototype,label==='subclass-null-chain'?null:label==='subclass-foreign-chain'?b.w.Promise.prototype:new Proxy(a.w.Promise.prototype,{getPrototypeOf(){traps++;throw Error('must not inspect Promise prototypes')}}));result=defer(C)}
  if(label==='null-after-init')Object.setPrototypeOf(result.promise,null);
  const actual=proof(result.promise,a.w.Object.prototype);assert.deepEqual(actual,{before:{genuine:true,selected:true,globalSelected:true,host:false},after:{selected:true,globalSelected:true,host:false}});
  const start=a.events.length;result.reject(label);await tick(25);handle(result.promise);await tick(25);
  const events=a.events.slice(start);assert.equal(events.length,2);assert.deepEqual(events.map(e=>[e.type,e.reason,e.trusted,e.cancelable]),[['unhandledrejection',label,false,true],['rejectionhandled',null,false,false]]);assert.ok(events.every(e=>e.promise===result.promise));assert.deepEqual(b.events,[]);rows.push({label,actual});
 }assert.equal(traps,0);noExtraErrors(a);noExtraErrors(b);console.log(JSON.stringify({mode,rows,traps}));}finally{a.close();b.close()}
}else if(mode==='handled-order'){
 const f=realm();try{const trace=[];f.w.addEventListener('unhandledrejection',e=>{trace.push('unhandled-listener');handle(e.promise)});f.w.addEventListener('rejectionhandled',()=>trace.push('handled-listener'));
  const pre=defer(f.w.Promise);handle(pre.promise);pre.reject('handled before notification');await tick(25);assert.equal(f.events.length,0);
  const result=defer(f.w.Promise);result.reject('catch from unhandled listener');await tick(50);assert.deepEqual(trace,['unhandled-listener','handled-listener']);assert.equal(f.events.length,2);assert.equal(f.events[0].promise,result.promise);assert.equal(f.events[1].promise,result.promise);assert.equal(f.events[1].reason,null);noExtraErrors(f);console.log(JSON.stringify({mode,trace}));
 }finally{f.close()}
}else if(mode==='dispose-before-notify'||mode==='dispose-in-listener'){
 const f=realm();try{const result=defer(f.w.Promise);
  if(mode==='dispose-before-notify')f.controller.dispose();else f.w.addEventListener('unhandledrejection',e=>{f.controller.dispose();handle(e.promise)});
  result.reject(mode);await tick(25);handle(result.promise);await tick(25);assert.equal(f.events.length,mode==='dispose-before-notify'?0:1);noExtraErrors(f);console.log(JSON.stringify({mode,pageEvents:f.events.length,recovered:true}));
 }finally{f.close()}
}else if(mode==='retained-gc'){
 let retained;
 (()=>{const f=realm(),result=defer(f.w.Promise);Object.setPrototypeOf(result.promise,null);f.controller.dispose();f.close();retained=result})();
 for(let i=0;i<5;i++){global.gc();await tick(0)}
 assert.equal(types.isPromise(retained.promise),true);assert.equal(binding.sameRealm(retained.promise,{}),false);retained.reject('retained disposed context');await tick(25);handle(retained.promise);await tick(25);console.log(JSON.stringify({mode,genuine:true,Host:false,recovered:true,gcRounds:5}));
}else if(mode==='host-fatal-newtarget'||mode==='host-fatal-graft'||mode==='unregistered-fatal'||mode==='host-before-installer'){
 let result;if(mode==='host-before-installer')result=defer(Promise);
 const f=realm({host:mode==='host-before-installer'});
 if(mode==='host-fatal-newtarget'){let reject;result={promise:Reflect.construct(Promise,[(_resolve,r)=>{reject=r}],f.w.Promise),get reject(){return reject}}}
 else if(mode==='host-fatal-graft'){result=defer(Promise);Object.setPrototypeOf(result.promise,f.w.Promise.prototype)}
 else if(mode==='unregistered-fatal'){const other=new JSDOM('',{runScripts:'outside-only'});result=defer(other.window.Promise)}
 console.log(JSON.stringify({mode,armed:true,genuine:types.isPromise(result.promise),Host:binding.sameRealm(result.promise,{})}));
 result.reject(Error('actual unrelated failure: '+mode));
 await tick(80);
 throw Error('fatal unrelated rejection was swallowed');
}else if(mode==='explicit-host-installer'){
 const f=realm({host:true});try{const result=defer(Promise);result.reject('explicit Host installer');await tick(25);handle(result.promise);await tick(25);assert.equal(f.events.length,2);assert.ok(f.events.every(e=>e.promise===result.promise));assert.equal(binding.sameRealm(result.promise,{}),true);noExtraErrors(f);console.log(JSON.stringify({mode,Host:true,pageEvents:2}));}finally{f.close()}
}else if(mode==='multiple-host-installers'){
 const first=realm({host:true}),one=defer(Promise),disposed=defer(Promise),second=realm({host:true}),two=defer(Promise);
 try{one.reject('first birth');two.reject('second birth');await tick(25);handle(one.promise);handle(two.promise);await tick(25);
  assert.equal(first.events.length,2);assert.ok(first.events.every(e=>e.promise===one.promise));assert.equal(second.events.length,2);assert.ok(second.events.every(e=>e.promise===two.promise));
  first.controller.dispose();disposed.reject('disposed first birth');await tick(25);handle(disposed.promise);await tick(25);assert.equal(first.events.length,2);assert.equal(second.events.length,2);noExtraErrors(first);noExtraErrors(second);console.log(JSON.stringify({mode,firstEvents:2,secondEvents:2,disposedIgnored:true}));
 }finally{first.close();second.close()}
}else throw Error('Unknown mode '+mode);
