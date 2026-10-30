import{resolveFlowLength}from './flow-metrics.js';
// Independent horizontal model of the measured headless native layout. Intrinsic
// advances, used box widths and scrollable extents are deliberately separate:
// the target does not implement a general CSS rendering/layout engine.
import {createRequire} from 'node:module';
import {hasSpecifiedStyle,getSpecifiedStyle} from './styles.js';
const require=createRequire(import.meta.url);
const {implForWrapper,wrapperForImpl}=require('jsdom/lib/jsdom/living/generated/utils.js');
const {domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const blocks=new Set(['block','flow-root','flex','grid','list-item']);
const replaced=new Set(['img','input','textarea','select','button','video','audio','canvas','iframe','object','embed']);
const clipped=value=>value&&!['visible','clip'].includes(value);

function physicalParent(node){const impl=implForWrapper(node);return impl?._assignedSlot?wrapperForImpl(impl._assignedSlot):node.parentElement??node.getRootNode().host??null;}
function visualChildren(node){const impl=implForWrapper(node);if(impl?._shadowRoot)return Array.from(domSymbolTree.childrenIterator(impl._shadowRoot)).filter(child=>child.nodeType===1).map(wrapperForImpl);if(node.localName==='slot'&&impl?._assignedNodes?.length)return impl._assignedNodes.filter(n=>n.nodeType===1).map(wrapperForImpl);return impl?Array.from(domSymbolTree.childrenIterator(impl)).filter(child=>child.nodeType===1).map(wrapperForImpl):[];}
export function rawTranslation(value){let x=0;for(const match of String(value??'').matchAll(/([\w-]+)\(([^()]*)\)/g)){const name=match[1].toLowerCase(),args=match[2].trim().split(/\s*,\s*|\s+/);let part;if(name==='matrix'&&args.length===6)part=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(args[4])?Number(args[4]):undefined;else if(name==='matrix3d'&&args.length===16)part=Number(args[12]);else if((name==='translatex'&&args.length===1)||(name==='translate'&&args.length<=2)||(name==='translate3d'&&args.length===3)){const token=args[0];if(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)px$/i.test(token)||/^[+-]?0(?:\.0+)?$/.test(token))part=Number.parseFloat(token);}if(Number.isFinite(part))x+=part;}return x;}

