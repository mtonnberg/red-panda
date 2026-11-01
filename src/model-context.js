// Independent Window author-tool registry. The automation MCP server is a
// separate service; author callbacks and their actual documents own these tools.
import vm from 'node:vm';
import {types} from 'node:util';
import {createRequire} from 'node:module';
import {setTimeout as pendingTask,clearTimeout as cancelPendingTask,setImmediate as nextTurn,clearImmediate as cancelNextTurn} from 'node:timers';
import {createInvocationTrampoline,observeInvocationExit} from './invocation.js';
import {getRuntimeBinding} from './native-runtime.js';
import {getHeapBinding} from './native-heap.js';
import {platformFactoryRecord} from './platform-factories.js';
import {registerProtocolPrototype} from './protocol-classes.js';
import {captureDOMExceptionFactory} from './worker-dom-exception.js';

const {implForWrapper}=createRequire(import.meta.url)('jsdom/lib/jsdom/living/generated/utils.js');
const owners=new WeakMap(),contexts=new WeakMap(),navigators=new WeakMap(),registries=new WeakMap(),sessions=new WeakMap();
const realmAnchors=new WeakMap();
const apply=Reflect.apply,create=Object.create,assign=Object.assign;
const state=fields=>assign(create(null),fields);
const pendingCheckMilliseconds=8;

function definition(g,b){
 'use strict';
 const {defineProperty:define,getOwnPropertyDescriptor:own}=Object;
 const apply=Reflect.apply,StringConstructor=String,TypeErrorConstructor=TypeError,ErrorConstructor=Error,PromiseConstructor=Promise;
 const description=own(Symbol.prototype,'description').get;
 const object=value=>value!==null&&(typeof value==='object'||typeof value==='function'||(typeof value==='undefined'&&value!==undefined));
 const invalid=()=>{throw new TypeErrorConstructor('invalid argument')};
 const illegal=()=>{throw new TypeErrorConstructor('Illegal invocation')};
 const text=value=>StringConstructor(typeof value==='symbol'?apply(description,value,[]):value);
 function ModelContext(){throw new TypeErrorConstructor('Illegal Constructor')}
 function ModelContextClient(){throw new TypeErrorConstructor('Illegal Constructor')}
 // These objects are the public prototypes themselves, including the methods'
 // original HomeObjects. There is no retained VM interfaces/controller table.
 const contextPrototype={
  registerTool(tool){
   if(!b.hasContext(this))illegal();if(!object(tool))invalid();
   let readOnly=false,untrustedContent=false,autosubmit=false;
   const annotations=tool.annotations;
   if(annotations!==undefined&&annotations!==null){
    if(!object(annotations))invalid();
    const automatic=annotations.autoSubmitHint;if(automatic!==undefined)autosubmit=!!automatic;
    const read=annotations.readOnlyHint;if(read!==undefined)readOnly=!!read;
    const untrusted=annotations.untrustedContentHint;if(untrusted!==undefined)untrustedContent=!!untrusted;
   }
   const descriptionValue=tool.description;if(descriptionValue===undefined)invalid();const convertedDescription=text(descriptionValue);
   const execute=tool.execute;if(typeof execute!=='function')invalid();
   const schema=tool.inputSchema;if(schema!==undefined&&schema!==null&&!object(schema))invalid();
   const nameValue=tool.name;if(nameValue===undefined)invalid();const name=text(nameValue);
   const title=tool.title;if(title!==undefined&&title!==null)text(title);
   const options=arguments[1];let signal;
   if(options!==undefined&&options!==null){if(!object(options))invalid();signal=options.signal;if(signal!==undefined&&signal!==null&&!b.hasSignal(signal))invalid()}
   if(!b.validName(name)||!convertedDescription.length)throw b.invalidState();
   b.register(this,name,convertedDescription,execute,schema,readOnly,untrustedContent,autosubmit,signal);
  },
 };
 const clientPrototype={
  requestUserInteraction(callback){
   // Native's actual Client operation is stateless: borrowing onto {} works.
   // Argument conversion and callback failures reject its real realm Promise.
   return new PromiseConstructor((resolve,reject)=>{
    if(typeof callback!=='function'){reject(new TypeErrorConstructor('invalid argument'));return}
    try{resolve(b.interact(callback))}catch(error){reject(new ErrorConstructor(text(error==null?error:(error.message===undefined?error:error.message))))}
   });
  },
 };
 for(const [Constructor,prototype]of [[ModelContext,contextPrototype],[ModelContextClient,clientPrototype]]){
  for(const key of Reflect.ownKeys(prototype)){const descriptor=own(prototype,key);define(prototype,key,{...descriptor,writable:true,enumerable:true,configurable:true})}
  define(prototype,'constructor',{value:Constructor,writable:true,configurable:true});
  define(prototype,Symbol.toStringTag,{value:Constructor.name,configurable:true});
  define(Constructor,'prototype',{value:prototype,writable:false});
  define(g,Constructor.name,{value:Constructor,writable:true,configurable:true});
 }
 b.exportPublic(ModelContext,ModelContextClient);
}

