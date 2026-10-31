// Realm-local public geometry over the same authoritative private layout and
// canonical DOM nodes used by privileged input. No DOM or layout is copied.
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { canonicalUtilityValue } from './isolated-world.js';
import { nodeIdentity } from './remote-values.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js');
export function utilityLayoutFor(page,value) {
  const node=canonicalUtilityValue(value),identity=nodeIdentity(node);
  if(!identity||identity.nodeType!==1)throw new TypeError('Illegal invocation');
  const document=identity.ownerDocument;
  const registry=page.registry??page.frames;
  const owner=registry?.findDocument?.(document)??[...(registry?.frames.values()??[page])].find(candidate=>candidate.dom.window.document===document)??page;
  return {node,document,layout:owner.layout};
}
function geometryFactory(g,bridge) {
  const TypeError=g.TypeError,Error=g.Error,ArrayConstructor=g.Array,set=g.Reflect.set;
  const element=value=>{if (!bridge.isElement(value)) throw new TypeError('Illegal invocation');return value;};
  const rect=value=>bridge.createRect(value);
  const methods={
    getBoundingClientRect(){return rect(bridge.rect(element(this)));},
    getClientRects(){const values=bridge.rects(element(this)),result=new ArrayConstructor(values.length);try{for(let i=0;i<values.length;i++)set(result,i,rect(values[i]));}catch{throw new Error('FailedToCreateArray')}return result;},
    scrollIntoView(){bridge.scrollIntoView(element(this));},
    scrollIntoViewIfNeeded(){bridge.scrollIntoView(element(this));},
  };
  for(const[name,value]of Object.entries(methods))Object.defineProperty(Element.prototype,name,{value,writable:true,configurable:true,enumerable:true});
  for(const name of ['clientWidth','clientHeight','scrollWidth','scrollHeight'])Object.defineProperty(Element.prototype,name,{configurable:true,enumerable:true,get(){return bridge.dimension(element(this),name);}});
  for(const name of ['offsetWidth','offsetHeight','offsetTop','offsetLeft'])Object.defineProperty(HTMLElement.prototype,name,{configurable:true,enumerable:true,get(){return bridge.dimension(element(this),name);}});
  for(const name of ['innerWidth','innerHeight','scrollX','scrollY','pageXOffset','pageYOffset'])Object.defineProperty(g,name,{configurable:true,enumerable:true,get(){return bridge.viewport(name);}});
}
export function installUtilityLayout(page,world,main=page.dom.window) {
  const bridge={
    createRect:value=>world.createDOMRect(value),
    isElement:value=>nodeIdentity(canonicalUtilityValue(value))?.nodeType===1,
    rect:value=>{const{node,layout}=utilityLayoutFor(page,value);return layout.rect(node);},
    rects:value=>{const{node,layout}=utilityLayoutFor(page,value);return layout.rects(node);},
    scrollIntoView:value=>{const{node,layout}=utilityLayoutFor(page,value);layout.scrollIntoView(node);},
    dimension(value,name){const{node,document,layout}=utilityLayoutFor(page,value);const root=utils.implForWrapper(node)===utils.implForWrapper(document).documentElement;
      const axis=name.endsWith('Width')?'width':'height';
      if(name.startsWith('client'))return root?layout.viewport[axis]:layout.dimension(node,axis);
      if(name.startsWith('scroll'))return root?layout.documentSize[axis]:axis==='width'?layout.scrollWidth(node):layout.scrollHeight(node);
      if(name==='offsetTop')return layout.absoluteRect(node).y;if(name==='offsetLeft')return layout.absoluteRect(node).x;
      return layout.dimension(node,axis);},
    viewport(name){const layout=page.layout;if(name==='innerWidth')return layout.viewport.width;if(name==='innerHeight')return layout.viewport.height;return ['scrollX','pageXOffset'].includes(name)?layout.scroll.x:layout.scroll.y;},
  };
  vm.compileFunction(`(${geometryFactory.toString()})(globalThis,bridge)`,['bridge'],{parsingContext:world.context})(bridge);
}
