// Allocate fresh generated Node shells in the actual document VM before setup.
// No existing wrapper, implementation or public canonical identity is repaired.
import 'jsdom';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {readdirSync} from 'node:fs';
import {dirname,join,basename} from 'node:path';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const allocators=new WeakMap(),freshShells=new WeakSet(),prototypeOf=Object.getPrototypeOf,setPrototype=Object.setPrototypeOf;
let installed=false;
function allocator(globalObject){
 if(!vm.isContext(globalObject))return null;
 let allocate=allocators.get(globalObject);
 if(!allocate){
  // Object.create(foreignIDLPrototype) can inherit its Host V8 context. A real
  // literal keeps the selected context, including after prototype=null.
  allocate=vm.compileFunction('return {};',[],{parsingContext:globalObject});
  allocators.set(globalObject,allocate);
 }
 return allocate;
}
export function installDOMWrapperRealms(){
 if(installed)return;installed=true;
 const directory=dirname(require.resolve('jsdom/lib/jsdom/living/generated/utils.js'));
 for(const filename of readdirSync(directory)){
  if(!filename.endsWith('.js')||filename==='utils.js')continue;
  const factory=require(join(directory,filename)),kind=basename(filename,'.js');
  if(typeof factory.setup!=='function')continue;
  const interfaces=require('jsdom/lib/jsdom/living/interfaces.js');
  if(interfaces.getInterfaceWrapper(kind)!==factory)continue;
  let Implementation;
  try{Implementation=require('jsdom/lib/jsdom/living/nodes/'+kind+'-impl.js').implementation;}catch(error){if(error.code==='MODULE_NOT_FOUND')continue;throw error;}
  if(Implementation!==NodeImpl&&!(Implementation.prototype instanceof NodeImpl))continue;
  const setup=factory.setup,create=factory.create;
  if(typeof create==='function')factory.create=function(globalObject,...args){
   const allocate=allocator(globalObject);
   if(!allocate)return Reflect.apply(create,this,[globalObject,...args]);
   const wrapper=allocate();setPrototype(wrapper,globalObject[utils.ctorRegistrySymbol][kind].prototype);freshShells.add(wrapper);
   return factory.setup(wrapper,globalObject,...args);
  };
  factory.setup=function(wrapper,globalObject,...args){
   const allocate=allocator(globalObject);
   if(allocate&&!freshShells.has(wrapper)){
    // The generated caller's shell is unpublished and has no implementation.
    // Setup receives the exact VM literal that becomes the genuine wrapper.
    if(Object.hasOwn(wrapper,utils.implSymbol))throw new Error('Node setup received an existing implementation');
    const fresh=allocate();setPrototype(fresh,prototypeOf(wrapper));freshShells.add(fresh);wrapper=fresh;
   }
   return Reflect.apply(setup,this,[wrapper,globalObject,...args]);
  };
 }
}