function registryFor(page){
 const root=page.registry?.page??page;
 let registry=registries.get(root);
 if(!registry){registry=state({root,owners:new Set(),subscriptions:new Set(),invocations:new Map(),nextInvocation:0,checkingPending:false});registries.set(root,registry)}
 return registry;
}
function sourceAnchor(owner,promise){
 // Exact public-V8 creation-context identity, not a public prototype or copied
 // symbol, selects the trusted actual browser realm of a returned Promise.
 const anchors=realmAnchors.get(owner.page.context),binding=getHeapBinding();
 for(const reference of anchors??[]){const anchor=reference.deref();if(!anchor){anchors.delete(reference);continue}if(binding.sameRealm(promise,anchor))return anchor}
 return owner.anchor; // The privileged primitive rejects a foreign creation realm.
}
const live=owner=>!owner.disposed&&!owner.page.closed&&!owner.signal?.aborted&&owner.window.document===owner.document;
function notify(registry,method,params){for(const subscriber of registry.subscriptions)if(subscriber.enabled&&!subscriber.session.closed)subscriber.session.event(method,params)}
function serialize(owner,value){
 // Author JSON getters/toJSON run in their actual VM under its actual watchdog.
 const json=owner.invocation.invoke(owner.stringify,owner.JSON,[value],owner.options);
 return json===undefined?undefined:JSON.parse(json);
}
function toolMetadata(tool,frameId=tool.owner.page.frameId){return {name:tool.name,description:tool.description,inputSchema:tool.schema==null?{}:serialize(tool.owner,tool.schema),annotations:{readOnly:tool.readOnly,untrustedContent:tool.untrustedContent,autosubmit:tool.autosubmit},frameId}}
function signalSource(value){const record=platformFactoryRecord(value);return record?.kind==='AbortSignal'?record.implementation:null}
function removeTool(tool){
 const owner=tool.owner;if(owner.tools.get(tool.name)!==tool)return;
 owner.tools.delete(tool.name);if(tool.source&&tool.abort)tool.source._removeAlgorithm(tool.abort);tool.abort=null;
 notify(owner.registry,'WebMCP.toolsRemoved',{tools:[{name:tool.name,frameId:owner.page.frameId}]});
}
function cleanupInvocation(job){
 const owner=job.owner;
 job.active=false;owner.registry.invocations.delete(job.id);owner.invocations.delete(job);owner.pending.delete(job);job.result=null;job.tool=null;
 if(!owner.pending.size){if(owner.pendingTimer!==undefined){cancelPendingTask(owner.pendingTimer);owner.pendingTimer=undefined}if(owner.pendingTurn!==undefined){cancelNextTurn(owner.pendingTurn);owner.pendingTurn=undefined}}
}
function errorText(owner,error,synchronous){
 // A fresh non-retained VM function bounds actual authored error conversion.
 return owner.invocation.invokeDeclaration(synchronous?'function(value,String){return String(value==null?value:(value.message===undefined?value:value.message))}':'function(value,String){return String(value)}',undefined,[error,owner.String],owner.options);
}
function respond(job,kind,value){
 if(!job.active)return;
 const owner=job.owner;
 try{
  if(!live(owner))return;
  const params={invocationId:job.id,status:kind==='value'?'Completed':'Error'};
  if(kind==='value')params.output=serialize(owner,value);else params.errorText=errorText(owner,value,kind==='throw');
  // Reentrant serialization may cancel this real invocation. Cancellation owns
  // delivery and is checked again after all authored conversions have finished.
  if(job.active&&live(owner))notify(owner.registry,'WebMCP.toolResponded',params);
 }finally{cleanupInvocation(job)}
}
function cancelInvocation(job){
 if(!job.active)return;
 try{notify(job.owner.registry,'WebMCP.toolResponded',{invocationId:job.id,status:'Canceled'})}finally{cleanupInvocation(job)}
}

