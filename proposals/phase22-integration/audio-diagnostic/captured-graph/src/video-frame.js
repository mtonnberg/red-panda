import {types} from 'node:util';
import {registerPlatformFactory,platformFactoryRecord} from './platform-factories.js';
import {registerPlatformFactoryKind} from './platform-factory-hooks.js';
const states=new WeakMap(),installed=new WeakMap(),tokens=new WeakMap(),nativeClone=globalThis.structuredClone,MAX_BYTES=64*1024*1024;
const typed=Object.getPrototypeOf(Uint8Array.prototype),get=(p,k)=>Object.getOwnPropertyDescriptor(p,k).get;
const tb=get(typed,'buffer'),tl=get(typed,'byteLength'),to=get(typed,'byteOffset'),db=get(DataView.prototype,'buffer'),dl=get(DataView.prototype,'byteLength'),dof=get(DataView.prototype,'byteOffset');
const FORMATS=Object.create(null);
for(const [name,sx,sy]of[['I420',2,2],['I422',2,1],['I444',1,1]])for(const alpha of[false,true])for(const depth of[8,10,12]){
 const format=name+(alpha?'A':'')+(depth===8?'':'P'+depth),bps=depth===8?1:2;
 FORMATS[format]=Object.freeze({rgb:false,alpha,planes:Object.freeze([{x:1,y:1,unit:bps},{x:sx,y:sy,unit:bps},{x:sx,y:sy,unit:bps},...(alpha?[{x:1,y:1,unit:bps}]:[])].map(Object.freeze))});
}
FORMATS.NV12=Object.freeze({rgb:false,alpha:false,planes:Object.freeze([{x:1,y:1,unit:1},{x:2,y:2,unit:2}].map(Object.freeze))});
for(const format of['RGBA','RGBX','BGRA','BGRX'])FORMATS[format]=Object.freeze({rgb:true,alpha:format.endsWith('A'),planes:Object.freeze([Object.freeze({x:1,y:1,unit:4})])});
Object.freeze(FORMATS);
const isData=value=>types.isArrayBuffer(value)||ArrayBuffer.isView(value),slot=values=>Object.assign(Object.create(null),values),failure=(name='TypeError',message='')=>({ok:false,name,message});
function byteView(value){if(types.isArrayBuffer(value)){try{return new Uint8Array(value)}catch{return new Uint8Array()}}const dataView=types.isDataView(value),buffer=(dataView?db:tb).call(value);try{return new Uint8Array(buffer,(dataView?dof:to).call(value),(dataView?dl:tl).call(value))}catch{return new Uint8Array()}}
function layout(format,width,height,custom){
 const type=FORMATS[format];if(!type)return failure();if(custom&&custom.length!==type.planes.length)return failure();let next=0;const planes=[];
 for(let i=0;i<type.planes.length;i++){const p=type.planes[i],rows=Math.ceil(height/p.y),row=Math.ceil(width/p.x)*p.unit,c=custom?.[i],offset=c?c.offset:next,stride=c?c.stride:row,end=offset+stride*rows;
  if(!Number.isInteger(offset)||offset<0||offset>4294967295||!Number.isInteger(stride)||stride<row||stride>4294967295||!Number.isSafeInteger(end))return failure();
  for(const old of planes)if(offset<old.end&&old.offset<end)return failure();
  planes.push(slot({offset,stride,row,rows,end,x:p.x,y:p.y,unit:p.unit}));next=Math.max(next,end);
 }
 return{ok:true,planes,size:next};
}
function rectangle(value,width,height,format){const rect=value??{x:0,y:0,width,height},copy=slot({});for(const k of['x','y','width','height']){const n=rect[k];if(!Number.isFinite(n)||n<0||n>4294967295)return failure();copy[k]=Math.trunc(n)}
 if(!copy.width||!copy.height||copy.x+copy.width>width||copy.y+copy.height>height)return failure();for(const p of FORMATS[format].planes)if(copy.x%p.x||copy.y%p.y)return failure();return{ok:true,...copy};}
