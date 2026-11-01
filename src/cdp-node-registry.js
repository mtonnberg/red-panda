// Host-private CDP identity and actual Document/generation ownership.
// Public fields, symbols, prototypes and Proxy forwarding never confer membership.
import 'jsdom';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {onFrameRetirement} from './frame-retirement-hooks.js';
import {platformFactoryRecord,subscribePlatformFactories} from './platform-factories.js';
const require=createRequire(import.meta.url);
const NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const apply=Reflect.apply,hasInstance=Function.prototype[Symbol.hasInstance];
const registries=new WeakMap(),documents=new WeakMap(),pages=new WeakMap(),realms=new WeakMap(),firstFronts=new WeakMap();
// Observe successful canonical setup before authors receive the first value.
// Utility aliases never replace it; mutable implementation symbols are unused.
subscribePlatformFactories((value,record)=>{const node=record.implementation;if(node&&apply(hasInstance,NodeImpl,[node])&&!firstFronts.has(node))firstFronts.set(node,value);});
export function cdpWrapperForNode(node){return firstFronts.get(node);}
export function canonicalNodeImplementation(value){
 const implementation=platformFactoryRecord(value)?.implementation;
 return implementation&&apply(hasInstance,NodeImpl,[implementation])?implementation:undefined;
}
const documentOf=node=>node.nodeType===9?node:node._ownerDocument;
function active(owner){return !!owner&&!owner.signal.aborted&&!owner.page.closed&&!owner.page.retired&&owner.page.documentGeneration===owner.generation;}
function registry(context){
 let record=registries.get(context);
 if(!record){record={context,next:1,byId:new Map(),ids:new WeakMap()};registries.set(context,record);}
 return record;
}
function erase(record,entry){record.byId.delete(entry.id);record.ids.delete(entry.node);entry.owner.ids.delete(entry.id);}
function reconcile(record,entry){
 const currentDocument=documentOf(entry.node),owner=documents.get(currentDocument)??realms.get(currentDocument?._globalObject);
 if(owner&&owner.context!==record.context){erase(record,entry);return undefined;}
 if(owner&&owner.context===record.context&&owner!==entry.owner&&active(owner)){
  entry.owner.ids.delete(entry.id);entry.owner=owner;owner.ids.add(entry.id);
 }
 if(!active(entry.owner)){erase(record,entry);return undefined;}
 return entry;
}
export function captureCDPDocument(page,window){
 // Trusted beforeParse call, before authored script/public entry publication.
 const document=canonicalNodeImplementation(window.document);
 if(!document||document.nodeType!==9)throw new TypeError('Actual owned Document factory is required');
 const previous=documents.get(document);if(previous){if(previous.page!==page)throw new TypeError('Document owner is immutable');return;}
 const owner={page,context:page.context,document,signal:page.documentAbort.signal,generation:page.documentGeneration,ids:new Set()};
 documents.set(document,owner);pages.set(page,owner);realms.set(document._globalObject,owner);
 const actualGlobal=platformFactoryRecord(window.document)?.globalRef?.deref();if(actualGlobal)realms.set(actualGlobal,owner);
 const record=registry(page.context);
 const retire=()=>{for(const id of [...owner.ids]){const entry=record.byId.get(id);if(entry)reconcile(record,entry);}};
 owner.signal.addEventListener('abort',retire,{once:true});onFrameRetirement(window,retire);
}
export function registerCDPNodeRealm(page,globalObject,context){
 if(!vm.isContext(context)||vm.runInContext('globalThis',context)!==globalObject)throw new TypeError('Actual selected VM/global pair is required');
 const owner=pages.get(page);if(!active(owner))throw new TypeError('Actual current Document owner is required');
 const previous=realms.get(globalObject);if(previous&&previous!==owner)throw new TypeError('Node allocation realm owner is immutable');
 realms.set(globalObject,owner);realms.set(context,owner);
}
export function cdpDocumentForPage(page){const owner=pages.get(page);return active(owner)&&owner.document._defaultView!==null?owner.document:undefined;}
export function cdpNodeOwner(node,context){
 if(!node||!apply(hasInstance,NodeImpl,[node]))return undefined;
 const owner=documents.get(documentOf(node));
 return active(owner)&&owner.context===context&&owner.document._defaultView!==null?owner:undefined;
}
export function registerCDPNode(context,value){
 const node=canonicalNodeImplementation(value);if(!node)throw new TypeError('A genuine registered DOM node is required');
 const document=documentOf(node),owner=documents.get(document)??realms.get(document?._globalObject);
 if(!active(owner)||owner.context!==context)throw new TypeError('DOM node belongs to a different or retired browser context');
 const record=registry(context),id=record.ids.get(node),previous=id===undefined?undefined:record.byId.get(id);
 if(previous&&reconcile(record,previous))return previous.id;
 if(record.next>4294967295)throw new RangeError('DOM node identifier overflow');
 const entry={id:record.next++,node,owner,wrapper:cdpWrapperForNode(node)};
 if(canonicalNodeImplementation(entry.wrapper)!==node)throw new TypeError('Canonical first DOM wrapper is required');
 record.byId.set(entry.id,entry);record.ids.set(node,entry.id);owner.ids.add(entry.id);return entry.id;
}
export function cdpNodeEntry(context,id){const record=registry(context),entry=record.byId.get(id);return entry?reconcile(record,entry):undefined;}
export function cdpNodeMap(context){
 // Existing protocol consumers keep their Map-like lookup contract. The only
 // allocator is registerCDPNode; session teardown cannot clear another session.
 const record=registry(context);
 function* entries(){for(const [id,entry]of record.byId)if(reconcile(record,entry))yield[id,entry.wrapper];}
 return Object.freeze({get:id=>cdpNodeEntry(context,id)?.wrapper,has:id=>!!cdpNodeEntry(context,id),entries,keys:function*(){for(const[id]of entries())yield id},values:function*(){for(const[,value]of entries())yield value},[Symbol.iterator]:entries,get size(){return Array.from(entries()).length}});
}