function schedulePendingTurn(owner){
 if(owner.registry.checkingPending||owner.checking||!owner.pending.size||!live(owner)||owner.pendingTurn!==undefined)return;
 if(owner.pendingTimer!==undefined){cancelPendingTask(owner.pendingTimer);owner.pendingTimer=undefined}
 // This is an actual owner task, independent of the CDP transport/reply. First
 // adoption is asynchronous even if V8 already holds a fulfilled result.
 owner.pendingTurn=nextTurn(()=>{owner.pendingTurn=undefined;checkPending(owner)});
 owner.pendingTurn.unref();
}
function checkPending(owner){
 const registry=owner.registry;
 if(registry.checkingPending||owner.checking||!owner.pending.size)return;
 registry.checkingPending=true;owner.checking=true;
 try{
  if(!live(owner)){for(const job of owner.pending)cleanupInvocation(job);return}
  // A real VM-owned checkpoint, bounded by the unchanged actual watchdog. Its
  // shared queue can settle genuine Promises from other frames in this registry.
  // Internal checkpoint/serialization exits must not recursively promote every
  // unresolved owner into another immediate turn.
  try{owner.invocation.invoke(owner.runtime.checkpoint,undefined,[],owner.options)}catch(error){owner.page.emit('pageError',error)}
  for(const current of registry.owners){
   if(!live(current)){for(const job of current.pending)cleanupInvocation(job);continue}
   for(const job of [...current.pending]){
    if(!job.active)continue;
    try{
     const snapshot=current.runtime.promiseSnapshot(job.result);
     if(snapshot.state===1)respond(job,'value',snapshot.value);
     else if(snapshot.state===2)respond(job,'reject',snapshot.value);
    }catch(error){cleanupInvocation(job);current.page.emit('pageError',error)}
   }
  }
 }finally{
  owner.checking=false;registry.checkingPending=false;
  for(const current of registry.owners){
   if(current.pending.size&&live(current)&&current.pendingTimer===undefined&&current.pendingTurn===undefined){
    current.pendingTimer=pendingTask(()=>{current.pendingTimer=undefined;checkPending(current)},pendingCheckMilliseconds);
    // A real unresolved author Promise must not retain the embedding process.
    current.pendingTimer.unref();
   }
  }
 }
}

export function installModelContext(page,window){
 if(owners.has(window))return;
 const context=implForWrapper(window)._globalObject;
 if(!vm.isContext(context))throw new TypeError('ModelContext requires its actual Window VM');
 const registry=registryFor(page),owner=state({page,window,document:window.document,signal:page.documentAbort?.signal,registry,disposed:false,tools:new Map(),invocations:new Set(),pending:new Set(),pendingTimer:undefined,pendingTurn:undefined,checking:false,front:null});
 owner.invocation=createInvocationTrampoline(context);owner.stopObserving=observeInvocationExit(context,()=>{for(const current of registry.owners)schedulePendingTurn(current)});owner.options=state({timeout:Math.min(page.timeout??2000,2000),displayErrors:false});
 // Captured public intrinsics are actual VM functions; no private VM factories
 // are returned to Host or retained in an ordinary VM record.
 owner.create=window.Object.create;owner.JSON=window.JSON;owner.stringify=window.JSON.stringify;owner.parse=window.JSON.parse;
 owner.String=window.String;owner.runtime=page.browser?.runtimeBinding??getRuntimeBinding();owner.invalidState=captureDOMExceptionFactory(window);
 owner.anchor=window.Object.prototype;
 let anchors=realmAnchors.get(page.context);if(!anchors){anchors=new Set();realmAnchors.set(page.context,anchors)}anchors.add(new WeakRef(owner.anchor));
 const bridge=state({
  hasContext:value=>contexts.has(value),hasNavigator:value=>navigators.has(value),hasSignal:value=>!!signalSource(value),
  validName(value){if(value.length===0||value.length>128)return false;for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);if(!(code>=48&&code<=57||code>=65&&code<=90||code>=97&&code<=122||code===45||code===46||code===95))return false}return true},
  invalidState:()=>owner.invalidState('The object is in an invalid state','InvalidStateError'),
  // Native6 proves a genuine borrowed Navigator getter returns the defining
  // realm's canonical own backend, while its receiver must be genuine.
  context(){if(owner.front===null){owner.front=apply(owner.create,undefined,[owner.contextPrototype]);contexts.set(owner.front,owner)}return owner.front},
  register(receiver,name,description,execute,schema,readOnly,untrustedContent,autosubmit,signal){
   const actual=contexts.get(receiver);
   if(!live(actual)||actual.tools.has(name))throw owner.invalidState('The object is in an invalid state','InvalidStateError');
   const source=signal==null?null:signalSource(signal);if(source?.aborted)return;
   const tool=state({owner:actual,name,description,execute,schema,readOnly,untrustedContent,autosubmit,source,abort:null});
   actual.tools.set(name,tool);if(source){tool.abort=()=>removeTool(tool);source._addAlgorithm(tool.abort)}
   // Native borrowed registration stores on the genuine receiver, while its
   // immediate notification carries the registering method's actual frame.
   notify(actual.registry,'WebMCP.toolsAdded',{tools:[toolMetadata(tool,owner.page.frameId)]});
  },
  interact(callback){return owner.invocation.invoke(callback,owner.window,[],owner.options)},
  exportPublic(ModelContext,ModelContextClient){owner.contextPrototype=ModelContext.prototype;owner.clientPrototype=ModelContextClient.prototype;registerProtocolPrototype(owner.contextPrototype,'ModelContext');registerProtocolPrototype(owner.clientPrototype,'ModelContextClient')},
 });
 vm.compileFunction(`(${definition.toString()})(globalThis,bridge)`,['bridge'],{parsingContext:context})(bridge);
 const TypeErrorConstructor=window.TypeError;
 const getter=owner.runtime.createEntry((_incumbent,receiver)=>{if(!navigators.has(receiver))throw new TypeErrorConstructor('Illegal invocation');return bridge.context(receiver)},window.Object,'get modelContext');
 Object.defineProperty(getter,'length',{value:0,configurable:true});Object.defineProperty(window.Navigator.prototype,'modelContext',{get:getter,enumerable:true,configurable:true});
 owners.set(window,owner);navigators.set(window.navigator,owner);registry.owners.add(owner);
 const dispose=()=>{
  if(owner.disposed)return;owner.disposed=true;registry.owners.delete(owner);
  for(const tool of owner.tools.values())if(tool.source&&tool.abort)tool.source._removeAlgorithm(tool.abort);
  owner.tools.clear();for(const job of owner.invocations)cleanupInvocation(job);owner.stopObserving();
  owner.signal?.removeEventListener('abort',dispose);page.off?.('close',dispose);
 };
 // Genuine Page.close aborts the document signal. Reuse that actual lifetime
 // owner instead of adding a redundant eleventh Page close listener.
 if(owner.signal)owner.signal.addEventListener('abort',dispose,{once:true});else page.once?.('close',dispose);
 if(owner.signal?.aborted||page.closed)dispose();
}

