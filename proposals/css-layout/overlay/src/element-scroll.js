// Real Element scroll state is kept in the pinned DOM implementation. Clamp
// only axes with resolvable explicit sizes, matching the native surrogate.
import {resolveFlowLength} from './flow-metrics.js';
function interfaces(window,bridge){
 const number=value=>{const n=Number(value);return Number.isFinite(n)?n:0};
 function perform(element,x,y,relative){bridge.brand(element);const current=bridge.read(element);let left=current.left,top=current.top;if(x!==null&&typeof x==='object'){if(x.left!==undefined)left=(relative?left:0)+number(x.left);if(x.top!==undefined)top=(relative?top:0)+number(x.top);}else{if(x!==undefined)left=(relative?left:0)+number(x);if(y!==undefined)top=(relative?top:0)+number(y);}bridge.write(element,left,top);}
 return{scroll:function scroll(x=undefined,y=undefined){perform(this,x,y,false)},scrollTo:function scrollTo(x=undefined,y=undefined){perform(this,x,y,false)},scrollBy:function scrollBy(x=undefined,y=undefined){perform(this,x,y,true)}};
}
export function installElementScroll(window,ownerLayout){
 const proto=window.Element.prototype,top=Object.getOwnPropertyDescriptor(proto,'scrollTop'),left=Object.getOwnPropertyDescriptor(proto,'scrollLeft');
 const clamp=(element,value,axis)=>{value=Number.isFinite(value)?Math.max(0,value):0;const layout=ownerLayout(element),css=layout.rawComputedStyle(element),explicit=resolveFlowLength(css[axis==='left'?'width':'height'],layout.viewport);if(explicit!==undefined){const extent=axis==='left'?layout.scrollWidth(element):layout.scrollHeight(element),size=layout.dimension(element,axis==='left'?'width':'height');value=Math.min(value,Math.max(0,extent-size));}return value;};
 const bridge={brand:element=>top.get.call(element),read:element=>({top:top.get.call(element),left:left.get.call(element)}),write(element,x,y){left.set.call(element,clamp(element,x,'left'));top.set.call(element,clamp(element,y,'top'));}};
 for(const[axis,descriptor]of[['top',top],['left',left]])Object.defineProperty(proto,axis==='top'?'scrollTop':'scrollLeft',{...descriptor,set(value){descriptor.set.call(this,value);descriptor.set.call(this,clamp(this,descriptor.get.call(this),axis));}});
 const methods=window.eval(`(${interfaces.toString()})`)(window,bridge);for(const[name,value]of Object.entries(methods))Object.defineProperty(proto,name,{configurable:true,enumerable:true,writable:true,value});
}
