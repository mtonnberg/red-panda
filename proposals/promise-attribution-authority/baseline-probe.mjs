// Classification observations only: the explicit process observer prevents Host
// fallback fatality here; the independent host-fatal mode measures that path.
import {JSDOM,VirtualConsole} from 'jsdom';
import {types} from 'node:util';
import {installErrors} from '../../src/errors.js';
import {getHeapBinding} from '../../src/native-heap.js';
const fatal=process.argv[2]==='host-fatal',binding=getHeapBinding(),rows=[],processEvents=[],labels=new WeakMap();
const tick=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function realm(label){const errors=[],events=[],page={closed:false,documentAbort:new AbortController()};let controller;
 const vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM('<body>',{runScripts:'dangerously',virtualConsole:vc,beforeParse(w){controller=installErrors(page,w)}}),w=dom.window;
 for(const type of ['unhandledrejection','rejectionhandled'])w.addEventListener(type,e=>{events.push({label:labels.get(e.promise),type,trusted:e.isTrusted,cancelable:e.cancelable,reason:e.reason===null?null:String(e.reason),promiseIdentity:labels.has(e.promise)});e.preventDefault()});
 return{label,w,dom,page,controller,errors,events,anchor:w.eval('[]')};}
const a=realm('a'),b=realm('b');
if(fatal){Promise.reject(Error('unrelated Host rejection remains fatal'));await tick(80);a.dom.window.close();b.dom.window.close();process.exitCode=2;}
else{
 process.on('unhandledRejection',(reason,promise)=>processEvents.push({type:'unhandledRejection',label:labels.get(promise),reason:String(reason)}));
 process.on('rejectionHandled',promise=>processEvents.push({type:'rejectionHandled',label:labels.get(promise)}));
 const hostThen=Promise.prototype.then;let traps=0;
 async function observe(label,make,{dispose=false}={}){const startA=a.events.length,startB=b.events.length,startP=processEvents.length;const {promise,reject}=make();labels.set(promise,label);
  const proof={isPromise:types.isPromise(promise),a:binding.sameRealm(promise,a.anchor),b:binding.sameRealm(promise,b.anchor),host:binding.sameRealm(promise,{}),globalA:binding.creationGlobal(promise)===binding.creationGlobal(a.anchor),globalB:binding.creationGlobal(promise)===binding.creationGlobal(b.anchor)};
  if(dispose)a.controller.dispose();reject(label);await tick(25);Reflect.apply(hostThen,promise,[undefined,()=>{}]);await tick(25);
  rows.push({label,proof,traps,a:a.events.slice(startA),b:b.events.slice(startB),process:processEvents.slice(startP)});
 }
 const deferred=C=>{let reject;return{promise:new C((_resolve,r)=>{reject=r}),reject}};
 await observe('ordinary-a',()=>deferred(a.w.Promise));
 await observe('null-after-init',()=>{const r=deferred(a.w.Promise);Object.setPrototypeOf(r.promise,null);return r});
 await observe('vm-subclass-null-chain',()=>{const C=a.w.eval('(class extends Promise {})');Object.setPrototypeOf(C.prototype,null);return deferred(C)});
 await observe('vm-subclass-foreign-chain',()=>{const C=a.w.eval('(class extends Promise {})');Object.setPrototypeOf(C.prototype,b.w.Promise.prototype);return deferred(C)});
 await observe('host-constructor-vm-newtarget',()=>{let reject;const promise=Reflect.construct(Promise,[(_resolve,r)=>{reject=r}],a.w.Promise);return{promise,reject}});
 await observe('vm-constructor-host-newtarget',()=>{let reject;const promise=Reflect.construct(a.w.Promise,[(_resolve,r)=>{reject=r}],Promise);return{promise,reject}});
 await observe('host-promise-vm-prototype-after-init',()=>{const r=deferred(Promise);Object.setPrototypeOf(r.promise,a.w.Promise.prototype);return r});
 await observe('vm-subclass-proxy-chain',()=>{const C=a.w.eval('(class extends Promise {})');Object.setPrototypeOf(C.prototype,new Proxy(a.w.Promise.prototype,{getPrototypeOf(){traps++;throw Error('authored prototype trap')}}));return deferred(C)});
 await observe('foreign-b',()=>deferred(b.w.Promise));
 await observe('disposed-a',()=>deferred(a.w.Promise),{dispose:true});
 console.log(JSON.stringify({scope:'unchanged baseline; explicit process observer classification, not Host-fatal acceptance',pid:process.pid,rows,traps,errors:{a:a.errors,b:b.errors}}));
 for(const r of [a,b]){r.page.closed=true;r.page.documentAbort.abort();r.dom.window.close()}
}