export function initializeModelContextSession(session){
 const registry=registryFor(session.page),record=state({session,registry,enabled:false});sessions.set(session,record);registry.subscriptions.add(record);
}
export function closeModelContextSession(session){const record=sessions.get(session);if(record){record.enabled=false;record.registry.subscriptions.delete(record);sessions.delete(session)}}
export function runModelContextCDP(session,method,params,ProtocolError){
 const record=sessions.get(session),registry=record.registry;
 if(method==='WebMCP.enable'){
  record.enabled=true;session.domains.add('WebMCP');const tools=[];
  for(const owner of registry.owners)if(live(owner))for(const tool of owner.tools.values())tools.push(toolMetadata(tool));
  if(tools.length)session.event('WebMCP.toolsAdded',{tools});return {};
 }
 if(method==='WebMCP.disable'){record.enabled=false;session.domains.delete('WebMCP');return {}}
 if(method==='WebMCP.cancelInvocation'){
  const job=registry.invocations.get(params.invocationId);if(job)cancelInvocation(job);return {};
 }
 if(method!=='WebMCP.invokeTool')throw new ProtocolError(`'${method}' wasn't found`,-32601);
 const frame=session.page.frameId===params.frameId?session.page:session.page.frames?.findFrame(params.frameId);
 if(!frame||frame.closed||frame.retired)throw new ProtocolError('FrameNotFound',-31998);
 const owner=[...registry.owners].find(value=>live(value)&&value.page===frame),tool=owner?.tools.get(params.toolName);
 if(!tool)throw new ProtocolError('NotFound',-31998);
 const id='INV-'+String(++registry.nextInvocation).padStart(10,'0'),job=state({owner,tool,id,active:true,result:null});
 registry.invocations.set(id,job);owner.invocations.add(job);
 let asynchronous=false;
 try{
  const inputJSON=JSON.stringify(params.input??{}),input=owner.invocation.invoke(owner.parse,owner.JSON,[inputJSON],owner.options);
  const client=apply(owner.create,undefined,[owner.clientPrototype]);
  notify(registry,'WebMCP.toolInvoked',{toolName:tool.name,frameId:owner.page.frameId,invocationId:id,input:inputJSON});
  let returned;
  try{returned=owner.invocation.invoke(tool.execute,owner.window,[input,client],owner.options)}catch(error){respond(job,'throw',error);return {invocationId:id}}
  if(!types.isPromise(returned)){
   // Serialize BEFORE crossing any async command boundary. In particular an
   // ordinary author thenable must never be adopted by a Host async function.
   respond(job,'value',returned);return {invocationId:id};
  }
  job.result=returned;
  owner.invocation.invoke(owner.runtime.consumeObservedPromise,undefined,[returned,sourceAnchor(owner,returned)],owner.options);
  owner.pending.add(job);asynchronous=true;
  schedulePendingTurn(owner);return {invocationId:id};
 }finally{if(!asynchronous&&job.active)cleanupInvocation(job)}
}
