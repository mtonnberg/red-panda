// Isolated causal observations only. No browser/dependency/native edits.
import vm from 'node:vm';
import {AsyncLocalStorage,createHook} from 'node:async_hooks';
import {getRuntimeBinding} from '../../src/native-runtime.js';
const mode=process.argv[2],binding=getRuntimeBinding(),als=new AsyncLocalStorage(),report={mode,pid:process.pid,timeoutMS:200,markers:[]};
const mark=(name,data={})=>{report.markers.push({name,...data});console.log(JSON.stringify({mode,name,...data}))};
const after=mode.startsWith('after')||mode.startsWith('nested')||mode==='producer-ownership';
const enabled=mode.endsWith('-als')||mode==='producer-ownership';
const resources=new WeakMap();if(mode.endsWith('-hook'))createHook({init(id,type,trigger,resource){if(type==='PROMISE')resources.set(resource,{id,trigger})}}).enable();
let context;
await new Promise(resolve=>setImmediate(()=>{
 const execute=()=>{
  context=vm.createContext({checkpoint:binding.checkpoint},after?{microtaskMode:'afterEvaluate'}:{});report.actualNodeContext=vm.isContext(context);
  if(mode==='producer-ownership'){
   vm.runInContext('globalThis.trace=[];globalThis.promise=new Promise(resolve=>globalThis.deliver=resolve);promise.then(()=>trace.push("reaction:1")).then(()=>trace.push("reaction:2"));',context,{timeout:200});
   context.deliver('actual value');report.beforeEntry=Array.from(context.trace);mark('host-producer-delivered',{trace:report.beforeEntry});
  }else{
   if(mode.startsWith('nested'))context.drain=()=>vm.runInContext('',context,{timeout:200});
   mark('armed',{afterEvaluate:after,asyncLocalStorage:enabled});
   const source='globalThis.entered=false;Promise.resolve().then(()=>{entered=true;while(true){}});'+(mode.startsWith('default')?'checkpoint();':mode.startsWith('nested')?'drain();':'');
   try{vm.runInContext(source,context,{timeout:200});report.returnedNormally=true}catch(error){report.caught={name:error.name,message:error.message};mark('caught',report.caught)}
   report.entered=vm.runInContext('entered',context,{timeout:200});
   vm.runInContext('globalThis.trace=[];Promise.resolve().then(()=>trace.push("positive:1")).then(()=>trace.push("positive:2"));'+(!after?'checkpoint();':''),context,{timeout:200});report.recovery=Array.from(context.trace);mark('before-host-return',{entered:report.entered,recovery:report.recovery});
  }
 };
 if(enabled)als.run({owner:'actual diagnostic'},execute);else execute();resolve();
}));
await new Promise(resolve=>setImmediate(resolve));
if(mode==='producer-ownership'){
 report.afterHostTick=Array.from(context.trace);vm.runInContext('',context,{timeout:200});report.afterOwnedEntry=Array.from(context.trace);mark('actual-owned-entry',{afterHostTick:report.afterHostTick,afterOwnedEntry:report.afterOwnedEntry});
}
mark('host-return-and-next-tick');console.log(JSON.stringify(report));
