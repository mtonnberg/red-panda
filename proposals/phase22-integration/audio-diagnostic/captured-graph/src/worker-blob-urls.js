import {platformFactoryRecord} from './platform-factories.js';

export function completeWorkerBlobURL(shared, result, error) {
  const state=new Int32Array(shared,0,2),destination=new Uint8Array(shared,8);
  const encoded=new TextEncoder().encode(JSON.stringify(error?{error:String(error.message??error)}:{result}));
  destination.set(encoded.subarray(0,destination.length));Atomics.store(state,1,Math.min(encoded.length,destination.length));Atomics.store(state,0,1);Atomics.notify(state,0);
}
export function installWorkerBlobURLs(realm,{evaluate,port,active=()=>true,timeoutMs=5000}={}) {
  const TypeErrorClass=realm.TypeError,Exception=realm.DOMException;
  const call=(operation,value)=>{
    if(!active())throw new Exception('The worker is disposed','InvalidStateError');
    let blob;
    if(operation==='create'){
      const producer=platformFactoryRecord(value);
      if(!producer||!['Blob','File'].includes(producer.kind)||typeof producer.read!=='function')throw new TypeErrorClass('invalid argument');
      // Only immutable data returned by an authenticated allocation producer
      // leaves the worker. Public Node Blob symbols and getters are ignored.
      blob=producer.read().blob;
    }
    const shared=new SharedArrayBuffer(65536),state=new Int32Array(shared,0,2);
    port.postMessage({kind:'blobURL',operation,...(operation==='create'?{blob}:{value}),sync:shared});
    if(Atomics.wait(state,0,0,timeoutMs)==='timed-out'||Atomics.load(state,0)!==1)throw new Exception('Object URL operation did not complete','TimeoutError');
    const response=JSON.parse(new TextDecoder().decode(new Uint8Array(shared,8,Atomics.load(state,1))));
    if(response.error)throw new TypeErrorClass(response.error);
    return response.result;
  };
  const methods=evaluate(`(call=>({
    createObjectURL(value){if(!arguments.length)throw new TypeError('invalid argument');return call('create',value)},
    revokeObjectURL(value){if(!arguments.length)throw new TypeError('invalid argument');call('revoke',String(value))}
  }))`)(call);
  for(const name of ['createObjectURL','revokeObjectURL'])Object.defineProperty(realm.URL,name,{value:methods[name],writable:true,enumerable:true,configurable:true});
}
