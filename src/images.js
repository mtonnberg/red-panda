import {subtreeDefinitelyAbsent,IMAGE_SUBTREE} from './subtree-feature-index.js';
// Real DOM image source selection, owned tasks and optional real HTTP header
// inspection. The measured headless default reports selection load without a
// network request; enabling image resources reads genuine response bytes.
import vm from 'node:vm';
import{createRequire}from'node:module';
import{platformFactoryRecord,registerPlatformFactory}from'./platform-factories.js';
import{captureDOMExceptionFactory}from'./worker-dom-exception.js';
import{imageHeaderSize}from'./image-metadata.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
const ImageImpl=require('jsdom/lib/jsdom/living/nodes/HTMLImageElement-impl.js').implementation;
const SourceImpl=require('jsdom/lib/jsdom/living/nodes/HTMLSourceElement-impl.js').implementation;
const NodeImpl=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation;
const Event=require('jsdom/lib/jsdom/living/generated/Event.js');
const{domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const parse5=createRequire(require.resolve('jsdom/lib/jsdom/browser/parser/html.js'))('parse5');
const records=new WeakMap(),states=new WeakMap(),installed=new WeakMap(),fragments=new WeakMap();let patched=false;
const HTML='http://www.w3.org/1999/xhtml',apply=Reflect.apply,construct=Reflect.construct,define=Object.defineProperty;
const hidden=value=>Object.assign(Object.create(null),value);
function recordFor(document){return records.get(document?._globalObject)}
function state(image){let s=states.get(image);if(!s){s=hidden({image,current:'',complete:true,width:0,height:0,status:'none',generation:0,pending:null,release:null,abort:null,decodes:[],document:null,fragment:false});states.set(image,s)}return s}
function attr(node,key){return node.getAttributeNS(null,key)}
function image(node){return node instanceof ImageImpl}
function picture(node){return node?.namespaceURI===HTML&&node.localName==='picture'}
function images(node){if(image(node))return[node];if(subtreeDefinitelyAbsent(node,IMAGE_SUBTREE))return[];return[...domSymbolTree.treeIterator(node)].filter(image)}
function sourceSize(text,record){
 for(const part of(text??'').split(',')){const match=part.trim().match(/^(.*?)([+]?(?:\d+(?:\.\d*)?|\.\d+))(px|vw|vh)\s*$/i);if(!match)continue;const condition=match[1].trim();if(condition&&!apply(record.matchMedia,record.window,[condition]).matches)continue;const value=+match[2]*(match[3].toLowerCase()==='vw'?record.window.innerWidth/100:match[3].toLowerCase()==='vh'?record.window.innerHeight/100:1);if(value>0)return value}
 return record.window.innerWidth;
}
export function parseImageCandidates(input){
 const result=[];let p=0;while(p<input.length){while(p<input.length&&/[\t\n\f\r ,]/.test(input[p]))p++;if(p>=input.length)break;let url='';while(p<input.length&&!/[\t\n\f\r ]/.test(input[p]))url+=input[p++];let descriptors=[];
  if(url.endsWith(','))url=url.replace(/,+$/,'');else{let text='',depth=0;while(p<input.length){const c=input[p++];if(c===','&&!depth)break;if(c==='(')depth++;if(c===')')depth--;text+=c}descriptors=text.trim().split(/[\t\n\f\r ]+/).filter(Boolean)}
  if(!url)continue;let width=null,density=null,height=null,valid=true;
  for(const d of descriptors){if(/^\d+w$/.test(d)&&+d.slice(0,-1)>0&&width===null&&density===null)width=+d.slice(0,-1);else if(/^\d+h$/.test(d)&&+d.slice(0,-1)>0&&height===null&&density===null)height=+d.slice(0,-1);else if(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?x$/.test(d)&&+d.slice(0,-1)>0&&density===null&&width===null&&height===null)density=+d.slice(0,-1);else valid=false}
  if(valid&&(height===null||width!==null))result.push({url,width,density:density??(width===null?1:null)});
 }return result;
}
function selection(element,record){
 let srcset=attr(element,'srcset'),sizes=attr(element,'sizes'),fromPicture=false;
 const parent=domSymbolTree.parent(element);
 if(picture(parent)){for(const sibling of domSymbolTree.childrenIterator(parent)){if(sibling===element)break;if(!(sibling instanceof SourceImpl)||!attr(sibling,'srcset'))continue;const type=(attr(sibling,'type')??'').trim().toLowerCase();if(type&&!/^(?:image\/(?:png|jpeg|gif|webp|svg\+xml|avif|bmp|x-icon|vnd\.microsoft\.icon))$/.test(type))continue;const media=attr(sibling,'media');if(media&&!apply(record.matchMedia,record.window,[media]).matches)continue;const candidates=parseImageCandidates(attr(sibling,'srcset'));if(!candidates.length)continue;srcset=attr(sibling,'srcset');sizes=attr(sibling,'sizes');fromPicture=true;break}}
 const candidates=parseImageCandidates(srcset??''),raw=attr(element,'src');
 if(!fromPicture&&raw!==null&&raw!==''&&!candidates.some(c=>c.width!==null||c.density===1))candidates.push({url:raw,width:null,density:1});
 let chosen=null;for(const c of candidates){const density=c.density??c.width/sourceSize(sizes,record);if(!chosen||density>=1&&(chosen.density<1||density<chosen.density)||density<1&&chosen.density<1&&density>chosen.density)chosen={url:c.url,density}}
 const value=chosen?.url??raw??'',hasSource=chosen!==null||raw!==null;
 let url=null;try{if(value!=='')url=new URL(value,element._ownerDocument.baseURLSerialized()).href}catch{}
 return{current:url??value,url,hasSource,density:chosen?.density??1};
}
function cancel(s){s.generation++;s.abort?.abort();s.abort=null;if(s.pending!==null){clearTimeout(s.pending);s.pending=null}s.release?.();s.release=null;for(const d of s.decodes.splice(0))d.reject(d.error())}
function emit(record,element,type){const value=construct(record.Object,[]);Object.setPrototypeOf(value,record.eventPrototype);Event.setup(value,record.window,[type,{}],{isTrusted:true});const implementation=platformFactoryRecord(value)?.implementation;registerPlatformFactory(value,{kind:'Event',implementation,globalObject:record.window});element._dispatch(implementation)}
async function metadata(response){
 if(!response.ok){await response.body?.cancel();throw Error('Image HTTP status '+response.status)}
 const reader=response.body?.getReader();if(!reader)return[0,0];const chunks=[];let length=0;
 try{for(;;){const next=await reader.read();if(next.done)return imageHeaderSize(Buffer.concat(chunks,length),true)??[0,0];const b=Buffer.from(next.value);chunks.push(b);length+=b.length;const size=imageHeaderSize(Buffer.concat(chunks,length));if(size)return size;if(length>=262144)return[0,0]}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
}
function update(element,{force=false,fragment=false}={}){
 const record=recordFor(element._ownerDocument);if(!record)return;const s=state(element),selected=selection(element,record),document=element._ownerDocument;
 if(!force&&s.current===selected.current&&s.document===document&&s.status!=='inert')return;
 cancel(s);s.document=document;s.current=selected.current;s.fragment=fragment||!!fragments.get(document);const generation=s.generation;
 if(!document._defaultView){s.complete=true;s.width=s.height=0;s.status='inert';return}
 if(!selected.hasSource){s.complete=true;s.width=s.height=0;s.status='none';return}
 const empty=selected.current==='';s.complete=empty||s.fragment&&record.fetchImages;s.status='pending';if(empty)s.width=s.height=0;
 let release;const pending=new Promise(resolve=>{release=resolve});s.release=release;
 if(document.readyState!=='complete')document._queue.push(pending,()=>{},()=>{},false);
 const finish=(ok,size=[0,0])=>{
  if(s.generation!==generation||record.disposed)return;const currentRelease=s.release;s.release=null;s.abort=null;s.pending=null;s.complete=true;s.status=ok?'loaded':'broken';s.width=ok?size[0]:0;s.height=ok?size[1]:0;
  const decodes=s.decodes.splice(0);try{emit(record,element,ok?'load':'error')}finally{currentRelease?.();for(const d of decodes)if(ok)d.resolve();else d.reject(d.error())}
 };
 s.pending=setTimeout(()=>{s.pending=null;if(record.disposed||generation!==s.generation){release();return}
  if(empty){finish(false);return}
  if(!record.fetchImages||s.fragment){finish(true);return}
  if(!selected.url){finish(false);return}
  const abort=new AbortController();s.abort=abort;const headers=new Headers({accept:'image/avif,image/webp,image/*,*/*;q=0.8'}),referrer=record.page.referrerFor?.(selected.url,document.URL);if(referrer)headers.set('referer',referrer);
  record.page.fetch(selected.url,{signal:abort.signal,headers},'Image').then(metadata).then(size=>finish(true,size),()=>finish(false));
 },0);
 record.live.add(s);pending.finally(()=>{if(s.generation===generation)record.live.delete(s)});
}
function reconcilePicture(parent){if(picture(parent))for(const child of domSymbolTree.childrenIterator(parent))if(image(child))update(child)}
function patch(){if(patched)return;patched=true;
 const modified=ImageImpl.prototype._attrModified,updated=ImageImpl.prototype._updateTheImageData;
 ImageImpl.prototype._updateTheImageData=function(){const r=recordFor(this._ownerDocument);if(!r)return updated.call(this);update(this,{force:state(this).forceSource===true})};
 ImageImpl.prototype._attrModified=function(name,value,old,...args){const s=state(this),before=s.forceSource;s.forceSource=name==='src';try{return modified.call(this,name,value,old,...args)}finally{s.forceSource=before}};
 for(const key of['naturalWidth','naturalHeight','complete','currentSrc']){const original=Object.getOwnPropertyDescriptor(ImageImpl.prototype,key);define(ImageImpl.prototype,key,{configurable:true,get(){if(!recordFor(this._ownerDocument))return apply(original.get,this,[]);const s=state(this);return key==='naturalWidth'?s.width:key==='naturalHeight'?s.height:key==='complete'?s.complete:s.current}})}
 for(const key of['width','height']){const original=Object.getOwnPropertyDescriptor(ImageImpl.prototype,key);define(ImageImpl.prototype,key,{...original,get(){if(!recordFor(this._ownerDocument))return apply(original.get,this,[]);const raw=attr(this,key);if(raw!==null){const n=Number.parseInt(raw,10);return Number.isFinite(n)&&n>=0&&n<=2147483647?n:0}return key==='width'?state(this).width:state(this).height}})}
 const sourceModified=SourceImpl.prototype._attrModified;SourceImpl.prototype._attrModified=function(name,...args){const result=sourceModified.call(this,name,...args);if(['srcset','sizes','media','type'].includes(name))reconcilePicture(domSymbolTree.parent(this));return result};
 for(const key of['_insert','_remove']){const original=NodeImpl.prototype[key];NodeImpl.prototype[key]=function(node,...args){const affected=recordFor(this.nodeType===9?this:this._ownerDocument)?images(node):[];const previous=domSymbolTree.parent(node),result=original.call(this,node,...args);for(const element of affected)update(element);reconcilePicture(this);if(previous!==this)reconcilePicture(previous);return result}}
 const fragment=parse5.parseFragment;parse5.parseFragment=function(context,markup,options){const d=context._ownerDocument,depth=fragments.get(d)??0;fragments.set(d,depth+1);try{return fragment.call(this,context,markup,options)}finally{if(depth)fragments.set(d,depth);else fragments.delete(d)}};
}
function factory(g,b){
 const define=g.Object.defineProperty,own=g.Object.getOwnPropertyDescriptor,apply=g.Reflect.apply,setPrototype=g.Object.setPrototypeOf,TypeError=g.TypeError,Promise=g.Promise,String=g.String,desc=own(g.Symbol.prototype,'description').get;
 const text=v=>typeof v==='symbol'?apply(desc,v,[])??'':String(v),check=v=>{if(!b.has(v))throw new TypeError('Illegal invocation')};
 const prototype=g.HTMLImageElement.prototype;
 function Image(){if(!new.target)throw new TypeError('invalid argument');const value=b.create();for(let i=0;i<2;i++)if(arguments[i]!=null)b.dimension(value,i,(+arguments[i])>>>0);if(new.target!==Image&&new.target.prototype!==null&&(typeof new.target.prototype==='object'||typeof new.target.prototype==='function'))setPrototype(value,new.target.prototype);return value}
 define(Image,'prototype',{value:prototype,writable:false});define(g,'Image',{value:Image,writable:true,configurable:true});
 const methods={decode(){return new Promise((resolve,reject)=>{if(!b.has(this)){reject(new TypeError('invalid argument'));return}b.decode(this,resolve,reject)})},get loading(){check(this);return b.attribute(this,'loading')??'eager'},set loading(v){check(this);b.attribute(this,'loading',text(v),true)},get decoding(){check(this);const raw=(b.attribute(this,'decoding')??'').toLowerCase();return raw==='sync'||raw==='async'?raw:'auto'},set decoding(v){check(this);b.attribute(this,'decoding',text(v),true)},get referrerPolicy(){check(this);const raw=(b.attribute(this,'referrerpolicy')??'').toLowerCase();return['no-referrer','no-referrer-when-downgrade','same-origin','origin','strict-origin','origin-when-cross-origin','strict-origin-when-cross-origin','unsafe-url'].includes(raw)?raw:''},set referrerPolicy(v){check(this);b.attribute(this,'referrerpolicy',text(v),true)}};
 for(const key of['decode','loading','decoding','referrerPolicy'])define(prototype,key,{...own(methods,key),enumerable:true,configurable:true});
}
export function installImages(page,window){if(installed.has(window))return;patch();const document=utils.implForWrapper(window.document),context=document._globalObject,createElement=window.Document.prototype.createElement,record=hidden({page,window,disposed:false,fetchImages:page.browser.options.loadResources?.includes('image')??false,Object:window.Object,eventPrototype:window.Event.prototype,matchMedia:window.matchMedia,live:new Set()});records.set(context,record);
 const exception=captureDOMExceptionFactory(window),get=value=>{const provenance=platformFactoryRecord(value);return provenance?.kind==='HTMLImageElement'?provenance.implementation:null};
 const b=hidden({has:value=>get(value)!==null,create:()=>apply(createElement,window.document,['img']),dimension(value,index,number){get(value).setAttributeNS(null,index?'height':'width',String(number))},attribute(value,key,next,set=false){const element=get(value);if(set)element.setAttributeNS(null,key,next);else return attr(element,key)},decode(value,resolve,reject){const s=state(get(value)),error=()=>exception('The source image cannot be decoded.','EncodingError');if(s.status==='loaded'){resolve();return}if(s.status!=='pending'){reject(error());return}s.decodes.push(hidden({resolve,reject,error}))}});
 vm.compileFunction(`(${factory.toString()})(globalThis,b)`,['b'],{parsingContext:context})(b);
 const dispose=()=>{if(record.disposed)return;record.disposed=true;for(const s of record.live)cancel(s);record.live.clear()};page.documentAbort?.signal.addEventListener('abort',dispose,{once:true});installed.set(window,record);
}
