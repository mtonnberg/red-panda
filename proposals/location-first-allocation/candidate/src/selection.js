import 'jsdom';
import {createRequire} from 'node:module';
import {types} from 'node:util';
import {platformFactoryRecord} from './platform-factories.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const Event=require('jsdom/lib/jsdom/living/generated/Event.js');
const NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const RangeImpl=require('jsdom/lib/jsdom/living/range/Range-impl.js').implementation;
const SelectionImpl=require('jsdom/lib/jsdom/living/selection/Selection-impl.js').implementation;
const {domSymbolTree:tree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const {nodeRoot,nodeLength}=require('jsdom/lib/jsdom/living/helpers/node.js');
const {compareBoundaryPointsPosition:compare}=require('jsdom/lib/jsdom/living/range/boundary-point.js');
const INSTALLED=new WeakMap(),GLOBALS=new WeakMap(),UTILITY_INSTALLED=new WeakSet();let patched=false;
function recordFor(selection){return GLOBALS.get(selection._globalObject)}
function emit(selection){const record=recordFor(selection);if(!record||record.disposed)return;const event=Event.createImpl(record.global,['selectionchange',{bubbles:false,cancelable:false}]);record.document._dispatch(event);}
function patch(){
 if(patched)return;patched=true;const proto=SelectionImpl.prototype;
 for(const key of['_anchor','_focus']){const descriptor=Object.getOwnPropertyDescriptor(proto,key);Object.defineProperty(proto,key,{...descriptor,get(){if(!recordFor(this))return descriptor.get.call(this);if(!this._range)return null;const backwards=this._direction===-1;return this._range[(key==='_anchor')!==backwards?'_start':'_end'];}})}
 const associate=proto._associateRange;
 proto._associateRange=function(range){if(!recordFor(this))return associate.call(this,range);this._range=range;this._direction=range===null?0:1;};
 for(const name of['addRange','removeRange','removeAllRanges','collapse','collapseToStart','collapseToEnd','extend','setBaseAndExtent','selectAllChildren','deleteFromDocument']){
  const original=proto[name];proto[name]=function(...args){
   if(!recordFor(this))return original.apply(this,args);
   // collapse(null) delegates to removeAllRanges, which owns that association.
   if(name==='collapse'&&args[0]===null)return original.apply(this,args);
   const before=this._range,result=original.apply(this,args),changed=before!==this._range;
   if(changed){if(name==='addRange'||name==='collapse'||name==='collapseToStart'||name==='collapseToEnd')this._direction=0;else if((name==='extend'||name==='setBaseAndExtent')&&this._range?.collapsed)this._direction=0;}
   if(changed||(name==='deleteFromDocument'&&before))emit(this);
   return result;
  };
 }
 const contains=proto.containsNode;
 proto.containsNode=function(node,partial){
  if(!recordFor(this)||!partial)return contains.call(this,node,partial);
  if(!this._range||nodeRoot(node)!==nodeRoot(this._range._start.node))return false;
  const parent=tree.parent(node);if(!parent)return true;
  const index=tree.index(node),before={node:parent,offset:index},after={node:parent,offset:index+1};
  return compare(this._range._start,after)<0&&compare(this._range._end,before)>0;
 };
}
function nextText(node){for(let current=tree.following(node,{skipChildren:true});current;current=tree.following(current))if(current.nodeType===3)return current;return null;}
function previousText(node){for(let current=tree.preceding(node);current;current=tree.preceding(current))if(current.nodeType===3)return current;return null;}
function firstText(node){for(const current of tree.treeIterator(node))if(current.nodeType===3)return current;return null;}
function lastText(node){for(const current of tree.treeIterator(node,{reverse:true}))if(current.nodeType===3)return current;return null;}
const word=code=>code>=48&&code<=57||code>=65&&code<=90||code>=97&&code<=122||code===95;
function wordOffset(text,offset,forward){
 if(forward){while(offset<text.length&&!word(text.charCodeAt(offset)))offset++;while(offset<text.length&&word(text.charCodeAt(offset)))offset++;}
 else{while(offset>0&&!word(text.charCodeAt(offset-1)))offset--;while(offset>0&&word(text.charCodeAt(offset-1)))offset--;}
 return offset;
}
function move(selection,alteration,direction,granularity,document){
 if((alteration!=='move'&&alteration!=='extend')||!['forward','backward','left','right'].includes(direction)||!['character','word'].includes(granularity)||!selection._range)return;
 if(alteration==='extend'&&nodeRoot(selection._focus.node)!==document)return;
 const forward=direction==='forward'||direction==='right',focus=selection._focus;let node=focus.node,offset=focus.offset;
 if(node.nodeType===3){
  if(forward?offset<nodeLength(node):offset>0)offset=granularity==='word'?wordOffset(node.data,offset,forward):offset+(forward?1:-1);
  else{const adjacent=forward?nextText(node):previousText(node);if(adjacent){node=adjacent;offset=forward?0:nodeLength(node);if(granularity==='word')offset=wordOffset(node.data,offset,forward);}}
 }else if(forward){
  const child=tree.childrenToArray(node)[offset];let target=child?firstText(child):null;if(child&&!target)target=nextText(child);
  if(target){node=target;offset=granularity==='word'?wordOffset(node.data,0,true):0;}
  else{target=nextText(node);if(target){node=target;offset=granularity==='word'?wordOffset(node.data,0,true):Math.min(1,nodeLength(node));}}
 }else{
  const child=tree.childrenToArray(node)[offset-1],target=child?lastText(child):null;
  if(target){node=target;offset=granularity==='word'?wordOffset(node.data,nodeLength(node),false):nodeLength(node);}
 }
 if(alteration==='move')selection.collapse(node,offset);else selection.extend(node,offset);
}
function factory(g,bridge){
 const TypeError=g.TypeError,apply=g.Reflect.apply,define=g.Object.defineProperty,own=g.Object.getOwnPropertyDescriptor,String=g.String;
 const Number=g.Number,finite=Number.isFinite,trunc=g.Math.trunc,Exception=g.DOMException;
 const description=own(g.Symbol.prototype,'description').get,primitive=g.Symbol.toPrimitive;
 const isObject=value=>value!==null&&(typeof value==='object'||typeof value==='function');
 function string(value){if(isObject(value)){const convert=value[primitive];if(convert!=null){if(typeof convert!=='function')throw new TypeError('invalid argument');value=apply(convert,value,['string']);if(isObject(value))throw new TypeError('invalid argument');}else{let done=false;for(const name of['toString','valueOf']){const fn=value[name];if(typeof fn==='function'){const next=apply(fn,value,[]);if(!isObject(next)){value=next;done=true;break}}}if(!done)throw new TypeError('invalid argument')}}return String(typeof value==='symbol'?apply(description,value,[]):value)}
 const p=g.Selection.prototype,brand=value=>{if(!bridge.valid(value))throw new TypeError('Illegal invocation')};
 function Selection(){throw new TypeError('Illegal Constructor')}
 define(Selection,'prototype',{value:p,writable:false});define(p,'constructor',{value:Selection,writable:true,configurable:true});define(g,'Selection',{value:Selection,writable:true,configurable:true});
 for(const[name,required,length]of[['addRange',1,1],['collapse',0,0],['collapseToEnd',0,0],['collapseToStart',0,0],['containsNode',2,2],['deleteFromDocument',0,0],['empty',0,0],['extend',1,1],['getRangeAt',1,1],['removeAllRanges',0,0],['removeRange',1,1],['selectAllChildren',1,1],['setBaseAndExtent',4,4],['setPosition',0,0],['toString',0,0]]){
  const descriptor=own(p,name),original=descriptor.value;
  const fn=({[name](...args){brand(this);if(args.length<required)throw new TypeError('invalid argument');if(name==='collapse'||name==='setPosition'){if(args[0]==null)args[0]=null;else if(!bridge.argument(args[0],'Node'))throw new TypeError('invalid argument')}else if(name==='addRange'||name==='removeRange'){if(!bridge.argument(args[0],'Range'))throw new TypeError('invalid argument')}else if(name==='extend'||name==='containsNode'||name==='selectAllChildren'){if(!bridge.argument(args[0],'Node'))throw new TypeError('invalid argument')}else if(name==='setBaseAndExtent'){if(!bridge.argument(args[0],'Node')||!bridge.argument(args[2],'Node'))throw new TypeError('invalid argument')}if((name==='collapse'||name==='setPosition'||name==='extend')&&args[0]!=null&&!bridge.inDocument(args[0])){if(typeof args[1]==='bigint')throw new TypeError('invalid argument');const n=Number(args[1]),offset=finite(n)?trunc(n)>>>0:0;if(offset>bridge.length(args[0]))throw new Exception('Index or size is negative or greater than the allowed amount','IndexSizeError');return}return apply(original,this,args)}})[name];define(fn,'length',{value:length,configurable:true});define(p,name,{...descriptor,value:fn});
 }
 for(const name of['anchorNode','anchorOffset','focusNode','focusOffset','isCollapsed','rangeCount','type']){
  const descriptor=own(p,name),getter=({get [name](){brand(this);return apply(descriptor.get,this,[])}});define(p,name,{...descriptor,get:own(getter,name).get});
 }
 const extra={get direction(){brand(this);return bridge.direction(this)},modify(alteration,direction,granularity){brand(this);if(arguments.length<3)throw new TypeError('invalid argument');bridge.modify(this,string(alteration),string(direction),string(granularity))}};
 for(const name of['direction','modify'])define(p,name,{...own(extra,name),enumerable:true,configurable:true});
 if(typeof g.getSelection!=='function'){const document=g.document,get= document.getSelection;const getSelection=function getSelection(){return apply(get,document,[])};define(g,'getSelection',{value:getSelection,writable:true,enumerable:true,configurable:true});}
}
export function installSelection(page,window){
 if(INSTALLED.has(window))return INSTALLED.get(window).controller;patch();
 const record={document:utils.implForWrapper(window.document),global:utils.implForWrapper(window.document)._globalObject,disposed:false};GLOBALS.set(record.document._globalObject,record);
 window.eval(`(${factory.toString()})`)(window,bridgeFor(record));
 const dispose=()=>{record.disposed=true;page.documentAbort?.signal.removeEventListener('abort',dispose)};page.documentAbort?.signal.addEventListener('abort',dispose,{once:true});record.controller={dispose};INSTALLED.set(window,record);return record.controller;
}

function bridgeFor(record){
 const implementation=value=>{if(types.isProxy(value))return null;const impl=platformFactoryRecord(value)?.implementation;return impl instanceof SelectionImpl?impl:null;};
 return {valid:value=>!!implementation(value),argument:(value,kind)=>!types.isProxy(value)&&platformFactoryRecord(value)?.implementation instanceof (kind==='Node'?NodeImpl:RangeImpl),inDocument:value=>nodeRoot(platformFactoryRecord(value).implementation)===record.document,length:value=>nodeLength(platformFactoryRecord(value).implementation),direction:value=>{const selection=implementation(value);return selection._direction===1?'forward':selection._direction===-1?'backward':'none'},modify:(value,alteration,direction,granularity)=>move(implementation(value),alteration,direction,granularity,record.document)};
}
export function installUtilitySelection(controller,mainWindow){
 if(UTILITY_INSTALLED.has(controller.global))return;const record=INSTALLED.get(mainWindow);if(!record)return;controller.evaluate(`(${factory.toString()})`)(controller.global,bridgeFor(record));UTILITY_INSTALLED.add(controller.global);
}
