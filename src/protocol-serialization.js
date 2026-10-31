// The actual V8 inspector serializer operates on original owned-VM values.
// JSON.stringify is not equivalent: toJSON is not a protocol serialization hook.
import {RealmInspector} from './runtime.js';
import {createInvocationTrampoline} from './invocation.js';
import {setImmediate as hostSchedule,clearImmediate as hostCancel} from 'node:timers';
export class ProtocolSerializer {
 constructor(){this.contexts=new WeakMap();this.records=new Set();this.pending=new Set();this.recovery=undefined;this.closed=false;}
 release(operation){
  const record=operation.record;record.operations.delete(operation);
  if(record.disposed&&!record.operations.size)record.inspector.close();
  this.pending.delete(operation);
  if(!this.pending.size&&this.recovery!==undefined){hostCancel(this.recovery);this.recovery=undefined;}
 }
 recover(){
  this.recovery=undefined;
  for(const operation of [...this.pending].reverse()){operation.record.dispose();this.release(operation);}
 }
 serialize(value,page){
  if(this.closed||page.closed||page.documentAbort?.signal.aborted)throw Object.assign(Error('Execution context was destroyed'),{code:-32000});
  const context=page.dom.getInternalVMContext();
  let record=this.contexts.get(context);
  if(!record){
   const inspector=new RealmInspector(page),signal=page.documentAbort?.signal;
   record={inspector,operations:new Set(),disposed:false,dispose:()=>{record.disposed=true;signal?.removeEventListener('abort',record.dispose);this.records.delete(record);this.contexts.delete(context);if(!record.operations.size)inspector.close();}};
   this.contexts.set(context,record);this.records.add(record);signal?.addEventListener('abort',record.dispose,{once:true});
  }
  const operation={record};this.pending.add(operation);this.recovery??=hostSchedule(()=>this.recover());record.operations.add(operation);
  try{return createInvocationTrampoline(context).withValue(value,expression=>{
   const id=record.inspector.realmSync();
   const result=record.inspector.postSync('Runtime.evaluate',{expression,contextId:id,returnByValue:true,silent:true});
   if(record.disposed||page.closed||page.documentAbort?.signal.aborted)throw Object.assign(Error('Execution context was destroyed'),{code:-32000});
   if(result.exceptionDetails)throw Object.assign(Error('Internal error'),{code:-32603});
   return result.result;
  },{timeout:Math.min(page.timeout,2000),displayErrors:false});}
  catch(error){if(error.code==='ERR_SCRIPT_EXECUTION_TIMEOUT')record.dispose();throw error;}
  finally{this.release(operation);}
 }
 close(){if(this.closed)return;this.closed=true;for(const record of this.records)record.dispose();this.records.clear();}
}
