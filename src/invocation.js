// Independent NodeVM invocation adapter. Install before authored code. State and
// bridges are genuine Host values; the random lexical entry is not a native
// private slot. Its bootstrap-only context property is removed synchronously.
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import {setImmediate as hostSchedule,clearImmediate as hostCancel} from 'node:timers';

const installed = new WeakMap(), exitObservers = new WeakMap();
// Trusted owners may schedule work after a real VM entry unwinds. Observers
// receive no authored values or invocation records, and never run inside the VM.
export function observeInvocationExit(context, observer) {
  let observers=exitObservers.get(context);if(!observers){observers=new Set();exitObservers.set(context,observers)}
  observers.add(observer);return()=>observers.delete(observer);
}
export function notifyInvocationExit(context) {
  for(const observer of exitObservers.get(context)??[])observer();
}
const hostApply = Reflect.apply, hostDefine=Object.defineProperty, hostDelete=Reflect.deleteProperty;
const nil=()=>Object.create(null),privateFunction=fn=>Object.setPrototypeOf(fn,null);

export function createInvocationTrampoline(context) {
  if (!vm.isContext(context)) throw new TypeError('An actual VM context is required');
  if (installed.has(context)) return installed.get(context);
  const binding = `__redpanda_invocation_${randomUUID().replaceAll('-', '')}`;
  const realmApply=vm.runInContext('Reflect.apply',context),ErrorConstructor=vm.runInContext('Error',context);
  const parents=new WeakMap(),parentGet=WeakMap.prototype.get,parentSet=WeakMap.prototype.set;
  let current=null,disposed=false,recovery;
  const pending=new Set();
  function enter(frame){const previous=current;hostApply(parentSet,parents,[frame,previous]);current=frame;return previous;}
  function unwind(frame,previous){
    const seen=new WeakSet();
    for(let cursor=current;cursor!==null&&cursor!==undefined;cursor=hostApply(parentGet,parents,[cursor])){
      if(cursor===frame){current=previous;return;}
      if(seen.has(cursor))return;seen.add(cursor);
    }
  }
  const bridge=Object.freeze(Object.assign(nil(),{
    run:privateFunction(()=>{const frame=current;if(frame===null)throw new ErrorConstructor('No owned invocation frame');return hostApply(realmApply,undefined,[frame.fn,frame.receiver,frame.args]);}),
    inspect:privateFunction(()=>{const frame=current;if(frame===null)throw new ErrorConstructor('No owned invocation frame');return hostApply(realmApply,undefined,[frame.inspect,undefined,[]]);}),
  }));
  // NodeVM Script execution provides the actual watchdog/deadline. A one-time
  // data property transfers the Host bridge into its lexical entry. No property
  // is installed during calls, and no authored script runs in this bootstrap.
  hostDefine(context,binding,{value:bridge,configurable:true});
  try{new vm.Script(`'use strict';const ${binding}=this[${JSON.stringify(binding)}];delete this[${JSON.stringify(binding)}];`,{filename:'red-panda:invocation-bootstrap'}).runInContext(context);}
  finally{hostDelete(context,binding);}
  const invocation = new vm.Script(`${binding}.run()`, { filename: 'red-panda:owned-invocation' });
  const inspection = new vm.Script(`${binding}.inspect()`, { filename: 'red-panda:owned-serialization' });
  function recover(){recovery=undefined;for(const token of [...pending].reverse())unwind(token.frame,token.previous);pending.clear();}
  function begin(frame){const token=Object.assign(nil(),{frame,previous:null});pending.add(token);recovery??=hostSchedule(recover);token.previous=enter(frame);return token;}
  function finish(token){current=disposed?null:token.previous;pending.delete(token);if(!pending.size&&recovery!==undefined){hostCancel(recovery);recovery=undefined;}if(!pending.size)notifyInvocationExit(context);}
  const adapter = Object.freeze({
    binding,
    withValue(value, inspect, options) {
      if (disposed) throw new Error('Invocation context is disposed');
      const token=begin(Object.assign(nil(),{fn:()=>value,receiver:undefined,args:[],inspect:()=>inspect(`${binding}.run()`)}));
      try { return inspection.runInContext(context, options); }
      finally {finish(token);}
    },
    invoke(fn, receiver, args, options) {
      if (disposed) throw new Error('Invocation context is disposed');
      const token=begin(Object.assign(nil(),{fn,receiver,args}));
      try { return invocation.runInContext(context, options); }
      finally {finish(token);}
    },
    invokeDeclaration(declaration, receiver, args, options) {
      if (disposed) throw new Error('Invocation context is disposed');
      const fn = new vm.Script(`(${declaration}\n)`, { filename: 'red-panda:function-declaration' }).runInContext(context, options);
      return adapter.invoke(fn, receiver, args, options);
    },
    dispose() {disposed=true;current=null;pending.clear();if(recovery!==undefined){hostCancel(recovery);recovery=undefined;}},
  });
  installed.set(context, adapter); return adapter;
}

export function invocationBindingFor(context) { return installed.get(context)?.binding; }
