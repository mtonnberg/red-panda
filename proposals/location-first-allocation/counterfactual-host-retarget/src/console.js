// Independent Console namespace: genuine realm methods and host-private state.
const records=new WeakMap(),apply=Reflect.apply;
const own=Object.getOwnPropertyDescriptor,define=Object.defineProperty;
export const consoleProtocolType=type=>type==='warn'?'warning':type;
function factory(g,bridge){
 const {defineProperty,create,setPrototypeOf,getOwnPropertyDescriptor}=Object;
 const apply=Reflect.apply,StringConstructor=String,TypeErrorConstructor=TypeError,ErrorConstructor=Error;
 const primitiveSymbol=Symbol.toPrimitive,description=getOwnPropertyDescriptor(Symbol.prototype,'description').get;
 function label(value){
  if(value===undefined)return 'default';
  const object=v=>v!==null&&(typeof v==='object'||typeof v==='function');
  if(object(value)){
   const exotic=value[primitiveSymbol];
   if(exotic!==null&&exotic!==undefined){if(typeof exotic!=='function')throw new TypeErrorConstructor('invalid argument');value=apply(exotic,value,['string']);if(object(value))throw new TypeErrorConstructor('invalid argument');}
   else{let done=false;for(let index=0;index<2;index++){const key=index===0?'toString':'valueOf';const method=value[key];if(typeof method!=='function')continue;const result=apply(method,value,[]);if(!object(result)){value=result;done=true;break;}}if(!done)throw new TypeErrorConstructor('invalid argument');}
  }
  return StringConstructor(typeof value==='symbol'?apply(description,value,[]):value);
 }
 class Console{constructor(){throw new TypeErrorConstructor('Illegal constructor');}}
 class ConsoleTask{constructor(){const task={run(callback=undefined){if(typeof callback!=='function')throw new ErrorConstructor('First argument must be a function.');return apply(callback,undefined,[]);}};setPrototypeOf(task,ConsoleTask.prototype);return task;}}
 const namespace={
  trace(...args){bridge.emit('trace',args);},debug(...args){bridge.emit('debug',args);},info(...args){bridge.emit('info',args);},log(...args){bridge.emit('log',args);},warn(...args){bridge.emit('warn',args);},
  clear(){},assert(condition=undefined,...args){if(!condition)bridge.emit('warn',args);},error(...args){bridge.emit('error',args);},exception(...args){bridge.emit('error',args);},
  table(){},dir(...args){bridge.emit('dir',args);},dirxml(...args){bridge.emit('dirxml',args);},
  count(value=undefined){bridge.count(label(value));},countReset(value=undefined){bridge.countReset(label(value));},
  time(value=undefined){bridge.time(label(value));},timeLog(value=undefined,...args){bridge.timeLog(label(value),args);},timeEnd(value=undefined){bridge.timeEnd(label(value));},
  group(...args){bridge.group();},groupCollapsed(...args){bridge.group();},groupEnd(){bridge.groupEnd();},
  createTask(name=undefined){if(typeof name!=='string'||name.length===0)throw new ErrorConstructor('First argument must be a non-empty string.');return new ConsoleTask();},
 };
 setPrototypeOf(namespace,Console.prototype);defineProperty(namespace,Symbol.toStringTag,{value:'console',configurable:true});
 const accessor={get console(){const value=bridge.get(this);if(value===undefined)throw new TypeErrorConstructor('Illegal invocation');return value;},set console(value){defineProperty(this,'console',{value,writable:true,configurable:true,enumerable:true});}};
 const prototype=g.Window?.prototype??g.WorkerGlobalScope?.prototype;
 if(prototype){delete g.console;defineProperty(prototype,'console',getOwnPropertyDescriptor(accessor,'console'));}
 else defineProperty(g,'console',{value:namespace,configurable:true,writable:true,enumerable:true});
 return namespace;
}
export function installConsole(realm,{evaluate=source=>realm.eval(source),emit}={}){
 if(records.has(realm))return records.get(realm).namespace;
 if(typeof emit!=='function')throw new TypeError('Console output bridge is required');
 const counters=new Map(),timers=new Map();let depth=0;
 const bridge={
  get:receiver=>records.get(receiver)?.namespace,
  emit(type,args){const values=[];for(let i=0;i<args.length;i++)define(values,String(i),{value:own(args,String(i)).value,enumerable:true,writable:true,configurable:true});emit(type,values);},
  count:key=>counters.set(key,(counters.get(key)??0)+1),countReset:key=>counters.delete(key),
  time:key=>{if(!timers.has(key))timers.set(key,performance.now());},timeLog:key=>{if(timers.has(key))return performance.now()-timers.get(key);},timeEnd:key=>timers.delete(key),
  group:()=>depth++,groupEnd:()=>{if(depth)depth--;},
 };
 const namespace=evaluate(`(${factory.toString()})`)(realm,bridge);
 const record=Object.freeze(Object.assign(Object.create(null),{namespace}));
 records.set(realm,record);records.set(evaluate('globalThis'),record);
 for(const key of ['_globalObject','_globalProxy']){const descriptor=own(realm,key);if(descriptor&&'value'in descriptor&&descriptor.value&&typeof descriptor.value==='object')records.set(descriptor.value,record);}
 return namespace;
}
