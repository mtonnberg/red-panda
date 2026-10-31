// Genuine per-element state writes, conversion and event scheduling. The
// original Element implementation owns offsets; no alternate front is made.
import{resolveFlowLength}from'./flow-metrics.js';
import{platformFactoryRecord}from'./platform-factories.js';
import{queueElementScroll}from'./scroll-events.js';
import{createRequire}from'node:module';
const require=createRequire(import.meta.url),conversions=require('webidl-conversions'),utils=require('jsdom/lib/jsdom/living/generated/utils.js'),ElementImpl=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation;
const ordinaryHasInstance=Function.prototype[Symbol.hasInstance],apply=Reflect.apply;
const installed=new WeakSet(),has=(value,key)=>value!=null&&key in value?value[key]:undefined;
function interfaces(bridge){'use strict';return{scroll:function scroll(){bridge.perform(this,arguments,false)},scrollTo:function scrollTo(){bridge.perform(this,arguments,false)},scrollBy:function scrollBy(){bridge.perform(this,arguments,true)},top:Object.getOwnPropertyDescriptor({get scrollTop(){return bridge.read(this,'top')},set scrollTop(value){bridge.set(this,'top',value)}},'scrollTop'),left:Object.getOwnPropertyDescriptor({get scrollLeft(){return bridge.read(this,'left')},set scrollLeft(value){bridge.set(this,'left',value)}},'scrollLeft')}}
export function installElementScroll(window,ownerLayout,{evaluate=source=>window.eval(source)}={}){
 if(installed.has(window.Element.prototype))return;installed.add(window.Element.prototype);
 const intrinsics={TypeError:window.TypeError,Number:window.Number,String:window.String},integer=value=>conversions.long(value,{globals:intrinsics}),string=value=>conversions.DOMString(value,{globals:intrinsics});
 const brand=value=>{const impl=platformFactoryRecord(value)?.implementation;if(!apply(ordinaryHasInstance,ElementImpl,[impl]))throw new intrinsics.TypeError('Illegal invocation');return impl};
 const read=(impl,axis)=>ownerLayout(impl)?impl[axis==='left'?'scrollLeft':'scrollTop']:0;
 const clamp=(impl,value,axis)=>{value=Math.min(4294967295,Math.max(0,value));const layout=ownerLayout(impl);if(!layout)return 0;const node=utils.wrapperForImpl(impl),doc=impl._ownerDocument;if(impl===doc.documentElement||impl===doc.body)return value;const css=layout.rawComputedStyle(node),explicit=resolveFlowLength(css[axis==='left'?'width':'height'],layout.viewport);if(explicit!==undefined){const extent=axis==='left'?layout.scrollWidth(node):layout.scrollHeight(node),size=layout.dimension(node,axis==='left'?'width':'height');if(extent>size)value=Math.min(value,Math.max(0,Math.floor(extent-size)))}return value};
 const write=(impl,x,y)=>{if(!ownerLayout(impl))return;const oldX=impl.scrollLeft,oldY=impl.scrollTop;if(x!==undefined)impl.scrollLeft=clamp(impl,x,'left');if(y!==undefined)impl.scrollTop=clamp(impl,y,'top');if(oldX!==impl.scrollLeft||oldY!==impl.scrollTop)queueElementScroll(impl)};
 const bridge={read(value,axis){return read(brand(value),axis)},set(value,axis,next){const impl=brand(value),number=integer(next);write(impl,axis==='left'?number:undefined,axis==='top'?number:undefined)},perform(value,args,relative){const impl=brand(value);let x,y;const first=args[0];if(first!=null&&(typeof first==='object'||typeof first==='function')){const behavior=has(first,'behavior');if(behavior!==undefined)string(behavior);const left=has(first,'left'),top=has(first,'top');if(left!==undefined)x=integer(left);if(top!==undefined)y=integer(top);if(args[1]!=null)integer(args[1])}else if(first!=null){x=integer(first);y=args[1]==null?0:integer(args[1])}else if(args[1]!=null)integer(args[1]);if(relative){if(x!==undefined)x+=read(impl,'left');if(y!==undefined)y+=read(impl,'top')}write(impl,x,y)}};
 const methods=evaluate('('+interfaces.toString()+')')(bridge),proto=window.Element.prototype;
 for(const name of['scroll','scrollTo','scrollBy'])Object.defineProperty(proto,name,{value:methods[name],writable:true,enumerable:true,configurable:true});
 for(const[name,key]of[['scrollTop','top'],['scrollLeft','left']])Object.defineProperty(proto,name,{...methods[key],enumerable:true,configurable:true});
}
