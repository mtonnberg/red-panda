// Shared real DataTransfer state. Only public definitions/results are allocated
// in the selected VM; private stores, item records and Proxy traps stay Host.
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {types} from 'node:util';
import {implementationForWrapper} from './dom-event-state.js';
import {platformFactoryRecord} from './platform-factories.js';
import {createUtilityFileListProducer,fileWrapperImplementation,originalFileAPIPrototype} from './file-wrapper-realms.js';
import {captureWindowTaskOwner} from './window-lifecycle-timers.js';
import {getRuntimeBinding} from './native-runtime.js';
import {installBlobReads} from './blob.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const conversions=require('webidl-conversions');
const File=require('jsdom/lib/jsdom/living/generated/File.js'),FileList=require('jsdom/lib/jsdom/living/generated/FileList.js');
const Element=require('jsdom/lib/jsdom/living/generated/Element.js'),ElementImpl=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation;
const records=new WeakMap(),transfers=new WeakMap(),items=new WeakMap(),itemLists=new WeakMap();
const apply=Reflect.apply,own=Object.getOwnPropertyDescriptor,define=Object.defineProperty,setPrototype=Object.setPrototypeOf,hasInstance=Function.prototype[Symbol.hasInstance];
export const isDataTransfer=value=>transfers.has(value);
function definitions(bridge){
 const iteratorSymbol=bridge.iteratorSymbol;
 class DataTransferItem{
  constructor(){bridge.illegal()}
  get kind(){return bridge.item(this,'kind')}
  get type(){return bridge.item(this,'type')}
  getAsFile(){return bridge.itemFile(this)}
  getAsString(callback){return bridge.itemString(this,callback)}
 }
 class DataTransferItemList{
  constructor(){bridge.illegal()}
  get length(){return bridge.length(this)}
  add(data,type){return bridge.add(this,arguments.length,data,type)}
  remove(at){return bridge.remove(this,arguments.length,at)}
  clear(){return bridge.clearItems(this)}
  [iteratorSymbol](){const state=bridge.iterator(this);return{next(){return bridge.next(state)},[iteratorSymbol](){return this}}}
 }
 class DataTransfer{
  constructor(){bridge.create(this)}
  get items(){return bridge.transfer(this,'list')}
  get files(){return bridge.transfer(this,'files')}
  get types(){return bridge.types(this)}
  get dropEffect(){return bridge.transfer(this,'dropEffect')}
  set dropEffect(value){bridge.effect(this,'dropEffect',value)}
  get effectAllowed(){return bridge.transfer(this,'effectAllowed')}
  set effectAllowed(value){bridge.effect(this,'effectAllowed',value)}
  getData(format){return bridge.getData(this,arguments.length,format)}
  setData(format,data){return bridge.setData(this,arguments.length,format,data)}
  clearData(format){return bridge.clearData(this,arguments.length,format)}
  setDragImage(element,x,y){return bridge.dragImage(this,arguments.length,element,x,y)}
 }
 bridge.publish(DataTransfer,DataTransferItem,DataTransferItemList);
}
function plain(record,prototype=record.objectPrototype){return setPrototype(Reflect.construct(record.Object,[]),prototype)}
function result(record,done,value){const object=plain(record);define(object,'done',{value:done,writable:true,enumerable:true,configurable:true});if(!done)define(object,'value',{value,writable:true,enumerable:true,configurable:true});return object}
function indexed(record,state){
 const target=plain(record,record.ItemList.prototype),index=key=>typeof key==='string'&&/^(?:0|[1-9]\d*)$/.test(key)&&Number(key)<4294967295;
 const handler={
  get(target,key,receiver){return index(key)?state.values[Number(key)]:Reflect.get(target,key,receiver)},
  has(target,key){return index(key)?Number(key)<state.values.length:Reflect.has(target,key)},
  ownKeys(target){return [...state.values.map((_,i)=>String(i)),...Reflect.ownKeys(target)]},
  getOwnPropertyDescriptor(target,key){if(index(key)&&Number(key)<state.values.length)return{value:state.values[Number(key)],writable:false,enumerable:true,configurable:true};return Reflect.getOwnPropertyDescriptor(target,key)},
  set(target,key,value,receiver){return index(key)||key==='length'?false:Reflect.set(target,key,value,receiver)},
  defineProperty(target,key,descriptor){return index(key)?false:Reflect.defineProperty(target,key,descriptor)},
  deleteProperty(target,key){return index(key)&&Number(key)<state.values.length?false:Reflect.deleteProperty(target,key)},
  preventExtensions(){return false},
 };
 const value=Reflect.construct(record.Proxy,[target,handler]);itemLists.set(value,state);return value;
}
function install(page,globalObject,context,{utility=false}={}){
 if(records.has(globalObject))return records.get(globalObject);
 const selected=vm.isContext(context),intrinsic=name=>selected?vm.runInContext(name,context):globalThis[name];
 const record=Object.assign(Object.create(null),{page,global:globalObject,context,utility,Object:intrinsic('Object'),Proxy:intrinsic('Proxy'),Array:intrinsic('Array'),TypeError:intrinsic('TypeError'),sourceTimer:globalObject.setTimeout,taskOwner:null});
 record.objectPrototype=own(record.Object,'prototype').value;record.ArrayFrom=selected?vm.runInContext('Array.from',context):Array.from;
 const createList=selected?createUtilityFileListProducer(context,globalObject,{allowLegacy:!page?.browser}):()=>FileList.create(globalObject,[],{});
 const error=()=>new record.TypeError('invalid argument'),brand=(map,value)=>{const state=map.get(value);if(!state)throw new record.TypeError('Illegal invocation');return state};
 const text=value=>{if(typeof value==='symbol')throw error();return String(value)},normalize=value=>{const raw=text(value).replace(/[A-Z]/g,x=>x.toLowerCase());return raw==='text'?'text/plain':raw==='url'?'text/uri-list':raw};
 const makeItem=state=>{const value=plain(record,record.Item.prototype);items.set(value,state);return value};
 const update=state=>{const list=fileWrapperImplementation(state.files)??utils.implForWrapper(state.files);list.length=0;for(const item of state.values){const value=items.get(item);if(value.kind==='file')list.push(fileWrapperImplementation(value.file)??utils.implForWrapper(value.file))}};
 const isElement=value=>{if(!page?.browser)return Element.is(value);const implementation=platformFactoryRecord(value)?.implementation;return !types.isProxy(implementation)&&apply(hasInstance,ElementImpl,[implementation])};
 const enqueue=(callback,value)=>{
  if(!utility&&page?.browser){try{record.taskOwner??=captureWindowTaskOwner(page,globalObject);return record.taskOwner.schedule(()=>callback(value),0)}catch(error){if(record.taskOwner)throw error}}
  return apply(record.sourceTimer,globalObject,[()=>callback(value),0]);
 };
 const bridge={
  iteratorSymbol:Symbol.iterator,
  illegal(){throw new record.TypeError('Illegal Constructor')},
  publish(Transfer,Item,ItemList){
   record.Transfer=Transfer;record.Item=Item;record.ItemList=ItemList;
   for(const[name,Constructor]of[['DataTransferItem',Item],['DataTransferItemList',ItemList],['DataTransfer',Transfer]]){
    define(Constructor.prototype,Symbol.toStringTag,{value:name,configurable:true});
    for(const key of Object.getOwnPropertyNames(Constructor.prototype)){if(key==='constructor')continue;const descriptor=own(Constructor.prototype,key);define(Constructor.prototype,key,{...descriptor,enumerable:true})}
    define(globalObject,name,{value:Constructor,writable:true,configurable:true,enumerable:false});
   }
  },
  create(receiver){const state=Object.assign(Object.create(null),{values:[],files:createList(),dropEffect:'none',effectAllowed:'none'});state.list=indexed(record,state);transfers.set(receiver,state)},
  transfer(receiver,key){return brand(transfers,receiver)[key]},
  item(receiver,key){return brand(items,receiver)[key]},
  itemFile(receiver){const state=brand(items,receiver);return state.kind==='file'?state.file:null},
  itemString(receiver,callback){const state=brand(items,receiver);if(callback==null)return;if(typeof callback!=='function')throw error();if(state.kind==='string')enqueue(callback,state.data)},
  length(receiver){return brand(itemLists,receiver).values.length},
  add(receiver,count,data,type){const state=brand(itemLists,receiver);let item;if(File.is(data))item=makeItem(Object.assign(Object.create(null),{kind:'file',type:fileWrapperImplementation(data)?.type??utils.implForWrapper(data).type,file:data}));else{if(count<2)throw error();item=makeItem(Object.assign(Object.create(null),{kind:'string',type:normalize(type),data:text(data)}))}state.values.push(item);update(state);return item},
  remove(receiver,count,at){if(!count)throw error();const state=brand(itemLists,receiver);state.values.splice(conversions['unsigned long'](at,{globals:{TypeError:record.TypeError}}),1);update(state)},
  clearItems(receiver){const state=brand(itemLists,receiver);state.values.length=0;update(state)},
  iterator(receiver){return Object.assign(Object.create(null),{state:brand(itemLists,receiver),index:0})},
  next(iterator){const done=iterator.index>=iterator.state.values.length;return result(record,done,done?undefined:iterator.state.values[iterator.index++])},
  types(receiver){const state=brand(transfers,receiver),values=state.values.filter(item=>items.get(item).kind==='string').map(item=>items.get(item).type);if(state.values.some(item=>items.get(item).kind==='file'))values.push('Files');return apply(record.ArrayFrom,record.Array,[values])},
  effect(receiver,key,value){const state=brand(transfers,receiver);value=text(value);if((key==='dropEffect'?['none','copy','link','move']:['none','copy','copyLink','copyMove','link','linkMove','move','all','uninitialized']).includes(value))state[key]=value},
  getData(receiver,count,format){if(!count)throw error();const state=brand(transfers,receiver),raw=text(format),type=normalize(raw),item=state.values.find(item=>{const entry=items.get(item);return entry.kind==='string'&&entry.type===type});let value=item?items.get(item).data:'';if(raw.toLowerCase()==='url')value=value.split(/\r\n|\r|\n/).find(line=>line&&!line.startsWith('#'))??'';return value},
  setData(receiver,count,format,data){if(count<2)throw error();const state=brand(transfers,receiver),type=normalize(format),value=text(data),item=state.values.find(item=>{const entry=items.get(item);return entry.kind==='string'&&entry.type===type});if(item)items.get(item).data=value;else state.values.push(makeItem(Object.assign(Object.create(null),{kind:'string',type,data:value})))},
  clearData(receiver,count,format){const state=brand(transfers,receiver),type=count?normalize(format):null;state.values=state.values.filter(item=>{const entry=items.get(item);return entry.kind!=='string'||type!==null&&entry.type!==type});update(state)},
  dragImage(receiver,count,element,x,y){const state=brand(transfers,receiver);if(count<3||!isElement(element))throw error();state.dragImage=Object.assign(Object.create(null),{element,x:conversions.long(x,{globals:{TypeError:record.TypeError}}),y:conversions.long(y,{globals:{TypeError:record.TypeError}})})},
 };
 if(selected)vm.compileFunction('('+definitions.toString()+')(bridge)',['bridge'],{parsingContext:context})(bridge);else definitions(bridge);
 records.set(globalObject,record);return record;
}
export function installDataTransfer(page,window){const record=install(page,window,implementationForWrapper(window)?._globalObject);return record.Transfer}
export function installUtilityDataTransfer(page,world){
 if(records.has(world.global))return records.get(world.global).Transfer;
 // The canonical utility File/Blob definitions and private brands are already
 // installed before any public transfer or FileList value is constructed.
 const Prototype=originalFileAPIPrototype(world.context,world.global,'Blob');
 installBlobReads(world.global,{prototype:Prototype});
 const binding=getRuntimeBinding(),anchor=vm.runInContext('Object.prototype',world.context);
 for(const name of['text','arrayBuffer','bytes','stream']){const descriptor=own(Prototype,name),operation=descriptor.value,value=binding.createEntry((_caller,receiver,args)=>apply(operation,receiver,args),anchor,name);define(value,'length',{value:operation.length,configurable:true});define(Prototype,name,{...descriptor,value})}
 return install(page,world.global,world.context,{utility:true}).Transfer;
}
