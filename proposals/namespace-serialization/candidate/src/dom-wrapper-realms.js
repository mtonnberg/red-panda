import {installEventIDLRealm,transformEventIDLInstall} from './event-idl-realms.js';
import {transformPrivateEventSource} from './dom-event-state.js';
import {registerDOMAllocationKind,domWrapperGlobal,recordDOMWrapperGlobal,selectDOMWrapperAllocation,noteDOMWrapperShell,finishDOMWrapperSetup,callDOMFactory} from './dom-factory-scope.js';
// Fresh Node/Event wrappers are allocated in their actual document VM. Generated
// setup/new retain their real implementation graph, brands and proxy traps.
import 'jsdom';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,join,basename} from 'node:path';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const interfaces=require('jsdom/lib/jsdom/living/interfaces.js');
const NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const EventImpl=require('jsdom/lib/jsdom/living/events/Event-impl.js').implementation;
const EventTargetImpl=require('jsdom/lib/jsdom/living/events/EventTarget-impl.js').implementation;
const realms=new WeakMap(),observers=new Map(),setPrototype=Object.setPrototypeOf,HostProxy=Proxy,hostCreate=Object.create;
let installed=false;
function realm(globalObject){
 const captured=realms.get(globalObject);if(captured)return captured;
 const context=vm.isContext(globalObject)?globalObject:utils.implForWrapper(globalObject)?._globalObject;
 if(!context||!vm.isContext(context))return null;
 let record=realms.get(context);
 if(!record){
  // Object.create(HostIDLPrototype) can select its Host V8 context. Genuine
  // construction by the captured VM Object retains the selected context.
  record=Object.assign(Object.create(null),{context,Object:vm.runInContext('Object',context),Proxy:vm.runInContext('Proxy',context)});
  realms.set(context,record);
 }
 return record;
}
// Called only by trusted creation of a fresh, non-retargeted utility VM. The
// Window implementation can belong to the shared main tree; it is not the
// allocation context of the actual utility global and its generated values.
export function captureDOMWrapperRealm(globalObject,context){
 if(!vm.isContext(context))throw new TypeError('An actual DOM wrapper VM is required');
 const record=realm(context),previous=realms.get(globalObject);
 if(previous&&previous!==record)throw new TypeError('DOM wrapper realm identity cannot be retargeted');
 realms.set(globalObject,record);
}
export function createDOMWrapperShell(globalObject,prototype,kind){
 const selection=selectDOMWrapperAllocation(globalObject,prototype,kind),record=realm(selection.globalObject);
 const value=record?setPrototype(Reflect.construct(record.Object,[]),selection.prototype):hostCreate(selection.prototype);
 return noteDOMWrapperShell(value,selection);
}
export function observeDOMWrapperProxy(kind,callback){
 if(typeof kind!=='string'||typeof callback!=='function')throw new TypeError('A generated kind and Host observer are required');
 let entries=observers.get(kind);if(!entries){entries=new Set();observers.set(kind,entries);}entries.add(callback);
 return ()=>{entries.delete(callback);if(!entries.size)observers.delete(kind);};
}
export function createDOMWrapperProxy(target,handler,globalObject,kind){
 for(const observe of observers.get(kind)??[])observe(target,handler,globalObject);
 const selected=domWrapperGlobal(target,globalObject),Constructor=realm(selected)?.Proxy??HostProxy;
 // This is the factory's original sole Proxy, with its same target and traps.
 return recordDOMWrapperGlobal(Reflect.construct(Constructor,[target,handler]),selected);
}
export function installDOMWrapperRealms(){
 if(installed)return;installed=true;
 const directory=dirname(require.resolve('jsdom/lib/jsdom/living/generated/utils.js'));
 const candidates=[];
 for(const filename of readdirSync(directory).sort()){
  if(!filename.endsWith('.js')||filename==='utils.js')continue;
  const full=join(directory,filename),factory=require(full),kind=basename(filename,'.js');
  if(typeof factory.setup!=='function'||interfaces.getInterfaceWrapper(kind)!==factory)continue;
  let Implementation;
  for(const folder of (kind==='Attr'||kind==='NamedNodeMap')?['attributes']:['nodes','events']){
   try{Implementation=require('jsdom/lib/jsdom/living/'+folder+'/'+kind+'-impl.js').implementation;break;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
  }
  if(!Implementation)continue;
  const node=Implementation===NodeImpl||Implementation.prototype instanceof NodeImpl,event=Implementation===EventImpl||Implementation.prototype instanceof EventImpl;
  if(kind!=='HTMLOptionsCollection'&&kind!=='HTMLFormControlsCollection'&&kind!=='NamedNodeMap'&&!node&&!event&&Implementation!==EventTargetImpl)continue;
  if(node||kind==='HTMLFormControlsCollection'||kind==='NamedNodeMap')registerDOMAllocationKind(kind);
  // Recompile the pinned independent generated source before any Window is
  // installed. The same CommonJS exports object and Host implementations stay
  // canonical. Only the three initial wrapper allocation expressions change.
  const originalSource=readFileSync(full,'utf8');let source=originalSource;
  const shell='return Object.create(proto);',proxy='return new Proxy(wrapper, proxyHandler);',constructor='exports.setup(Object.create(new.target.prototype),';
  if(source.split(shell).length!==2)throw new Error('Unexpected generated Node allocation source: '+kind);
  source=source.replace(shell,`return createShell(globalObject, proto, ${JSON.stringify(kind)});`);
  source=source.replaceAll(proxy,`return createProxy(wrapper, proxyHandler, globalObject, ${JSON.stringify(kind)});`);
  source=source.replaceAll(constructor,'exports.setup(createShell(globalObject, new.target.prototype),');
  if(kind==='Document'){
   for(const method of ['createElement','createElementNS','createTextNode','createComment','createAttribute','createAttributeNS']){
    const expression=`esValue[implSymbol].${method}(...args)`;
    if(source.split(expression).length!==2)throw new Error('Unexpected generated Document factory call: '+method);
    source=source.replace(expression,`callFactory(globalObject, esValue[implSymbol], ${JSON.stringify(method)}, args)`);
   }
   const expression='esValue[implSymbol].createDocumentFragment()';
   if(source.split(expression).length!==2)throw new Error('Unexpected generated DocumentFragment factory call');
   source=source.replace(expression,'callFactory(globalObject, esValue[implSymbol], "createDocumentFragment", [])');
  }
  if(kind==='HTMLFormElement'){
   const expression='return utils.getSameObject(this, "elements", () => {\n        return utils.tryWrapperForImpl(esValue[implSymbol]["elements"]);\n      });';
   if(source.split(expression).length!==2)throw new Error('Unexpected generated form.elements getter');
   source=source.replace(expression,'return utils.tryWrapperForImpl(callFactory(globalObject, esValue[implSymbol], "elements", []));');
  }
  if(event)source=transformPrivateEventSource(source,kind);
  if(event||Implementation===EventTargetImpl)source=transformEventIDLInstall(source,kind);
  candidates.push({factory,kind,full,originalSource,source});
 }
 const fingerprint=createHash('sha256').update(candidates.map(({kind,originalSource})=>kind+'\0'+createHash('sha256').update(originalSource).digest('hex')).join('\n')).digest('hex');
 if(require('jsdom/package.json').version!=='26.1.0'||fingerprint!=='f199523c2fb0570868c2e3aa84c9fd7b380687298db9b52f1d5531a3f561ae8f')throw new Error('Pinned jsdom DOM allocation source changed');
 for(const {factory,kind,full,source} of candidates){
  const module={exports:factory};
  vm.compileFunction(source,['exports','require','module','__filename','__dirname','createShell','createProxy','callFactory','installEventIDLRealm'],{filename:full})(factory,createRequire(full),module,full,directory,createDOMWrapperShell,createDOMWrapperProxy,callDOMFactory,installEventIDLRealm);
  if(module.exports!==factory)throw new Error('Generated Node factory identity changed: '+kind);
  const setup=factory.setup;
  factory.setup=function(wrapper,...args){try{return Reflect.apply(setup,this,[wrapper,...args]);}finally{finishDOMWrapperSetup(wrapper);}};
 }
}
