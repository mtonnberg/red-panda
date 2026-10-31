import vm from 'node:vm';
import {Worker,isMainThread,parentPort} from 'node:worker_threads';
import {installWorkerDOMException} from '../src/worker-dom-exception.js';
import {installWorkerEvents} from '../src/worker-events.js';
import {installWorkerAbort} from '../src/worker-abort.js';
import {getHeapBinding} from '../src/native-heap.js';
if(isMainThread){const worker=new Worker(new URL(import.meta.url));worker.on('message',value=>console.log(JSON.stringify(value,null,2)));worker.on('error',error=>{console.error(error);process.exitCode=1})}
else{
 const context=vm.createContext({setTimeout,clearTimeout}),evaluate=source=>vm.runInContext(source,context),realm=evaluate('globalThis');
 installWorkerDOMException(realm,{evaluate});const events=installWorkerEvents(realm,{evaluate});const abort=installWorkerAbort(realm,{evaluate,events});
 const heap=getHeapBinding(),anchor=evaluate('({})'),host={};const values=evaluate(`(()=>{const c=new AbortController();return{controller:c,signal:c.signal,event:new Event('x'),target:new EventTarget(),message:new MessageEvent('x'),exception:new DOMException('x'),controllerFunction:AbortController,signalFunction:AbortSignal,eventFunction:Event,targetFunction:EventTarget,signalGetter:Object.getOwnPropertyDescriptor(AbortSignal.prototype,'reason').get}})()`),rows=[];
 for(const[name,value]of Object.entries(values)){const row={name,VM:heap.sameRealm(value,anchor),Host:heap.sameRealm(value,host),creationGlobal:heap.creationGlobal(value)===realm};Object.setPrototypeOf(value,null);row.VMNullPrototype=heap.sameRealm(value,anchor);row.HostNullPrototype=heap.sameRealm(value,host);rows.push(row)}
 abort.dispose();events.dispose();parentPort.postMessage({node:process.version,thread:true,backend:heap.backend,rows});
}
