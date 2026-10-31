import { registerNativeBlobFactory } from '../src/native-platform-factories.js';
// Actual thread control for the termination gap after a real native BC
// reservation, before the parent's ready message. No user message is fabricated.
import {parentPort,workerData} from 'node:worker_threads';
import {File} from 'node:buffer';
import {createMessagingRealm} from '../src/messaging.js';
import {createBroadcastRealm} from '../src/broadcast-realm.js';
const messaging=createMessagingRealm(globalThis);
const broadcast=createBroadcastRealm(globalThis,{messaging,config:workerData.config,relay:message=>{
 if(message.kind==='broadcastReady'){
  parentPort.postMessage({kind:'atReady'});
  Atomics.wait(new Int32Array(workerData.gate),0,0);
 }
 parentPort.postMessage(message);
}});
const source=new broadcast.BroadcastChannel(workerData.name);
const file=registerNativeBlobFactory(new File(['survives physical thread termination'],'terminated.txt',{type:'text/plain',lastModified:654}),{kind:'File'});
source.postMessage({file,again:file});
