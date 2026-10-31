import 'jsdom';
import {createRequire} from 'node:module';
import {types} from 'node:util';
import {platformFactoryRecord} from './platform-factories.js';
import {getLayoutStyle,getSpecifiedStyle} from './styles.js';
import {layoutForDocument} from './layout.js';
import {resolveFlowLength} from './flow-metrics.js';
import {selectedText,measureSelectedText} from './range-text.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const RangeImpl=require('jsdom/lib/jsdom/living/range/Range-impl.js').implementation;
const Rect=require('jsdom/lib/jsdom/living/generated/DOMRect.js');
const {domSymbolTree:tree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const {nodeLength,nodeRoot}=require('jsdom/lib/jsdom/living/helpers/node.js');
const {compareBoundaryPointsPosition:compare}=require('jsdom/lib/jsdom/living/range/boundary-point.js');
const INSTALLED=new WeakSet(),ZERO=Object.freeze({x:0,y:0,width:0,height:0});
const hiddenTags=new Set(['head','style','script','template','meta','link','title','base']);
const wrapper=utils.wrapperForImpl;
function parent(node){return node._assignedSlot??tree.parent(node)??node.host??null;}
function elementParent(node){for(let value=parent(node);value;value=parent(value))if(value.nodeType===1)return value;return null;}
function style(node){return getLayoutStyle(wrapper(node))??{display:'inline',position:'static',float:'none',fontSize:'16px',whiteSpace:'normal'};}
function hidden(node){for(let p=node;p;p=parent(p)){if(p.nodeType===1&&(hiddenTags.has(p.localName)||style(p).display==='none'))return true;const ordinary=tree.parent(p);if(ordinary?.nodeType===1&&!p._assignedSlot&&(ordinary._shadowRoot||ordinary.localName==='slot'&&ordinary._assignedNodes?.length))return true;}return false;}
function documentFor(node){return node.nodeType===9?node:node._ownerDocument;}
function modelFor(node){return layoutForDocument(documentFor(node));}
function elementBox(node){const model=modelFor(node);return model?model.rect(wrapper(node)):ZERO;}
function textGeometry(context,text){
 if(hidden(context))return null;
 const element=context.nodeType===1?context:elementParent(context),declaration=element?style(element):{fontSize:'16px',whiteSpace:'normal'};
 let anchor=element;while(anchor&&style(anchor).display==='contents')anchor=elementParent(anchor);
 const box=anchor?elementBox(anchor):ZERO;
 let container=element;
 for(;container;container=elementParent(container)){
  const own=style(container),p=elementParent(container),item=p&&['flex','inline-flex','grid','inline-grid'].includes(style(p).display);
  if(own.display!=='contents'&&(own.display!=='inline'||own.float&&own.float!=='none'||['absolute','fixed'].includes(own.position)||item))break;
 }
 const model=modelFor(context),viewport=model?.viewport??{width:1920,height:1080},own=container?style(container):null;
 const resolved=own?resolveFlowLength(own.width,viewport,container?elementBox(container).width:undefined):undefined;
 const width=resolved??(container?elementBox(container).width:Infinity);
 const fontSize=Number.parseFloat(declaration.fontSize);const collapse=element?getSpecifiedStyle(wrapper(element),'white-space-collapse'):undefined;
 const measured=measureSelectedText(text,{fontSize:Number.isFinite(fontSize)?fontSize:16,width:whiteSpaceWidth(width),whiteSpace:declaration.whiteSpace,collapse:typeof collapse==='object'?collapse.value:collapse,nowrap:declaration.textWrap==='nowrap'||declaration.textWrapMode==='nowrap'});
 return measured?{x:box.x,y:box.y,...measured}:null;
}
function whiteSpaceWidth(width){return Number.isFinite(width)&&width>0?width:Infinity;}
function textSlice(range,node){
 const start=node===range._start.node?range._start.offset:0,end=node===range._end.node?range._end.offset:nodeLength(node);
 return selectedText(node.data,start,end);
}
function intersects(range,node){return compare(range._start,{node,offset:nodeLength(node)})<0&&compare(range._end,{node,offset:0})>0;}
function selected(range,node){const p=tree.parent(node);if(!p)return false;const index=tree.index(node);return compare(range._start,{node:p,offset:index})<=0&&compare(range._end,{node:p,offset:index+1})>=0;}
function clientFragments(range){
 if(range.collapsed)return[];const root=range.commonAncestorContainer,values=[];
 for(const node of tree.treeIterator(root)){
  if(hidden(node))continue;
  if(node.nodeType===1&&selected(range,node)&&!selected(range,tree.parent(node))){values.push(elementBox(node));}
  else if(node.nodeType===3&&intersects(range,node)){const rect=textGeometry(node,textSlice(range,node));if(rect)values.push(rect);}
 }
 return values;
}
function bounding(range){
 if(range.collapsed)return ZERO;
 const common=range.commonAncestorContainer;
 if(common.nodeType===3)return textGeometry(common,textSlice(range,common))??ZERO;
 let content=false;for(const node of tree.treeIterator(common))if(node.nodeType===1&&selected(range,node)||node.nodeType===3&&intersects(range,node)&&textSlice(range,node)){content=true;break;}if(!content)return ZERO;
 const children=Array.from(tree.childrenIterator(common));
 if(!children.some(node=>node.nodeType===1)){
  let text='';for(const node of children)if(node.nodeType===3&&intersects(range,node))text+=textSlice(range,node);
  return textGeometry(common,text)??ZERO;
 }
 // Native's measured non-text branch is the actual current common-ancestor
 // box. It intentionally differs from the separately computed client fragments.
 let box=common;if(box.nodeType===11)box=box.host;if(box?.nodeType===9)box=box.documentElement;
 return box?.nodeType===1?elementBox(box):ZERO;
}
function factory(g,bridge){
 const TypeError=g.TypeError,Error=g.Error,ArrayConstructor=g.Array,set=g.Reflect.set,define=g.Object.defineProperty,brand=value=>{if(!bridge.valid(value))throw new TypeError('Illegal invocation')};
 for(const name of['setStart','setEnd','setStartBefore','setStartAfter','setEndBefore','setEndAfter','selectNode','selectNodeContents','insertNode','surroundContents','isPointInRange','comparePoint','intersectsNode']){const original=g.Range.prototype[name];if(typeof original!=='function')continue;const method=({[name](...args){brand(this);if(!args.length||!bridge.node(args[0]))throw new TypeError('invalid argument');return bridge.apply(original,this,args)}})[name];define(method,'length',{value:original.length,configurable:true});define(g.Range.prototype,name,{value:method,writable:true,enumerable:true,configurable:true});}
 const methods={getBoundingClientRect(){brand(this);return bridge.rect(bridge.bounding(this))},getClientRects(){brand(this);const values=bridge.fragments(this),result=new ArrayConstructor(values.length);try{for(let i=0;i<values.length;i++)set(result,i,bridge.rect(values[i]));}catch{throw new Error('FailedToCreateArray')}return result;}};
 for(const[name,value]of g.Object.entries(methods))define(g.Range.prototype,name,{value,writable:true,enumerable:true,configurable:true});
}
function bridge(global,createRect=value=>Rect.create(global,[value.x,value.y,value.width,value.height])){const implementation=value=>{if(types.isProxy(value))return null;const state=platformFactoryRecord(value)?.implementation;return state instanceof RangeImpl?state:null;};return{apply:Reflect.apply,node:value=>!types.isProxy(value)&&platformFactoryRecord(value)?.implementation instanceof NodeImpl,valid:value=>!!implementation(value),bounding:value=>bounding(implementation(value)),fragments:value=>clientFragments(implementation(value)),rect:createRect};}
export function installRangeGeometry(page,window){if(INSTALLED.has(window))return;window.eval(`(${factory.toString()})`)(window,bridge(utils.implForWrapper(window.document)._globalObject));INSTALLED.add(window);}
export function installUtilityRangeGeometry(controller){if(INSTALLED.has(controller.global))return;controller.evaluate(`(${factory.toString()})`)(controller.global,bridge(controller.global,value=>controller.createDOMRect(value)));INSTALLED.add(controller.global);}
