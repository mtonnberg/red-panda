import 'jsdom';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const{implForWrapper,wrapperForImpl}=require('jsdom/lib/jsdom/living/generated/utils.js');
const Node=require('jsdom/lib/jsdom/living/generated/Node.js');
const NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const ShadowRoot=require('jsdom/lib/jsdom/living/generated/ShadowRoot.js');
const ShadowImpl=require('jsdom/lib/jsdom/living/nodes/ShadowRoot-impl.js').implementation;
const Handler=require('jsdom/lib/jsdom/living/generated/EventHandlerNonNull.js');
const{setupForSimpleEventAccessors}=require('jsdom/lib/jsdom/living/helpers/create-event-accessor.js');
const{shadowIncludingInclusiveDescendantsIterator}=require('jsdom/lib/jsdom/living/helpers/shadow-dom.js');
const contexts=new WeakMap(),installed=new WeakMap();let patched=false;
const active=context=>context&&!context.signal?.aborted&&!context.page?.closed&&context.window.document===context.document;
function preserveMoves(parent,nodes,operation){if(!parent?.isConnected||!active(contexts.get(parent._globalObject)))return operation();const definitions=new Map();for(const node of nodes){if(!node?.isConnected||node._ownerDocument!==parent._ownerDocument)continue;for(const element of shadowIncludingInclusiveDescendantsIterator(node)){if(element._ceState!=='custom'||!element._ceDefinition||definitions.has(element))continue;const definition=element._ceDefinition;definitions.set(element,definition);element._ceDefinition={...definition,lifecycleCallbacks:{...definition.lifecycleCallbacks,connectedCallback:null,disconnectedCallback:null}};}}
 try{return operation();}finally{for(const[element,definition]of definitions)element._ceDefinition=definition;}}
function patch(){if(patched)return;patched=true;setupForSimpleEventAccessors(ShadowImpl.prototype,['slotchange']);for(const name of['_preInsert','_replace']){const method=NodeImpl.prototype[name];NodeImpl.prototype[name]=function(node,...args){return preserveMoves(this,[node],()=>method.call(this,node,...args));};}}
function factory(g,bridge){Object.defineProperty(g.ShadowRoot.prototype,'onslotchange',{configurable:true,enumerable:true,get(){return bridge.handler(this);},set(value){bridge.handler(this,typeof value==='function'?value:null,true);}});
 for(const Constructor of[g.Element,g.Document,g.DocumentFragment])for(const name of['append','prepend','replaceChildren']){const method=Constructor.prototype[name];if(typeof method!=='function')continue;Object.defineProperty(Constructor.prototype,name,{configurable:true,enumerable:true,writable:true,value:function(...args){return bridge.parentMove(this,args,()=>method.apply(this,args));}});}
 for(const Constructor of[g.Element,g.CharacterData,g.DocumentType])for(const name of['before','after','replaceWith']){const method=Constructor?.prototype[name];if(typeof method!=='function')continue;Object.defineProperty(Constructor.prototype,name,{configurable:true,enumerable:true,writable:true,value:function(...args){return bridge.siblingMove(this,args,()=>method.apply(this,args));}});}
}
export function installDOMLifecycle(page,window){if(installed.has(window))return installed.get(window);patch();const context={page,window,document:window.document,signal:page?.documentAbort?.signal};contexts.set(implForWrapper(window.document)._globalObject,context);
 const nodes=values=>values.filter(Node.is).map(implForWrapper);
 window.eval(`(${factory.toString()})`)(window,{parentMove(parent,args,operation){return Node.is(parent)?preserveMoves(implForWrapper(parent),nodes(args),operation):operation();},siblingMove(node,args,operation){return Node.is(node)?preserveMoves(implForWrapper(node).parentNode,nodes(args),operation):operation();},handler(root,value,set){if(!ShadowRoot.is(root))throw new window.TypeError('Illegal invocation');const impl=implForWrapper(root);if(set){impl.onslotchange=value===null?null:Handler.convert(window,value);return;}return impl.onslotchange?.objectReference??null;}});
 const controller={};installed.set(window,controller);return controller;}
