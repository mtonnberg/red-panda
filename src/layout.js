import{installWindowViewport}from'./window-viewport.js';
import{installScrollEvents}from'./scroll-events.js';
import {registerHeapWrapper} from './heap-registry.js';
import{installElementScroll}from './element-scroll.js';
import {resolveFlowLength,nativeTextHeight} from './flow-metrics.js';
import {createHorizontalLayout} from './horizontal-layout.js';
import {refreshMediaQueries} from './media.js';
// Independent surrogate geometry for a headless DOM. This intentionally models
// the reference's measured simple boxes; it is not a CSS layout renderer.
import { getStyleRevision, getLayoutStyle, getLayoutCacheRevision, getSpecifiedStyle } from './styles.js';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const RectFactory=require('jsdom/lib/jsdom/living/generated/DOMRect.js');
const ElementInterface=require('jsdom/lib/jsdom/living/generated/Element.js');
const {domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const { implForWrapper, wrapperForImpl } = require('jsdom/lib/jsdom/living/generated/utils.js');
const LAYOUTS=new WeakMap(),COMPUTED_VIEWS=new WeakMap();
const ZERO = Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
const hiddenTags = new Set(['head', 'style', 'script', 'template', 'meta', 'link', 'title', 'base']);
const blockTags = new Set(['html', 'body', 'div', 'p', 'main', 'section', 'article', 'aside', 'nav', 'header', 'footer', 'form', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote']);

function dimension(value) {
  if (typeof value !== 'string' || !/^(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/i.test(value.trim())) return undefined;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? Math.max(0, number) : undefined;
}

function rectValue(x, y, width, height) {
  return { x, y, width, height, top: y, left: x, right: x + width, bottom: y + height };
}

function optionDimension(value, name) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be a positive finite number`);
  return value;
}

export function createLayout(window, options = {}) {
  const rawComputedStyle = options.getComputedStyle ?? window.getComputedStyle.bind(window);
  let width = optionDimension(options.width ?? 1920, 'Viewport width');
  let height = optionDimension(options.height ?? 1080, 'Viewport height');
  let scrollX = 0, scrollY = 0, scrollObserver, viewportObserver;
  let cachedKey, cached, cachedFastKey;
  const dimension=value=>resolveFlowLength(value,{width,height});
  const identities = new WeakMap();
  let nextIdentity = 1;

  function snapshot() {
    const document = window.document;
    const styleRevision=getLayoutCacheRevision(window),fastKey=styleRevision===undefined?null:JSON.stringify([styleRevision,implForWrapper(document)._version,width,height]);
    if(fastKey!==null&&cachedFastKey===fastKey)return cached;
    const nodes = [], order = new Map(), computed = new Map(), hidden = new Map(), sizes = new Map(), positions = new Map();
    const childNodeLists=new Map(),childElementLists=new Map();
    const children=node=>{let list=childNodeLists.get(node);if(!list){list=Array.from(domSymbolTree.childrenIterator(implForWrapper(node)),wrapperForImpl);childNodeLists.set(node,list);}return list;};
    const elements=node=>{let list=childElementLists.get(node);if(!list){list=children(node).filter(child=>child.nodeType===1);childElementLists.set(node,list);}return list;};
    const documentImpl=implForWrapper(document),shadowRoots=[],tokens=fastKey===null?[width,height,styleRevision??getStyleRevision(window)]:null;
    const appendTree=root=>{
      for(const implementation of domSymbolTree.treeIterator(root)){
        if(implementation.nodeType===11)continue;
        const node=wrapperForImpl(implementation);
        order.set(node,nodes.length);nodes.push(node);
        if(tokens){
          if(!identities.has(node))identities.set(node,nextIdentity++);
          tokens.push(identities.get(node),node.nodeType,node.nodeValue);
          if(node.attributes)tokens.push([...node.attributes].flatMap(attribute=>[attribute.name,attribute.value]));
        }
        if(implementation._shadowRoot)shadowRoots.push(implementation._shadowRoot);
      }
    };
    appendTree(documentImpl);for(let index=0;index<shadowRoots.length;index++)appendTree(shadowRoots[index]);
    if(tokens)for(const sheet of document.styleSheets){try{tokens.push([...sheet.cssRules].map(rule=>rule.cssText));}catch{tokens.push(null);}}
    const key=fastKey??JSON.stringify(tokens);
    if(key===cachedKey)return cached;
    let documentHeight = nodes.length * 5;
    const style = node => {
      if(!computed.has(node)){const projected=getLayoutStyle(node,styleRevision);if(projected)computed.set(node,projected);else{const raw=rawComputedStyle(node);computed.set(node,new Proxy(raw,{get(target,key){if(key==='display')return target.display||'inline';if(key==='float')return target.float||'none';if(key==='position')return target.position||'static';return Reflect.get(target,key,target);}}));}}
      return computed.get(node);
    };
    function isHidden(node) {
      if (hidden.has(node)) return hidden.get(node);
      const implementation=implForWrapper(node),ordinaryParent=node.parentNode;
      const assigned=implementation?._assignedSlot;
      const parent=assigned?wrapperForImpl(assigned):ordinaryParent??node.host;
      const outsideFlatTree=ordinaryParent?.nodeType===1&&!assigned&&(implForWrapper(ordinaryParent)._shadowRoot||(ordinaryParent.localName==='slot'&&implForWrapper(ordinaryParent)._assignedNodes?.length));
      const ancestorHidden = parent && isHidden(parent);
      const ownHidden = node.nodeType === 1 && (hiddenTags.has(node.localName) || style(node).display === 'none');
      const result = Boolean(ancestorHidden || ownHidden || outsideFlatTree);
      hidden.set(node, result); return result;
    }
    const textHeight=node=>{const declaration=style(node),fontSize=Number.parseFloat(declaration.fontSize),collapse=getSpecifiedStyle(node,'white-space-collapse');return nativeTextHeight(children(node).filter(child=>child.nodeType===3).map(child=>child.data).join(''),dimension(declaration.width),Number.isFinite(fontSize)?fontSize:16,declaration.textWrap==='nowrap'||declaration.textWrapMode==='nowrap',{whiteSpace:declaration.whiteSpace,collapse:typeof collapse==='object'?collapse.value:collapse});};
    const horizontal=createHorizontalLayout(window,{style,hidden:isHidden,viewportWidth:width,styleRevision});
    function size(node) {
      if (sizes.has(node)) return sizes.get(node);
      let value;
      if (isHidden(node) || ![1, 3, 9].includes(node.nodeType)) value = ZERO;
      else if (node.nodeType === 3) value = /\S/.test(node.data) ? { width: 5, height: 5 } : { width: 0, height: 5 };
      else if (node.nodeType === 9) value = { width, height: documentHeight };
      else {
        const declaration = style(node);
        const explicitWidth = dimension(declaration.width);
        const explicitHeight = dimension(declaration.height);
        let childHeight = 0;
        for(const child of elements(node))if(!isHidden(child))childHeight+=dimension(style(child).height)??5;
        childHeight = Math.max(5, childHeight,textHeight(node));
        let advance = 0;
        for (const child of children(node)) advance += sizes.get(child)?.advance ?? sizes.get(child)?.width ?? 0;
        advance = explicitWidth ?? Math.max(5, advance);
        const block = blockTags.has(node.localName) && !['inline', 'inline-block'].includes(declaration.display);
        value = {
          advance: horizontal.advance(node),
          width: horizontal.width(node),
          height: explicitHeight ?? (node===document.documentElement||node===document.body ? documentHeight : childHeight),
        };
      }
      sizes.set(node, value); return value;
    }
    const siblingAdvances=new Map();
    function siblingAdvance(node){
      if(siblingAdvances.has(node))return siblingAdvances.get(node);
      const parent=domSymbolTree.parent(implForWrapper(node));if(!parent)return 0;
      let sum=0;
      for(const implementation of domSymbolTree.childrenIterator(parent)){
        const sibling=wrapperForImpl(implementation);siblingAdvances.set(sibling,sum);
        if(isHidden(sibling))continue;
        if(sibling.nodeType===1)sum+=horizontal.advance(sibling);
      }
      return siblingAdvances.get(node)??0;
    }
    function position(node) {
      if (positions.has(node)) return positions.get(node);
      if (isHidden(node)) { positions.set(node, ZERO); return ZERO; }
      const parent = node.parentNode ?? node.host;
      const parentX = parent ? position(parent).x : 0;
      let x = parentX;
      x+=siblingAdvance(node);
      if(node.nodeType===1)x+=horizontal.translation(node);
      const value = rectValue(x, (order.get(node)??order.get(node.host)??0) * 5, size(node).width, size(node).height);
      positions.set(node, value); return value;
    }

    // Native document extents differ from individual computed boxes. The
    // measured root uses inline child advances and nested inline overflow;
    // stylesheet-only dimensions still affect individual element rectangles.
    let directHeight = 0;
    for (const child of document.body?children(document.body):[]) {
      if (!isHidden(child)) directHeight += dimension(child.style?.height) ?? 5;
    }
    documentHeight = Math.max(documentHeight, directHeight, dimension(document.body?.style.height)??0);
    for (const node of nodes) {
      const inlineHeight = dimension(node.style?.height);
      if (inlineHeight !== undefined && !isHidden(node) && node.parentNode !== document.body && !['html', 'body'].includes(node.localName)) {
        documentHeight = Math.max(documentHeight, order.get(node) * 5 + inlineHeight);
      }
    }

    function record(node) {
      if (!order.has(node) || isHidden(node)) return { rect: rectValue(0, 0, 0, 0), rendered: false };
      return { rect: position(node), rendered: true };
    }
    cachedKey = key;cachedFastKey=fastKey;
    cached = { nodes, style, record, horizontal, isRendered:node=>order.has(node)&&!isHidden(node),dimension(node,axis){return order.has(node)&&!isHidden(node)?size(node)[axis]:0;}, contentHeight(node){let sum=0;for(const child of elements(node))if(!isHidden(child))sum+=dimension(style(child).height)??5;return Math.max(size(node).height,sum,textHeight(node));}};
    return cached;
  }

  function viewportRect(value) { return rectValue(value.x - scrollX, value.y - scrollY, value.width, value.height); }
  function rect(node) { const value = snapshot().record(node); return value.rendered ? viewportRect(value.rect) : value.rect; }
  function rects(node) { const value = snapshot().record(node); return value.rendered ? [viewportRect(value.rect)] : []; }
  function quads(node) {
    const value = rect(node);
    return [[value.left, value.top, value.right, value.top, value.right, value.bottom, value.left, value.bottom]];
  }
  function boxModel(node) {
    const value = rect(node), quad = [value.left, value.top, value.right, value.top, value.right, value.bottom, value.left, value.bottom];
    return { content: [...quad], padding: [...quad], border: [...quad], margin: [...quad], width: Math.trunc(value.width), height: Math.trunc(value.height) };
  }
  function elementsFromPoint(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= width || y >= height) return [];
    const state = snapshot();
    return state.nodes.filter(node => {
      if (node.nodeType !== 1) return false;
      // Document hit testing retargets shadow content to its host. Shadow
      // rectangles remain available to privileged geometry/observer consumers.
      if (node.getRootNode() !== window.document) return false;
      const record = state.record(node), { rendered } = record, box = viewportRect(record.rect);
      const declaration = state.style(node);
      return rendered && declaration.visibility !== 'hidden' && declaration.visibility !== 'collapse' && declaration.pointerEvents !== 'none' &&
        box.width > 0 && box.height > 0 && x >= box.left && x < box.right && y >= box.top && y < box.bottom;
    }).reverse();
  }
  function hitTest(x, y) { return elementsFromPoint(x, y)[0] ?? null; }
  function intersection(node) {
    const bounds = rect(node);
    const left = Math.max(0, bounds.left), top = Math.max(0, bounds.top);
    const right = Math.min(width, bounds.right), bottom = Math.min(height, bounds.bottom);
    const intersectionRect = rectValue(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
    const area = bounds.width * bounds.height;
    const isIntersecting = area > 0 && intersectionRect.width > 0 && intersectionRect.height > 0;
    return { boundingClientRect: bounds, intersectionRect, rootBounds: rectValue(0, 0, width, height), isIntersecting,
      intersectionRatio: area > 0 ? intersectionRect.width * intersectionRect.height / area : 0 };
  }
  function scrollAxes(x, y) {
    const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const extent = documentSize();
    const nextX = x===undefined?scrollX:Math.min(Math.max(0, number(x)), Math.max(0, extent.width - width));
    const nextY = y===undefined?scrollY:Math.min(Math.max(0, number(y)), Math.max(0, extent.height - height));
    const changed = nextX !== scrollX || nextY !== scrollY;
    scrollX = nextX; scrollY = nextY;
    if (changed) scrollObserver?.();
  }
  function scrollTo(x=0,y=0){scrollAxes(x,y)}
  function scrollIntoView(node, region) {
    const value = snapshot().record(node);
    if (!value.rendered) return;
    const box = rect(node);
    const offset = region?.y ?? 0, regionHeight = region?.height ?? box.height;
    if (box.top + offset < 0 || box.top + offset + regionHeight > height) scrollTo(scrollX, value.rect.y + offset);
  }
  function documentSize() {
    const state = snapshot();
    let documentWidth = width;
    for (const node of state.nodes) documentWidth = Math.max(documentWidth, state.record(node).rect.width);
    return { width: documentWidth,
      height: Math.max(height, state.record(window.document.documentElement).rect.height) };
  }
  return {
    rect, rects, quads, boxModel, elementsFromPoint, hitTest, intersection, scrollTo, scrollAxes, scrollIntoView,
    setScrollObserver(value){scrollObserver=value},setViewportObserver(value){viewportObserver=value},
    absoluteRect:node=>snapshot().record(node).rect,
    dimension:(node,axis)=>snapshot().dimension(node,axis),
    rendered:node=>snapshot().isRendered(node),
    scrollWidth:node=>snapshot().nodes.includes(node)?snapshot().horizontal.scroll(node):0,
    scrollHeight:node=>snapshot().nodes.includes(node)&&snapshot().record(node).rendered?snapshot().contentHeight(node):0,
    scrollBy(x, y) { scrollTo(scrollX + Number(x || 0), scrollY + Number(y || 0)); },
    get scroll() { return { x: scrollX, y: scrollY }; },
    get documentSize() { return documentSize(); },
    get viewport() { return { width, height }; },
    setViewport(viewport) {
      const nextWidth = optionDimension(viewport.width ?? width, 'Viewport width');
      const nextHeight = optionDimension(viewport.height ?? height, 'Viewport height');
      width = nextWidth; height = nextHeight; viewportObserver?.(); refreshMediaQueries(window);
    },
    // Used by the window adapter without recursively reading its own overrides.
    rawComputedStyle,
  };
}

function clientRectList(ArrayConstructor,set,ErrorConstructor,values){const list=new ArrayConstructor(values.length);try{for(let index=0;index<values.length;index++)set(list,index,values[index]);}catch{throw new ErrorConstructor('FailedToCreateArray')}return list;}

export function installLayout(page, window, options = {}) {
  const layout = createLayout(window, options);
  LAYOUTS.set(implForWrapper(window.document),layout);
  const ownedLayout=element=>{if(!ElementInterface.is(element))throw new window.TypeError('Illegal invocation');return LAYOUTS.get(implForWrapper(element)._ownerDocument)??layout;};
  const isRoot=element=>{const node=implForWrapper(element);return node===node._ownerDocument.documentElement;};
  installElementScroll(window,implementation=>LAYOUTS.get(implementation._ownerDocument));
  layout.setScrollObserver(installScrollEvents(page,window).windowScroll);
  const rectGlobal=implForWrapper(window.document)._globalObject,ArrayConstructor=window.Array,set=window.Reflect.set,ErrorConstructor=window.Error;
  const domRect=value=>RectFactory.create(rectGlobal,[value.x,value.y,value.width,value.height]);
  const define = (target, name, descriptor) => Object.defineProperty(target, name, { configurable: true, enumerable: true, ...descriptor });
  define(window.Element.prototype, 'getBoundingClientRect', { writable: true, value() { return domRect(ownedLayout(this).rect(this)); } });
  define(window.Element.prototype, 'getClientRects', { writable: true, value() { return clientRectList(ArrayConstructor,set,ErrorConstructor,ownedLayout(this).rects(this).map(domRect)); } });
  for (const [name, dimension] of [['offsetWidth', 'width'], ['offsetHeight', 'height']]) {
    define(window.HTMLElement.prototype, name, { get() { return ownedLayout(this).dimension(this,dimension); } });
  }
  for (const [name, dimension] of [['clientWidth', 'width'], ['clientHeight', 'height']]) {
    define(window.Element.prototype, name, { get() { return (isRoot(this) ? ownedLayout(this).viewport[dimension] : ownedLayout(this).dimension(this,dimension)); } });
  }
  for (const [name, dimension] of [['scrollWidth', 'width'], ['scrollHeight', 'height']]) {
    define(window.Element.prototype, name, { get() { return (isRoot(this) ? ownedLayout(this).documentSize[dimension] : dimension==='width'?ownedLayout(this).scrollWidth(this):implForWrapper(this)===implForWrapper(this)._ownerDocument.body?ownedLayout(this).dimension(this,'height'):ownedLayout(this).scrollHeight(this)); } });
  }
  define(window.HTMLElement.prototype,'offsetTop',{get(){return ownedLayout(this).absoluteRect(this).y;}});
  define(window.HTMLElement.prototype,'offsetParent',{get(){const model=ownedLayout(this),doc=wrapperForImpl(implForWrapper(this)._ownerDocument);if(!model.rendered(this)||this===doc.body||this===doc.documentElement)return null;const own=model.rawComputedStyle(this);if(own.position==='fixed')return null;for(let p=this.parentElement??this.getRootNode().host;p;p=p.parentElement??p.getRootNode().host){const css=model.rawComputedStyle(p);if(css.position&&css.position!=='static')return p;if((!own.position||own.position==='static')&&['td','th','table'].includes(p.localName))return p;}return doc.body;}});
  define(window.HTMLElement.prototype,'offsetLeft',{get(){return ownedLayout(this).absoluteRect(this).x;}});
  define(window.Document.prototype, 'elementFromPoint', { writable: true, value(x, y) { return layout.hitTest(Number(x), Number(y)); } });
  define(window.Document.prototype, 'elementsFromPoint', { writable: true, value(x, y) { return layout.elementsFromPoint(Number(x), Number(y)); } });
  define(window, 'innerWidth', { get: () => layout.viewport.width });
  define(window, 'innerHeight', { get: () => layout.viewport.height });
  for (const [name, axis] of [['scrollX', 'x'], ['pageXOffset', 'x'], ['scrollY', 'y'], ['pageYOffset', 'y']]) define(window, name, { get: () => layout.scroll[axis] });
  const scrollArguments = (x, y) => typeof x === 'object' && x !== null ? [x.left ?? layout.scroll.x, x.top ?? layout.scroll.y] : [x, y];
  window.scroll = window.scrollTo = (x, y) => layout.scrollTo(...scrollArguments(x, y));
  window.scrollBy = (x, y) => layout.scrollBy(...(typeof x === 'object' && x !== null ? [x.left ?? 0, x.top ?? 0] : [x, y]));
  define(window.Element.prototype, 'scrollIntoView', { writable: true, value() { ownedLayout(this).scrollIntoView(this); } });
  define(window.Element.prototype, 'scrollIntoViewIfNeeded', { writable: true, value() { ownedLayout(this).scrollIntoView(this); } });
  const computedViews = COMPUTED_VIEWS;
  window.getComputedStyle = (node, pseudoElement) => {
    const model=ownedLayout(node);
    const original = model.rawComputedStyle(node, pseudoElement);
    if (computedViews.has(original)) return computedViews.get(original);
    const computed = name => {
      if (name === 'width' || name === 'height') {
        const specified = original.getPropertyValue(name); if(specified&&specified!=='auto')return specified;
        return model.rendered(node) ? `${model.dimension(node,name)}px` : 'auto';
      }
      return original.getPropertyValue(name);
    };
    const view = new Proxy(original, {
      get(target, property) {
        if (property === 'width' || property === 'height') return computed(property);
        if (property === 'getPropertyValue') return name => computed(name);
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    registerHeapWrapper(view,window,original);
    computedViews.set(original,view); return view;
  };
  page.layout = layout;
  installWindowViewport(page,window,layout);
  return layout;
}

// Private geometry consumers address the actual document implementation.
export function layoutForDocument(document){return LAYOUTS.get(document);}