export function createHorizontalLayout(window,{style,hidden,viewportWidth,styleRevision}){
 const length=(value,basis)=>resolveFlowLength(value,{width:viewportWidth,height:window.innerHeight},basis);
 const widths=new WeakMap(),intrinsics=new WeakMap(),floors=new WeakMap(),allocations=new WeakMap(),scrolls=new WeakMap(),advances=new WeakMap();
 const css=node=>style(node),outOfFlow=node=>['absolute','fixed'].includes(css(node).position),isFlex=node=>['flex','inline-flex'].includes(css(node).display),isRow=node=>isFlex(node)&&!String(css(node).flexDirection).startsWith('column');
 const childLists=new WeakMap();
 function children(node){if(childLists.has(node))return childLists.get(node);const result=[];for(const child of visualChildren(node)){if(hidden(child)||outOfFlow(child))continue;if(css(child).display==='contents')result.push(...children(child));else result.push(child);}childLists.set(node,result);return result;}
 function layoutParent(node){let p=physicalParent(node);while(p&&css(p).display==='contents')p=physicalParent(p);return p;}
 function isItem(node){const p=layoutParent(node);return p&&(isFlex(p)||['grid','inline-grid'].includes(css(p).display))&&!outOfFlow(node);}
 function isContainer(node){const s=css(node);return s.display!=='contents'&&(s.display!=='inline'||(s.float&&s.float!=='none')||outOfFlow(node)||isItem(node));}
 function containingBlock(node){for(let p=physicalParent(node);p;p=physicalParent(p))if(isContainer(p))return p;return null;}
 function margins(node,basis){const s=css(node);return(length(s.marginLeft,basis)??0)+(length(s.marginRight,basis)??0);}
 function clamp(node,value,basis){const s=css(node),min=length(s.minWidth,basis)??0,max=length(s.maxWidth,basis);return Math.max(min,Math.min(max??Infinity,Math.max(0,value)));}
 function content(node,measure){let maximum=0,line=0;const row=isRow(node);for(const child of children(node)){const v=measure(child);if(!row&&blocks.has(css(child).display)){maximum=Math.max(maximum,line,v);line=0;}else line+=v;}return Math.max(maximum,line);}
 function intrinsic(node,floor=false){if(hidden(node))return 0;const cache=floor?floors:intrinsics;if(cache.has(node))return cache.get(node);const s=css(node);let value=length(s.width);if(value===undefined){if(floor&&clipped(s.overflowX))value=5;else value=Math.max(5,content(node,child=>intrinsic(child,floor)+margins(child)));}value=clamp(node,value);cache.set(node,value);return value;}
 function baseWidth(node,basis){const s=css(node),fixed=length(s.width,basis);return clamp(node,fixed??intrinsic(node),basis);}
 function allocate(row){if(allocations.has(row))return allocations.get(row);const result=new WeakMap();allocations.set(row,result);const available=width(row),items=children(row),bases=items.map(item=>{const s=css(item),grow=Math.max(0,Number.parseFloat(s.flexGrow)||0),explicit=length(s.width,available);return {node:item,grow,shrink:s.flexShrink!=='0',base:grow>0&&explicit===undefined?0:baseWidth(item,available),margin:margins(item,available),floor:hasSpecifiedStyle(item,'min-width',styleRevision)||clipped(s.overflowX)?0:content(item,child=>intrinsic(child,true)+margins(child))||5};});
  let free=available-bases.reduce((sum,item)=>sum+item.base+item.margin,0);const totalGrow=bases.reduce((sum,item)=>sum+item.grow,0);const sizes=bases.map(item=>item.base);
  if(free>0&&totalGrow)for(let i=0;i<bases.length;i++)sizes[i]+=free*bases[i].grow/totalGrow;
  else if(free<0&&!['wrap','wrap-reverse'].includes(css(row).flexWrap)){
   let active=bases.map((item,i)=>item.shrink&&item.base>item.floor?i:-1).filter(i=>i>=0),deficit=-free;
   for(let pass=0;active.length&&deficit>1e-9&&pass<=bases.length;pass++){
    const total=active.reduce((sum,i)=>sum+bases[i].base,0);if(!total)break;let removed=0;
    for(const i of active){const amount=Math.min(sizes[i]-bases[i].floor,deficit*bases[i].base/total);sizes[i]-=amount;removed+=amount;}
    deficit-=removed;active=active.filter(i=>sizes[i]>bases[i].floor+1e-9);if(!removed)break;
   }
  }
  for(let i=0;i<bases.length;i++){const item=bases[i];let value=sizes[i];if(item.grow&&value<=0)value=intrinsic(item.node);result.set(item.node,clamp(item.node,value,available));}return result;
 }
 function width(node){if(widths.has(node))return widths.get(node);if(hidden(node)){widths.set(node,0);return 0;}const s=css(node);if(s.display==='contents'){widths.set(node,0);return 0;}if(node===window.document.documentElement||node===window.document.body){const value=length(s.width,viewportWidth)??viewportWidth;widths.set(node,value);return value;}
  const parent=layoutParent(node);if(parent&&isRow(parent)&&!outOfFlow(node)){const value=allocate(parent).get(node);if(value!==undefined){widths.set(node,value);return value;}}
  const cb=containingBlock(node),basis=cb?width(cb):viewportWidth,explicit=length(s.width,basis);let value=explicit;
  if(value===undefined){const shrink=replaced.has(node.localName)||['inline','inline-block','inline-flex','inline-grid','table','inline-table'].includes(s.display)||(s.float&&s.float!=='none')||outOfFlow(node)||['max-content','min-content','fit-content'].includes(s.width);value=shrink?intrinsic(node):Math.max(0,basis-margins(node,basis));}
  value=clamp(node,value,basis);widths.set(node,value);return value;
 }
 function advance(node){if(advances.has(node))return advances.get(node);const value=hidden(node)?0:length(css(node).width)??5;advances.set(node,value);return value;}
 function scroll(node){if(scrolls.has(node))return scrolls.get(node);if(hidden(node))return 0;const own=width(node);if(node===window.document.body||node===window.document.documentElement)return own;const basis=own||undefined;const extent=content(node,child=>{const s=css(child),nominal=length(s.width,basis)??width(child),overflow=clipped(s.overflowX)?nominal:scroll(child);return Math.max(nominal,overflow)+margins(child,basis);});const value=Math.max(own,extent);scrolls.set(node,value);return value;}
 function translation(node){return rawTranslation(getSpecifiedStyle(node,'transform',styleRevision)??'none');}
 return{width,intrinsic,advance,scroll,translation};
}