function pack(source,sourceLayout,format,rect,targetFormat=format){
 const out=layout(targetFormat,rect.width,rect.height);if(!out.ok)return out;if(out.size>MAX_BYTES)return failure('RangeError','VideoFrame exceeds the independent backend byte limit');const bytes=new Uint8Array(out.size);
 for(let i=0;i<out.planes.length;i++){const a=sourceLayout.planes[i],b=out.planes[i];if(!a)return failure();for(let row=0;row<b.rows;row++){const offset=a.offset+(Math.floor(rect.y/a.y)+row)*a.stride+Math.floor(rect.x/a.x)*a.unit;bytes.set(source.subarray(offset,offset+b.row),b.offset+row*b.stride)}}
 return{ok:true,bytes};
}
const defaultColor=format=>slot({primaries:'bt709',transfer:FORMATS[format].rgb?'iec61966-2-1':'bt709',matrix:FORMATS[format].rgb?'rgb':'bt709',fullRange:FORMATS[format].rgb});
const COLOR={primaries:['bt709','bt470bg','smpte170m','bt2020','smpte432'],transfer:['bt709','smpte170m','iec61966-2-1','linear','pq','hlg'],matrix:['rgb','bt709','bt470bg','smpte170m','bt2020-ncl']};
function color(value,format){if(value===undefined)return{ok:true,value:defaultColor(format)};const c=slot({primaries:value.primaries??null,transfer:value.transfer??null,matrix:value.matrix??null,fullRange:value.fullRange??null});for(const key of['primaries','transfer','matrix'])if(c[key]!==null&&!COLOR[key].includes(c[key]))return failure();return{ok:true,value:c}}
function factory(g,b){
 const TypeError=g.TypeError,RangeError=g.RangeError,Exception=g.DOMException,Promise=g.Promise,Rect=g.DOMRectReadOnly,ColorSpace=g.VideoColorSpace;
 const create=g.Object.create,define=g.Object.defineProperty,descriptor=g.Object.getOwnPropertyDescriptor,apply=g.Reflect.apply,String=g.String,Array=g.Array,from=Array.from,iterator=g.Symbol.iterator,symbolDescription=descriptor(g.Symbol.prototype,'description').get;
 const finite=g.Number.isFinite,trunc=g.Math.trunc,abs=g.Math.abs;
 const err=()=>new TypeError(''),argument=()=>new TypeError('invalid argument'),text=v=>typeof v==='symbol'?apply(symbolDescription,v,[])??'':String(v);
 const dictionary=v=>{if(v==null)return{};if(typeof v!=='object'&&typeof v!=='function')throw err();return v},member=(o,k)=>k in o?o[k]:undefined;
 const uint=v=>{const n=+v;if(!finite(n)||n<0||n>4294967295)throw err();return trunc(n)},integer=(v,unsigned=false)=>{const n=+v;if(!finite(n)||abs(trunc(n))>9007199254740991||unsigned&&n<0)throw err();return trunc(n)||0};
 const assert=value=>{if(!b.brand(value))throw new TypeError('Illegal invocation')};
 function check(r){if(r.ok)return r;if(r.name==='RangeError')throw new RangeError(r.message);if(r.name==='TypeError')throw new TypeError(r.message);throw new Exception(r.message,r.name)}
 function rect(value){if(value==null)return undefined;const o=dictionary(value),height=member(o,'height'),width=member(o,'width'),x=member(o,'x'),y=member(o,'y');return{x:x===undefined?0:+x,y:y===undefined?0:+y,width:width===undefined?0:+width,height:height===undefined?0:+height}}
 function sequence(value){if(value===undefined||value===null)return undefined;if(typeof value[iterator]!=='function')throw err();return apply(from,Array,[value])}
 function layouts(value){const list=sequence(value);if(list===undefined)return undefined;const result=[];for(let i=0;i<list.length;i++){const o=dictionary(list[i]),offset=member(o,'offset'),stride=member(o,'stride');define(result,i,{value:{offset:uint(offset),stride:uint(stride)},enumerable:true,writable:true,configurable:true})}return result}
 function color(value){if(value==null)return undefined;const o=dictionary(value),f=member(o,'fullRange'),m=member(o,'matrix'),p=member(o,'primaries'),t=member(o,'transfer');return{fullRange:f==null?null:!!f,matrix:m==null?null:text(m),primaries:p==null?null:text(p),transfer:t==null?null:text(t)}}
 function parse(init,raw){
  const o=dictionary(init),out=create(null);
  const fields=raw?['codedHeight','codedWidth','colorSpace','displayHeight','displayWidth','duration','flip','format','layout','rotation','timestamp','transfer','visibleRect']:['alpha','displayHeight','displayWidth','duration','flip','rotation','timestamp','visibleRect'];
  for(let i=0;i<fields.length;i++){const key=fields[i],value=member(o,key);if(value===undefined)continue;let converted;
   if(key==='colorSpace')converted=color(value);else if(key==='visibleRect')converted=rect(value);else if(key==='layout')converted=layouts(value);else if(key==='transfer'){converted=sequence(value);if(converted)for(let j=0;j<converted.length;j++)if(!b.transferable(converted[j]))throw err();}
   else if(key==='flip')converted=!!value;else if(key==='codedHeight'||key==='codedWidth')converted=value===null?0:uint(value);else if(key==='displayHeight'||key==='displayWidth')converted=value===null?undefined:uint(value);else if(key==='timestamp')converted=integer(value);else if(key==='duration')converted=value==null?undefined:integer(value,true);else if(key==='rotation')converted=+value;else converted=text(value);
   define(out,key,{value:converted,enumerable:true,writable:true,configurable:true});
  }
  return out;
 }
 function copyOptions(value){const o=dictionary(value),c=member(o,'colorSpace'),format=member(o,'format'),l=member(o,'layout'),r=member(o,'rect');return{colorSpace:c==null?undefined:text(c),format:format==null?undefined:text(format),layout:layouts(l),rect:rect(r)}}
 function VideoFrame(source){if(new.target===undefined||!arguments.length)throw argument();const kind=b.source(source),options=parse(arguments[1],kind==='buffer');check(b.create(this,source,kind,options))}
 define(VideoFrame,'prototype',{writable:false});const p=VideoFrame.prototype;delete p.constructor;
 const getters={get format(){assert(this);return b.read(this,'format')},get codedWidth(){assert(this);return b.read(this,'codedWidth')},get codedHeight(){assert(this);return b.read(this,'codedHeight')},get codedRect(){assert(this);return b.read(this,'closed')?null:new Rect(0,0,b.read(this,'codedWidth'),b.read(this,'codedHeight'))},get visibleRect(){assert(this);return b.read(this,'closed')?null:new Rect(0,0,b.read(this,'storageWidth'),b.read(this,'storageHeight'))},get rotation(){assert(this);return b.read(this,'rotation')},get flip(){assert(this);return b.read(this,'flip')},get displayWidth(){assert(this);return b.read(this,'displayWidth')},get displayHeight(){assert(this);return b.read(this,'displayHeight')},get duration(){assert(this);return b.read(this,'duration')},get timestamp(){assert(this);return b.read(this,'timestamp')},get colorSpace(){assert(this);return new ColorSpace(b.color(this))}};
 for(const key of['format','codedWidth','codedHeight','codedRect','visibleRect','rotation','flip','displayWidth','displayHeight','duration','timestamp','colorSpace'])define(p,key,{...descriptor(getters,key),enumerable:true,configurable:true});
 const methods={metadata(){assert(this);check(b.open(this));return{}},allocationSize(){assert(this);return check(b.allocation(this,copyOptions(arguments[0]))).size},copyTo(destination){return new Promise((resolve,reject)=>{try{if(!b.brand(this)||!b.isData(destination))throw argument();const r=check(b.copy(this,destination,copyOptions(arguments[1]))),result=[];for(let i=0;i<r.layout.length;i++)define(result,i,{value:{offset:r.layout[i].offset,stride:r.layout[i].stride},enumerable:true,writable:true,configurable:true});resolve(result)}catch(error){reject(error)}})},clone(){assert(this);return check(b.clone(this)).value},close(){assert(this);b.close(this)}};
 for(const key of['metadata','allocationSize','copyTo','clone','close'])define(p,key,{value:methods[key],enumerable:true,writable:true,configurable:true});
 define(p,'constructor',{value:VideoFrame,writable:true,configurable:true});define(p,g.Symbol.toStringTag,{value:'VideoFrame',configurable:true});define(g,'VideoFrame',{value:VideoFrame,writable:true,configurable:true});
 return{construct(token){const value=create(VideoFrame.prototype);check(b.hydrate(value,token));return value}};
}
export function installVideoFrame(realm,{canvasSnapshot,canvasDimensions}={}){
 if(installed.has(realm))return installed.get(realm);registerPlatformFactoryKind('VideoFrame');let api;
 const selected=(value,options)=>{const s=states.get(value);if(s.closed)return failure('InvalidStateError','The object is in an invalid state');const format=options.format??s.format,type=FORMATS[format];if(!type)return failure();const r=rectangle(options.rect,s.storageWidth,s.storageHeight,s.format);if(!r.ok)return r;const l=layout(format,r.width,r.height,options.layout);if(!l.ok)return l;return{ok:true,state:s,format,rect:r,output:l,size:l.size}};
 const source=value=>isData(value)?'buffer':states.has(value)?'frame':['HTMLCanvasElement','OffscreenCanvas'].includes(platformFactoryRecord(value)?.kind)?'canvas':['HTMLImageElement','SVGImageElement','HTMLVideoElement'].includes(platformFactoryRecord(value)?.kind)?'image':'unknown';
 api=realm.eval(`(${factory.toString()})`)(realm,{
  brand:value=>states.has(value),source,isData,transferable:types.isArrayBuffer,
  create(value,input,kind,o){
   let format,width,height,bytes,sourceLayout,original,raw=kind==='buffer';
   if(raw){format=o.format;width=o.codedWidth;height=o.codedHeight;bytes=byteView(input);if(!FORMATS[format]||!width||!height)return failure();sourceLayout=layout(format,width,height,o.layout);if(!sourceLayout.ok||sourceLayout.size>bytes.length)return failure();}
   else if(kind==='frame'){original=states.get(input);if(original.closed)return failure('InvalidStateError','The object is in an invalid state');format=original.format;width=original.storageWidth;height=original.storageHeight;bytes=original.bytes;sourceLayout=layout(format,width,height);}
   else if(kind==='canvas'){if(!canvasSnapshot)return failure('InvalidStateError','The object is in an invalid state');const size=canvasDimensions?.(input);if(size&&(!size.width||!size.height||size.width>32767||size.height>32767))return failure('InvalidStateError','The object is in an invalid state');let snapshot;try{snapshot=canvasSnapshot(input)}catch(error){if(error instanceof RangeError)return failure('InvalidStateError','The object is in an invalid state');throw error}if(!snapshot||!snapshot.width||!snapshot.height)return failure('InvalidStateError','The object is in an invalid state');format='RGBA';width=snapshot.width;height=snapshot.height;bytes=snapshot.bytes;sourceLayout=layout(format,width,height);}
   else if(kind==='image')return failure('InvalidStateError','The object is in an invalid state');else return failure();
   const timestamp=o.timestamp===undefined?original?.timestamp:o.timestamp,duration=o.duration??original?.duration??null,angle=o.rotation??0;
   if(timestamp===undefined||!Number.isFinite(angle))return failure();
   const r=rectangle(o.visibleRect,width,height,format);if(!r.ok)return r;
   if((o.displayWidth===undefined)!==(o.displayHeight===undefined)||o.displayWidth===0||o.displayHeight===0)return failure();
   if(o.alpha!==undefined&&!['keep','discard'].includes(o.alpha))return failure();
   let targetFormat=format;if(o.alpha==='discard'){if(format==='RGBA')targetFormat='RGBX';else if(format==='BGRA')targetFormat='BGRX';else if(FORMATS[format].alpha)targetFormat=format.replace('A','');}
   const copied=pack(bytes,sourceLayout,format,r,targetFormat);if(!copied.ok)return copied;
   const chosenColor=raw?color(o.colorSpace,format):{ok:true,value:original?.colorSpace??slot({primaries:null,transfer:null,matrix:null,fullRange:null})};if(!chosenColor.ok)return chosenColor;
   const buffers=[],seen=new Set();for(let i=0;i<(o.transfer?.length??0);i++){const buffer=o.transfer[i];if(seen.has(buffer))return failure('DataCloneError','The object can not be cloned');seen.add(buffer);try{new Uint8Array(buffer)}catch{return failure('DataCloneError','The object can not be cloned')}buffers.push(buffer)}try{nativeClone(null,{transfer:buffers})}catch{return failure('DataCloneError','The object can not be cloned')}
   const relative=((Math.round((angle%360)/90)*90)%360+360)%360,rotation=(((original?.rotation??0)+(original?.flip?-relative:relative))%360+360)%360,flip=Boolean(original?.flip)!==Boolean(o.flip),baseDisplayWidth=o.displayWidth!==undefined?(rotation%180?o.displayHeight:o.displayWidth):(original&&!o.visibleRect?(original.rotation%180?original.baseDisplayHeight:original.baseDisplayWidth):r.width),baseDisplayHeight=o.displayHeight!==undefined?(rotation%180?o.displayWidth:o.displayHeight):(original&&!o.visibleRect?(original.rotation%180?original.baseDisplayWidth:original.baseDisplayHeight):r.height);
   const state=slot({format:targetFormat,codedWidth:original?.codedWidth??r.width,codedHeight:original?.codedHeight??r.height,storageWidth:r.width,storageHeight:r.height,baseDisplayWidth,baseDisplayHeight,timestamp,duration,rotation,flip,colorSpace:Object.freeze(slot(chosenColor.value)),bytes:copied.bytes,closed:false});states.set(value,state);registerPlatformFactory(value,{kind:'VideoFrame',implementation:state,globalObject:realm,read:()=>videoFrameRecord(value)});return{ok:true};
  },
  read(value,key){const s=states.get(value);if(key==='closed')return s.closed;if(s.closed)return key==='timestamp'||key==='duration'?s[key]:key==='format'?null:key==='flip'?false:0;if(key==='displayWidth')return s.rotation%180?s.baseDisplayHeight:s.baseDisplayWidth;if(key==='displayHeight')return s.rotation%180?s.baseDisplayWidth:s.baseDisplayHeight;return['format','codedWidth','codedHeight','storageWidth','storageHeight','timestamp','duration','rotation','flip'].includes(key)?s[key]:undefined},
  color(value){const s=states.get(value);return s.closed?slot({primaries:null,transfer:null,matrix:null,fullRange:null}):slot(s.colorSpace)},
  open:value=>states.get(value).closed?failure('InvalidStateError','The object is in an invalid state'):{ok:true},
  allocation(value,options){const r=selected(value,options);return r.ok?{ok:true,size:r.size}:r},
  copy(value,destination,options){const r=selected(value,options);if(!r.ok)return r;const s=r.state,from=FORMATS[s.format],to=FORMATS[r.format];if(s.format!==r.format&&!(from.rgb&&to.rgb))return failure('NotSupportedError','The operation is not supported');const dest=byteView(destination);if(dest.length<r.size)return failure();const input=layout(s.format,s.storageWidth,s.storageHeight);
   if(s.format===r.format){for(let i=0;i<r.output.planes.length;i++){const a=input.planes[i],b=r.output.planes[i];for(let row=0;row<b.rows;row++){const start=a.offset+(Math.floor(r.rect.y/a.y)+row)*a.stride+Math.floor(r.rect.x/a.x)*a.unit;dest.set(s.bytes.subarray(start,start+b.row),b.offset+row*b.stride)}}}
   else{const a=input.planes[0],b=r.output.planes[0],swap=s.format[0]!==r.format[0],opaque=!from.alpha||!to.alpha;for(let y=0;y<r.rect.height;y++)for(let x=0;x<r.rect.width;x++){const src=a.offset+(r.rect.y+y)*a.stride+(r.rect.x+x)*4,target=b.offset+y*b.stride+x*4;dest[target]=s.bytes[src+(swap?2:0)];dest[target+1]=s.bytes[src+1];dest[target+2]=s.bytes[src+(swap?0:2)];dest[target+3]=opaque?255:s.bytes[src+3]}}
   return{ok:true,layout:r.output.planes.map(p=>({offset:p.offset,stride:p.stride}))};
  },
  clone(value){const s=states.get(value);if(s.closed)return failure('InvalidStateError','The object is in an invalid state');const token=Object.create(null);tokens.set(token,{realm,record:videoFrameRecord(value)});return{ok:true,value:api.construct(token)}},
  hydrate(value,token){const entry=tokens.get(token);if(!entry||entry.realm!==realm)return failure();tokens.delete(token);const r=entry.record;if(!validVideoFrameRecord(r))return failure();const state=slot({...r,colorSpace:Object.freeze(slot(r.colorSpace)),bytes:r.bytes.slice(),closed:false});states.set(value,state);registerPlatformFactory(value,{kind:'VideoFrame',implementation:state,globalObject:realm,read:()=>videoFrameRecord(value)});return{ok:true}},
  close(value){const s=states.get(value);s.closed=true;s.bytes=null},
 });installed.set(realm,api);return api;
}
export function videoFrameRecord(value){const s=states.get(value);if(!s)return null;if(s.closed)return{kind:'VideoFrame',closed:true,timestamp:s.timestamp,duration:s.duration};return{kind:'VideoFrame',closed:false,format:s.format,codedWidth:s.codedWidth,codedHeight:s.codedHeight,storageWidth:s.storageWidth,storageHeight:s.storageHeight,baseDisplayWidth:s.baseDisplayWidth,baseDisplayHeight:s.baseDisplayHeight,timestamp:s.timestamp,duration:s.duration,rotation:s.rotation,flip:s.flip,colorSpace:slot(s.colorSpace),bytes:s.bytes.slice()}}
export function validVideoFrameRecord(r){if(r?.kind!=='VideoFrame'||r.closed||!FORMATS[r.format]||!Number.isInteger(r.codedWidth)||r.codedWidth<=0||!Number.isInteger(r.codedHeight)||r.codedHeight<=0||!Number.isSafeInteger(r.timestamp)||r.duration!==null&&(!Number.isSafeInteger(r.duration)||r.duration<0)||!types.isUint8Array(r.bytes)||r.bytes.length>MAX_BYTES)return false;if(!Number.isInteger(r.storageWidth)||r.storageWidth<=0||r.storageWidth>r.codedWidth||!Number.isInteger(r.storageHeight)||r.storageHeight<=0||r.storageHeight>r.codedHeight)return false;if(!Number.isInteger(r.baseDisplayWidth)||r.baseDisplayWidth<=0||r.baseDisplayWidth>4294967295||!Number.isInteger(r.baseDisplayHeight)||r.baseDisplayHeight<=0||r.baseDisplayHeight>4294967295||![0,90,180,270].includes(r.rotation)||typeof r.flip!=='boolean'||!r.colorSpace)return false;const c=color(r.colorSpace,r.format);if(!c.ok)return false;const l=layout(r.format,r.storageWidth,r.storageHeight);return l.ok&&l.size===r.bytes.length}
export function deserializeVideoFrame(realm,r){const api=installed.get(realm);if(!api||!validVideoFrameRecord(r))throw new TypeError('Invalid VideoFrame receiver');const token=Object.create(null);tokens.set(token,{realm,record:r});return api.construct(token)}
