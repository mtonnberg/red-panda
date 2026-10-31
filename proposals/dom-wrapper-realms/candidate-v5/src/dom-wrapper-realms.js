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
 const context=vm.isContext(globalObject)?globalObject:utils.implForWrapper(globalObject)?._globalObject;
 if(!context||!vm.isContext(context))return null;
 let record=realms.get(context);
 if(!record){
  // Object.create(HostIDLPrototype) can select its Host V8 context. Genuine
  // construction by the captured VM Object retains the selected context.
  record=Object.assign(Object.create(null),{Object:vm.runInContext('Object',context),Proxy:vm.runInContext('Proxy',context)});
  realms.set(context,record);
 }
 return record;
}
export function createDOMWrapperShell(globalObject,prototype){
 const record=realm(globalObject);
 if(!record)return hostCreate(prototype);
 return setPrototype(Reflect.construct(record.Object,[]),prototype);
}
export function observeDOMWrapperProxy(kind,callback){
 if(typeof kind!=='string'||typeof callback!=='function')throw new TypeError('A generated kind and Host observer are required');
 let entries=observers.get(kind);if(!entries){entries=new Set();observers.set(kind,entries);}entries.add(callback);
 return ()=>{entries.delete(callback);if(!entries.size)observers.delete(kind);};
}
export function createDOMWrapperProxy(target,handler,globalObject,kind){
 for(const observe of observers.get(kind)??[])observe(target,handler,globalObject);
 const Constructor=realm(globalObject)?.Proxy??HostProxy;
 // This is the factory's original sole Proxy, with its same target and traps.
 return Reflect.construct(Constructor,[target,handler]);
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
  for(const folder of kind==='Attr'?['attributes']:['nodes','events']){
   try{Implementation=require('jsdom/lib/jsdom/living/'+folder+'/'+kind+'-impl.js').implementation;break;}catch(error){if(error.code!=='MODULE_NOT_FOUND')throw error;}
  }
  if(!Implementation)continue;
  const node=Implementation===NodeImpl||Implementation.prototype instanceof NodeImpl,event=Implementation===EventImpl||Implementation.prototype instanceof EventImpl;
  if(kind!=='HTMLOptionsCollection'&&!node&&!event&&Implementation!==EventTargetImpl)continue;
  // Recompile the pinned independent generated source before any Window is
  // installed. The same CommonJS exports object and Host implementations stay
  // canonical. Only the three initial wrapper allocation expressions change.
  const originalSource=readFileSync(full,'utf8');let source=originalSource;
  const shell='return Object.create(proto);',proxy='return new Proxy(wrapper, proxyHandler);',constructor='exports.setup(Object.create(new.target.prototype),';
  if(source.split(shell).length!==2)throw new Error('Unexpected generated Node allocation source: '+kind);
  source=source.replace(shell,'return createShell(globalObject, proto);');
  source=source.replaceAll(proxy,`return createProxy(wrapper, proxyHandler, globalObject, ${JSON.stringify(kind)});`);
  source=source.replaceAll(constructor,'exports.setup(createShell(globalObject, new.target.prototype),');
  candidates.push({factory,kind,full,originalSource,source});
 }
 const fingerprint=createHash('sha256').update(candidates.map(({kind,originalSource})=>kind+'\0'+createHash('sha256').update(originalSource).digest('hex')).join('\n')).digest('hex');
 if(require('jsdom/package.json').version!=='26.1.0'||fingerprint!=='5778ef2eeb41700ebaf12c621bc7009d1e15d38b611406e01693be050c8fe548')throw new Error('Pinned jsdom DOM allocation source changed');
 for(const {factory,kind,full,source} of candidates){
  const module={exports:factory};
  vm.compileFunction(source,['exports','require','module','__filename','__dirname','createShell','createProxy'],{filename:full})(factory,createRequire(full),module,full,directory,createDOMWrapperShell,createDOMWrapperProxy);
  if(module.exports!==factory)throw new Error('Generated Node factory identity changed: '+kind);
 }
}
