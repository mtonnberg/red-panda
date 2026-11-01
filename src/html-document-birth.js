// Genuine public HTMLDocument definition and same-shell prototype choice at
// successful canonical Document factory birth. All controller state is Host.
import{ownedLocationCreationContext}from'./location-factory.js';
import{platformFactoryRecord}from'./platform-factories.js';
import{registerPlatformFactoryKind}from'./platform-factory-kinds.js';
const realms=new WeakMap(),fronts=new WeakSet();
const contextFor=globalObject=>ownedLocationCreationContext(globalObject);
export function enabled(globalObject){return contextFor(globalObject)!==null;}
export function remember(globalObject,Constructor){
 const context=contextFor(globalObject);if(!context)throw TypeError('A genuine initial HTMLDocument VM is required');
 const previous=realms.get(context);if(previous){if(previous.Constructor!==Constructor)throw TypeError('HTMLDocument realm cannot be retargeted');return;}
 realms.set(context,Object.assign(Object.create(null),{Constructor,prototype:Constructor.prototype,published:false}));
 registerPlatformFactoryKind('HTMLDocument');
}
export function initialize(value){
 const record=platformFactoryRecord(value),document=record?.implementation;
 if(!document||!['Document','HTMLDocument'].includes(record.kind))throw TypeError('An actual HTMLDocument constructor backend is required');
 document._parsingMode='html';document.contentType='text/html';
}
export function finishInterface(globalObject){
 const context=contextFor(globalObject),record=context&&realms.get(context);if(!record||record.published)return;
 // jsdom's original legacy installer aliases HTMLDocument back to Document
 // after all generated definitions. Restore the captured REAL interface once,
 // still inside trusted initial bootstrap and before its first factory value.
 Object.defineProperty(globalObject,'HTMLDocument',{value:record.Constructor,writable:true,configurable:true,enumerable:true});record.published=true;
}
export function constructorFor(globalObject){const context=contextFor(globalObject);return context?realms.get(context)?.Constructor:undefined;}
export function selectPrototype(globalObject,prototype,kind,privateData){
 if(kind!=='Document'||!privateData?.options)return prototype;
 // Preserve privileged raw XML factory calls: inactive XML public producers
 // choose the actual XMLDocument factory upstream, never a facade here.
 const options=privateData.options;
 if(options.parsingMode==='xml'&&!options.defaultView)return prototype;
 const context=contextFor(globalObject),record=context&&realms.get(context);if(!record)return prototype;
 finishInterface(globalObject);return record.prototype;
}
export function noteShell(value,globalObject,kind){
 if(kind!=='Document')return;
 const context=contextFor(globalObject),record=context&&realms.get(context);
 if(record&&Object.getPrototypeOf(value)===record.prototype)fronts.add(value);
}
export function hasFirstHTMLDocument(value){return fronts.has(value);}
