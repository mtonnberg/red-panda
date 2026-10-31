// Independent Canvas value/state profile. The calibrated target has no Canvas
// rasterizer: drawing is deliberately ineffective, reads stay transparent and
// serialization encodes a real transparent1x1 PNG regardless of canvas size.
import {createRequire} from 'node:module';
import {encodeRGBAPNG} from './png.js';
import {registerPlatformFactory,platformFactoryRecord} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
const require=createRequire(import.meta.url),color=require('@asamuzakjp/css-color');
const installed=new WeakMap(),offscreen=new WeakMap(),documents=new WeakMap(),contexts=new WeakMap(),gradients=new WeakMap(),patterns=new WeakMap(),metrics=new WeakMap(),paths=new WeakMap();
const kinds=['OffscreenCanvas','OffscreenCanvasRenderingContext2D','CanvasRenderingContext2D','CanvasGradient','CanvasPattern','TextMetrics','Path2D'];
const slot=fields=>Object.assign(Object.create(null),fields);
const sharedContext=()=>slot({font:'10px sans-serif',size:10,fillStyle:'#000000',strokeStyle:'#000000',dash:[]});
const originalCreate=Object.create;
function copySequence(values){const result=new Array(values.length);for(let i=0;i<values.length;i++)Object.defineProperty(result,i,{value:values[i],writable:true,enumerable:true,configurable:true});return result}
function documentState(value){const provenance=platformFactoryRecord(value);if(provenance?.kind!=='HTMLCanvasElement'||!provenance.implementation)return null;let state=documents.get(provenance.implementation);if(!state){state=slot({implementation:provenance.implementation,contexts:new WeakMap(),shared:sharedContext()});documents.set(provenance.implementation,state)}return state}
function canvasState(value){return offscreen.get(value)??documentState(value)}
function dimensions(value){const state=offscreen.get(value);if(state)return{width:state.width,height:state.height};const d=documentState(value);return d?{width:d.implementation.width,height:d.implementation.height}:null}
export function canvasDimensions(value){return dimensions(value)}
export function canvasSnapshot(value){const size=dimensions(value);if(!size)return null;const count=size.width*size.height*4;if(!Number.isSafeInteger(count)||count>64*1024*1024)throw new RangeError('Canvas snapshot exceeds the independent backend byte limit');return{...size,bytes:new Uint8Array(count)}}
export function isCanvasCloneRejected(value){return !!(canvasState(value)||contexts.has(value)||gradients.has(value)||patterns.has(value)||metrics.has(value)||paths.has(value))}
function fontInfo(value){const match=/(?:^|\s)(\d+(?:\.\d*)?|\.\d+)(px|pt|pc|in|cm|mm|q|em|rem|%)(?:\/[^ ]+)?\s+.+$/i.exec(value);if(!match)return null;const prefix=value.slice(0,match.index).trim();if(prefix&&!/^(?:(?:normal|italic|oblique|small-caps|bold|bolder|lighter|[1-9]00|condensed|expanded)\s*)+$/i.test(prefix))return null;const factors={px:1,pt:96/72,pc:16,in:96,cm:96/2.54,mm:96/25.4,q:96/101.6,em:16,rem:16,'%':.16};return{font:value,size:Number(match[1])*factors[match[2].toLowerCase()]}}
const zeroWidth=c=>(c<32)||(c>=0x300&&c<=0x36f)||(c>=0x1ab0&&c<=0x1aff)||(c>=0x1dc0&&c<=0x1dff)||(c>=0x20d0&&c<=0x20ff)||(c>=0xfe00&&c<=0xfe0f)||(c>=0xfe20&&c<=0xfe2f)||c===0x200d;
const wide=c=>(c>=0x1100&&c<=0x115f)||(c>=0x2329&&c<=0x232a)||(c>=0x2e80&&c<=0xa4cf)||(c>=0xac00&&c<=0xd7a3)||(c>=0xf900&&c<=0xfaff)||(c>=0xfe10&&c<=0xfe19)||(c>=0xfe30&&c<=0xfe6f)||(c>=0xff00&&c<=0xff60)||(c>=0xffe0&&c<=0xffe6)||(c>=0x1f000&&c<=0x1ffff)||(c>=0x20000&&c<=0x3fffd);
function textWidth(text,size){let width=0;for(const char of text){const c=char.codePointAt(0);width+=size*(zeroWidth(c)?0:char===' '?.33:wide(c)?1:.6)}return width}
function factory(g,b){
 const TypeError=g.TypeError,Exception=g.DOMException,ImageData=g.ImageData,Blob=g.Blob,Promise=g.Promise,Number=g.Number,String=g.String;
 const define=g.Object.defineProperty,own=g.Object.getOwnPropertyDescriptor,apply=g.Reflect.apply,Array=g.Array,isFinite=Number.isFinite;
 const iterator=g.Symbol.iterator,symbolDescription=own(g.Symbol.prototype,'description').get,text=v=>typeof v==='symbol'?apply(symbolDescription,v,[])??'':String(v),invalid=()=>new TypeError('invalid argument'),illegal=()=>new TypeError('Illegal invocation');
 const index=()=>new Exception('Index or size is negative or greater than the allowed amount','IndexSizeError');
 const numeric=(args,index)=>{if(args.length<=index)throw invalid();return +args[index]};
 const method=(p,name,length,body)=>{const f=({[name](...args){return apply(body,this,[args])}})[name];define(f,'length',{value:length,configurable:true});define(p,name,{value:f,writable:true,enumerable:true,configurable:true})};
 const shape=(C,name)=>{for(const key of g.Reflect.ownKeys(C.prototype)){const d=own(C.prototype,key);if(d.get)define(d.get,'name',{value:'get '+String(key),configurable:true});if(d.set)define(d.set,'name',{value:'set '+String(key),configurable:true});}define(C,'name',{value:name,configurable:true});delete C.prototype.constructor;define(C.prototype,'constructor',{value:C,writable:true,configurable:true});define(C.prototype,g.Symbol.toStringTag,{value:name,configurable:true});return C};
 const inaccessible=name=>{const C=function(){throw new TypeError('Illegal Constructor')};define(C,'prototype',{writable:false});define(C,'name',{value:name,configurable:true});delete C.prototype.constructor;return C};
 const validContext=(v,off)=>{if(!b.context(v,off))throw illegal()};
 const CanvasGradient=inaccessible('CanvasGradient');method(CanvasGradient.prototype,'addColorStop',2,function(a){if(!b.gradient(this))throw illegal();if(a.length<2)throw invalid();const offset=+a[0],color=text(a[1]);if(!isFinite(offset)||offset<0||offset>1)throw index();b.stop(this,offset,color)});shape(CanvasGradient,'CanvasGradient');
 const CanvasPattern=inaccessible('CanvasPattern');method(CanvasPattern.prototype,'setTransform',0,function(){if(!b.pattern(this))throw illegal()});shape(CanvasPattern,'CanvasPattern');
 const TextMetrics=inaccessible('TextMetrics');for(const key of['width','actualBoundingBoxLeft','actualBoundingBoxRight','actualBoundingBoxAscent','actualBoundingBoxDescent','fontBoundingBoxAscent','fontBoundingBoxDescent','emHeightAscent','emHeightDescent','hangingBaseline','alphabeticBaseline','ideographicBaseline'])define(TextMetrics.prototype,key,{get(){if(!b.metrics(this))throw illegal();return b.metric(this,key)},enumerable:true,configurable:true});shape(TextMetrics,'TextMetrics');
 function Path2D(){if(!new.target)throw invalid();let source='';if(arguments[0]!==undefined){if(b.path(arguments[0]))source=b.pathSource(arguments[0]);else source=text(arguments[0])}b.pathStore(this,source)}
 delete Path2D.prototype.constructor;define(Path2D,'prototype',{writable:false});method(Path2D.prototype,'addPath',1,function(a){if(!b.path(this))throw illegal();if(a.length<1||!b.path(a[0]))throw invalid();});for(const[name,n]of Object.entries({closePath:0,moveTo:2,lineTo:2,quadraticCurveTo:4,bezierCurveTo:6,arc:5,arcTo:5,ellipse:7,rect:4,roundRect:4}))method(Path2D.prototype,name,n,function(){if(!b.path(this))throw illegal()});shape(Path2D,'Path2D');
 function makeContext(name,off){
  const C=inaccessible(name),p=C.prototype;
  define(p,'canvas',{get(){validContext(this,off);return b.owner(this)},enumerable:true,configurable:true});
  define(p,'font',{get(){validContext(this,off);return b.read(this,'font')},set(value){validContext(this,off);b.font(this,text(value))},enumerable:true,configurable:true});
  method(p,'measureText',1,function(a){validContext(this,off);if(!a.length)throw invalid();return b.measure(this,text(a[0]))});
  method(p,'setLineDash',1,function(a){validContext(this,off);const v=a[0];if(!a.length||v===null||(typeof v!=='object'&&typeof v!=='function')||b.view(v)||typeof v[iterator]!=='function')throw invalid();const values=[];for(const x of v)define(values,values.length,{value:+x,writable:true,enumerable:true,configurable:true});for(let i=0;i<values.length;i++)if(!isFinite(values[i])||values[i]<0)return;b.dash(this,values)});
  method(p,'getLineDash',0,function(){validContext(this,off);const values=b.dashCopy(this),out=new Array(values.length);for(let i=0;i<values.length;i++)define(out,i,{value:values[i],enumerable:true,writable:true,configurable:true});return out});
  const defaults={lineDashOffset:0,shadowBlur:0,shadowColor:'rgba(0, 0, 0, 0)',shadowOffsetX:0,shadowOffsetY:0,filter:'none',imageSmoothingEnabled:true,imageSmoothingQuality:'low',direction:'ltr',letterSpacing:'0px',wordSpacing:'0px',fontKerning:'auto',globalAlpha:1,globalCompositeOperation:'source-over',lineWidth:1,lineCap:'butt',lineJoin:'miter',miterLimit:10,textAlign:'start',textBaseline:'alphabetic'};
  // The target exposes these defaults as writable prototype data properties,
  // so assignment intentionally retains ordinary JS value/coercion semantics.
  for(const[key,value]of Object.entries(defaults))define(p,key,{value,writable:true,enumerable:true,configurable:true});
  for(const key of['strokeStyle','fillStyle'])define(p,key,{get(){validContext(this,off);return b.read(this,key)},set(value){validContext(this,off);if(b.styleObject(value))b.style(this,key,value);else{const normalized=b.color(text(value));if(normalized!==null)b.style(this,key,normalized)}},enumerable:true,configurable:true});
  method(p,'createImageData',1,function(a){validContext(this,off);if(!a.length)throw invalid();if(a.length===1){const size=b.imageSize(a[0]);if(!size)throw new TypeError('');return new ImageData(size.width,size.height)}return new ImageData(a[0],a[1],a[2])});
  method(p,'putImageData',3,function(a){validContext(this,off);if(a.length<3||!b.imageSize(a[0]))throw invalid();for(let i=1;i<Math.min(a.length,7);i++)+a[i];});
  if(!off)method(p,'drawImage',3,function(a){validContext(this,off);if(!a.length)throw invalid();numeric(a,1);numeric(a,2);for(let i=3;i<Math.min(a.length,9);i++)+a[i];});
  method(p,'getImageData',4,function(a){validContext(this,off);numeric(a,0);numeric(a,1);const w=numeric(a,2)|0,h=numeric(a,3)|0;if(w<=0||h<=0)throw index();return new ImageData(w,h)});
  for(const[name,n]of Object.entries({save:0,restore:0,scale:2,rotate:1,translate:2,transform:6,setTransform:6,resetTransform:0,clearRect:4,beginPath:0,closePath:0,moveTo:2,lineTo:2,quadraticCurveTo:4,bezierCurveTo:6,arc:5,arcTo:5,rect:4,roundRect:4,ellipse:7,fill:0,stroke:0,clip:0}))method(p,name,n,function(){validContext(this,off)});
  for(const name of['fillRect','strokeRect'])method(p,name,4,function(a){validContext(this,off);for(let i=0;i<4;i++)numeric(a,i);});
  for(const name of['fillText','strokeText'])method(p,name,3,function(a){validContext(this,off);if(!a.length)throw invalid();text(a[0]);numeric(a,1);numeric(a,2);if(a[3]!==undefined)+a[3];});
  for(const name of['isPointInPath','isPointInStroke'])method(p,name,1,function(a){validContext(this,off);if(!a.length)throw invalid();return false});
  for(const[name,n]of[['createLinearGradient',4],['createRadialGradient',6],['createConicGradient',3]])method(p,name,n,function(a){validContext(this,off);const coords=[];for(let i=0;i<n;i++)define(coords,coords.length,{value:numeric(a,i),writable:true,enumerable:true,configurable:true});return b.makeGradient(name,coords)});
  method(p,'createPattern',1,function(a){validContext(this,off);if(!a.length)throw invalid();const repetition=a[1]==null?'repeat':text(a[1])||'repeat';if(!['repeat','repeat-x','repeat-y','no-repeat'].includes(repetition))throw new Exception('The string did not match the expected pattern','SyntaxError');return b.makePattern(repetition)});
  const order=['canvas','font','measureText','setLineDash','getLineDash','lineDashOffset','roundRect','ellipse','isPointInPath','isPointInStroke','createLinearGradient','createRadialGradient','createConicGradient','createPattern','shadowBlur','shadowColor','shadowOffsetX','shadowOffsetY','filter','imageSmoothingEnabled','imageSmoothingQuality','direction','letterSpacing','wordSpacing','fontKerning','globalAlpha','globalCompositeOperation','strokeStyle','lineWidth','lineCap','lineJoin','miterLimit','textAlign','textBaseline','fillStyle','createImageData','putImageData',...(!off?['drawImage']:[]),'getImageData','save','restore','scale','rotate','translate','transform','setTransform','resetTransform','clearRect','fillRect','strokeRect','beginPath','closePath','moveTo','lineTo','quadraticCurveTo','bezierCurveTo','arc','arcTo','rect','fill','stroke','clip','fillText','strokeText'];
  const descriptors=order.map(key=>[key,own(p,key)]);for(const[key]of descriptors)delete p[key];for(const[key,d]of descriptors)define(p,key,d);
  return shape(C,name);
 }
 const CanvasRenderingContext2D=makeContext('CanvasRenderingContext2D',false),OffscreenCanvasRenderingContext2D=makeContext('OffscreenCanvasRenderingContext2D',true);
 function OffscreenCanvas(width,height){if(!new.target||arguments.length<2)throw invalid();b.offscreenStore(this,Number(width)>>>0,Number(height)>>>0)}
 delete OffscreenCanvas.prototype.constructor;define(OffscreenCanvas,'prototype',{writable:false});
 for(const key of['width','height'])define(OffscreenCanvas.prototype,key,{get(){if(!b.offscreen(this))throw illegal();return b.dimension(this,key)},set(value){if(!b.offscreen(this))throw illegal();b.dimensionSet(this,key,Number(value)>>>0)},enumerable:true,configurable:true});
 method(OffscreenCanvas.prototype,'getContext',1,function(a){if(!b.offscreen(this))throw illegal();if(!a.length)throw invalid();return b.getContext(this,text(a[0]),true)});
 method(OffscreenCanvas.prototype,'convertToBlob',0,function(){if(!b.offscreen(this))throw illegal();if(!b.nonzero(this))return Promise.reject(index());return Promise.resolve(new Blob([b.png()],{type:'image/png'}))});
 method(OffscreenCanvas.prototype,'transferToImageBitmap',0,function(){if(!b.offscreen(this))throw illegal();return null});shape(OffscreenCanvas,'OffscreenCanvas');
 const html=g.HTMLCanvasElement?.prototype;
 if(html){
  method(html,'getContext',1,function(a){if(!b.html(this))throw illegal();if(!a.length)throw invalid();return b.getContext(this,text(a[0]),false)});
  method(html,'toDataURL',0,function(a){if(!b.html(this))throw illegal();if(a[0]!==undefined)text(a[0]);if(a[1]!==undefined)+a[1];return b.nonzero(this)?'data:image/png;base64,'+b.pngBase64():'data:,'});
  method(html,'toBlob',1,function(a){if(!b.html(this))throw illegal();if(typeof a[0]!=='function')throw invalid();if(a[1]!==undefined)text(a[1]);if(a[2]!==undefined)+a[2];const callback=a[0],blob=b.nonzero(this)?new Blob([b.png()],{type:'image/png'}):null;b.schedule(()=>apply(callback,g,[blob]));});
  method(html,'transferControlToOffscreen',0,function(){if(!b.html(this))throw illegal();return new OffscreenCanvas(b.dimension(this,'width'),b.dimension(this,'height'))});
 }
 const classes={OffscreenCanvas,OffscreenCanvasRenderingContext2D,CanvasRenderingContext2D,CanvasGradient,CanvasPattern,TextMetrics,Path2D};
 for(const[name,C]of Object.entries(classes))if(name!=='CanvasRenderingContext2D'||html)define(g,name,{value:C,writable:true,configurable:true});
 return classes;
}
export function installCanvas(realm){
 if(installed.has(realm))return installed.get(realm);
 for(const kind of kinds)registerPlatformFactoryKind(kind);
 const ObjectCtor=realm.Object,apply=Reflect.apply,create=ObjectCtor.create,schedule=realm.setTimeout;let classes;
 const register=(value,kind,state)=>{registerPlatformFactory(value,{kind,implementation:state,globalObject:realm});return value};
 const allocate=(C,kind,state,map)=>{const value=apply(create,ObjectCtor,[C.prototype]);map.set(value,state);return register(value,kind,state)};
 const b={
  html:value=>!!documentState(value),offscreen:value=>offscreen.has(value),dimension:(value,key)=>dimensions(value)?.[key],dimensionSet:(value,key,n)=>{offscreen.get(value)[key]=n},nonzero:value=>{const d=dimensions(value);return d.width>0&&d.height>0},
  offscreenStore(value,width,height){const state=slot({width,height,contexts:new WeakMap(),shared:sharedContext()});offscreen.set(value,state);register(value,'OffscreenCanvas',state)},
  getContext(owner,type,isOff){if(type!=='2d')return null;const state=canvasState(owner);let value=state.contexts.get(realm);if(!value){const kind=isOff?'OffscreenCanvasRenderingContext2D':'CanvasRenderingContext2D',data=slot({kind,owner,shared:state.shared});value=allocate(classes[kind],kind,data,contexts);state.contexts.set(realm,value)}return value},
  context:(value,off)=>contexts.get(value)?.kind===(off?'OffscreenCanvasRenderingContext2D':'CanvasRenderingContext2D'),owner:value=>contexts.get(value).owner,read:(value,key)=>contexts.get(value).shared[key],
  font(value,font){const parsed=fontInfo(font);if(parsed)Object.assign(contexts.get(value).shared,parsed)},
  style:(value,key,style)=>{contexts.get(value).shared[key]=style},styleObject:value=>gradients.has(value)||patterns.has(value),
  color(value){if(!color.isColor(value))return null;const hex=color.resolve(value,{format:'hexAlpha'});return hex&&hex.length===7?hex:color.resolve(value,{format:'computedValue'})},
  dash(value,values){const data=copySequence(values);contexts.get(value).shared.dash=data.length%2?[...data,...data]:data},dashCopy:value=>Array.from(contexts.get(value).shared.dash),view:ArrayBuffer.isView,
  imageSize(value){const record=platformFactoryRecord(value);return record?.kind==='ImageData'&&record.implementation?{width:record.implementation.width,height:record.implementation.height}:null},
  gradient:value=>gradients.has(value),stop(value,offset,color){gradients.get(value).stops.push({offset,color})},makeGradient(type,coords){return allocate(classes.CanvasGradient,'CanvasGradient',slot({type,coords:copySequence(coords),stops:[]}),gradients)},
  pattern:value=>patterns.has(value),makePattern(repetition){return allocate(classes.CanvasPattern,'CanvasPattern',slot({repetition}),patterns)},
  metrics:value=>metrics.has(value),metric:(value,key)=>metrics.get(value)[key],measure(value,text){const size=contexts.get(value).shared.size,width=textWidth(text,size),ascent=.8*size,descent=.2*size;return allocate(classes.TextMetrics,'TextMetrics',Object.freeze(slot({width,actualBoundingBoxLeft:0,actualBoundingBoxRight:width,actualBoundingBoxAscent:ascent,actualBoundingBoxDescent:descent,fontBoundingBoxAscent:ascent,fontBoundingBoxDescent:descent,emHeightAscent:ascent,emHeightDescent:descent,hangingBaseline:ascent,alphabeticBaseline:0,ideographicBaseline:-descent})),metrics)},
  path:value=>paths.has(value),pathSource:value=>paths.get(value).source,pathStore(value,source){const data=Object.freeze(slot({source}));paths.set(value,data);register(value,'Path2D',data)},
  png:()=>encodeRGBAPNG(1,1,new Uint8Array(4)),pngBase64:()=>encodeRGBAPNG(1,1,new Uint8Array(4)).toString('base64'),schedule:callback=>apply(schedule,realm,[callback,0]),
 };
 const values=realm.eval(`(${factory.toString()})`)(realm,b);classes=Object.freeze(Object.assign(originalCreate(null),values));installed.set(realm,classes);return classes;
}
