// Host-only read adapter over actual authenticated DOM implementations. It
// allocates no DOM clones/fronts and invokes no authored Node accessors.
import{createRequire}from'node:module';
import{platformFactoryRecord}from'./platform-factories.js';
import{formatMarkdown,DumpError}from'./dump.js';
const require=createRequire(import.meta.url),NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation,ElementImpl=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation,InputImpl=require('jsdom/lib/jsdom/living/nodes/HTMLInputElement-impl.js').implementation;
const{domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js'),childrenIterator=domSymbolTree.childrenIterator,parent=domSymbolTree.parent,treeIterator=domSymbolTree.treeIterator;
const descriptor=Object.getOwnPropertyDescriptor,apply=Reflect.apply,hasInstance=Function.prototype[Symbol.hasInstance],getAttribute=ElementImpl.prototype.getAttribute,hasAttribute=ElementImpl.prototype.hasAttribute,baseURI=descriptor(NodeImpl.prototype,'baseURI').get,textContent=descriptor(NodeImpl.prototype,'textContent').get,inputType=descriptor(InputImpl.prototype,'type').get,checked=descriptor(InputImpl.prototype,'checked').get;
const dependencyRequire=createRequire(require.resolve('jsdom/lib/jsdom/living/helpers/style-rules.js')),cssValue=dependencyRequire('cssstyle').CSSStyleDeclaration.prototype.getPropertyValue,URLConstructor=URL,HTML='http://www.w3.org/1999/xhtml';
const children=node=>Array.from(apply(childrenIterator,domSymbolTree,[node])),descendants=node=>Array.from(apply(treeIterator,domSymbolTree,[node])).slice(1),tag=node=>node?._localName;
const attr=(node,name)=>apply(getAttribute,node,[name]),isHTML=(node,name)=>node.nodeType===1&&node._namespaceURI===HTML&&node._localName===name;
function link(node,name){const raw=attr(node,name);if(raw===null)return'';try{return new URLConstructor(raw,apply(baseURI,node,[])).href}catch{return raw}}
function rows(node){const head=[],body=[],foot=[];for(const child of children(node)){if(isHTML(child,'tr'))body.push(child);else if(child._namespaceURI===HTML&&['thead','tbody','tfoot'].includes(tag(child))){const group=tag(child)==='thead'?head:tag(child)==='tfoot'?foot:body;for(const row of children(child))if(isHTML(row,'tr'))group.push(row)}}return[...head,...body,...foot]}
function inlineStyle(node){
 // No public cascade fallback: it would run authored DOM getters. Active
 // author sheets require a separate canonical private cascade bridge.
 if(node._ownerDocument?._styleSheets?._list?.length)throw new DumpError('Author stylesheet visibility is not supported by the private markdown adapter','UnsupportedMarkdownStyle');
 const value=name=>node._style?apply(cssValue,node._style,[name]):'';
 return{display:value('display'),visibility:value('visibility')};
}
const read=Object.freeze({
 type:node=>node.nodeType,data:node=>node._data,tag,children,
 elements:node=>children(node).filter(child=>child.nodeType===1),
 style:inlineStyle,hidden:node=>apply(hasAttribute,node,['hidden']),attr,
 hasAttr:(node,name)=>apply(hasAttribute,node,[name]),href:node=>link(node,'href'),src:node=>link(node,'src'),alt:node=>attr(node,'alt')??'',
 parentTag:node=>{const value=apply(parent,domSymbolTree,[node]);return value?.nodeType===1?tag(value):undefined},
 text:node=>apply(textContent,node,[]),inputType:node=>apply(inputType,node,[]),checked:node=>apply(checked,node,[]),
 selectedOptions:node=>descendants(node).filter(value=>isHTML(value,'option')&&value._selectedness===true),
 rows,firstRow:node=>rows(node)[0],cells:node=>children(node).filter(value=>isHTML(value,'td')||isHTML(value,'th')),
 hasHeader:node=>node?descendants(node).some(value=>isHTML(value,'th')):false,
});
export function dumpMarkdownNode(value){
 const node=platformFactoryRecord(value)?.implementation;
 if(!node||!apply(hasInstance,NodeImpl,[node]))throw new DumpError('A genuine registered DOM node is required');
 return formatMarkdown(node,read);
}
