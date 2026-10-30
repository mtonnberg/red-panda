import 'jsdom';
import { createRequire } from 'node:module';
import { geometryFor, metricsFor, unionBounds } from './svg-path.js';
import { getCascadedStyleValue, getStyleInheritanceParent } from './styles.js';
const require = createRequire(import.meta.url);
const SVG = require('jsdom/lib/jsdom/living/generated/SVGElement.js');
const Graphics = require('jsdom/lib/jsdom/living/generated/SVGGraphicsElement.js');
const { implForWrapper } = require('jsdom/lib/jsdom/living/generated/utils.js');
const installed = new WeakMap();
const NS = 'http://www.w3.org/2000/svg';
function factory(g, bridge) {
  const Point=g.DOMPoint,Rect=g.DOMRect;
  const validate = (value, kind = 'graphics') => { if (!bridge.valid(value, kind)) throw new g.TypeError('Illegal invocation'); };
  const define = (Prototype, name, operation) => Object.defineProperty(Prototype, name, { configurable: true, enumerable: true, writable: true, value: operation });
  define(g.SVGGeometryElement.prototype, 'getTotalLength', function () { validate(this, 'geometry'); return bridge.metrics(this).length; });
  define(g.SVGGeometryElement.prototype, 'getPointAtLength', function (distance) { validate(this, 'geometry'); if (!arguments.length) throw new g.TypeError('invalid argument'); distance = +distance; if (!Number.isFinite(distance)) throw new g.TypeError(''); const p = bridge.metrics(this).pointAt(distance); return new Point(p.x, p.y); });
  define(g.SVGGraphicsElement.prototype, 'getBBox', function () { validate(this); const b = bridge.bounds(this); return b ? new Rect(b.x, b.y, b.width, b.height) : new Rect(); });
  define(g.SVGGraphicsElement.prototype, 'getCTM', function () { validate(this); return bridge.ctm(this, false); });
  define(g.SVGGraphicsElement.prototype, 'getScreenCTM', function () { validate(this); return bridge.ctm(this, true); });
  define(g.SVGTextContentElement.prototype, 'getNumberOfChars', function () { validate(this, 'text'); return bridge.text(this).text.length; });
  define(g.SVGTextContentElement.prototype, 'getComputedTextLength', function () { validate(this, 'text'); return bridge.text(this).length; });
  define(g.SVGTextContentElement.prototype, 'getSubStringLength', function (start, count) { validate(this, 'text'); if (arguments.length < 2) throw new g.TypeError('invalid argument'); start = +start >>> 0; count = +count >>> 0; const data = bridge.text(this); if (start >= data.text.length) throw new g.DOMException('Index or size is negative or greater than the allowed amount', 'IndexSizeError'); return data.glyphs.filter(glyph => glyph.start < start + count && glyph.end > start).reduce((total, glyph) => total + glyph.width, 0); });
}
export function installSVGGeometry(page, window, geometry) {
  if (installed.has(window)) return installed.get(window);
  const Matrix=geometry.DOMMatrix;
  const rawGet = window.Element.prototype.getAttribute, rawGetNS = window.Element.prototype.getAttributeNS;
  const rawChildren = Object.getOwnPropertyDescriptor(window.Element.prototype, 'children').get;
  const get = (element, name) => rawGet.call(element, name);
  const local = element => implForWrapper(element)._localName;
  const parent = element => element.parentElement;
  const isSVG = element => SVG.is(element);
  const children = element => Array.from(rawChildren.call(element)).filter(isSVG);
  const rawComputed = window.getComputedStyle;
  const fontCache = new Map();
  function font(element) {
    if (!element) return 16;
    if (fontCache.has(element)) return fontCache.get(element);
    const inherited = font(getStyleInheritanceParent(element)), declaration = getCascadedStyleValue(element, 'font-size'), value = declaration ?? get(element, 'font-size');
    let result = inherited;
    if (value !== null && value !== undefined) {
      const text = String(value).trim().toLowerCase(), match = /^([-+]?(?:\d+(?:\.\d*)?|\.\d+))(px|em|rem|%|pt|pc|in|cm|mm)?$/.exec(text);
      if (match) { const amount = Number(match[1]), unit = match[2] ?? 'px'; result = amount < 0 ? 16 : amount * ({ px:1, em:inherited, rem:16, '%':inherited/100, pt:96/72, pc:16, in:96, cm:96/2.54, mm:96/25.4 })[unit]; }
      else if (['initial', 'medium'].includes(text)) result = 16;
      else if (!['inherit', 'unset'].includes(text)) result = ({ small:13, 'x-small':10, 'xx-small':9, large:18, 'x-large':24, 'xx-large':32, smaller:inherited*.8, larger:inherited*1.2 })[text] ?? inherited;
    }
    fontCache.set(element, result); return result;
  }
  function attributeLength(element, name) {
    const raw = get(element, name);
    if (raw === null && ['rx', 'ry'].includes(name)) return null;
    if (name === 'd' || name === 'points') return raw;
    let Prototype = Object.getPrototypeOf(element), descriptor;
    while (Prototype && !descriptor) { descriptor = Object.getOwnPropertyDescriptor(Prototype, name); Prototype = Object.getPrototypeOf(Prototype); }
    if (descriptor?.get) { const animated = descriptor.get.call(element); if (animated instanceof window.SVGAnimatedLength) { const value = Object.getOwnPropertyDescriptor(window.SVGAnimatedLength.prototype, 'baseVal').get.call(animated); try { return Object.getOwnPropertyDescriptor(window.SVGLength.prototype, 'value').get.call(value); } catch (error) { if (error.name !== 'NotSupportedError') throw error; } } }
    const result = Number.parseFloat(raw ?? '0'); return Number.isFinite(result) ? result : 0;
  }
  const metrics = element => metricsFor(geometryFor(local(element), name => attributeLength(element, name)));
  function xmlPreserve(element) { for (let node = element; node; node = parent(node)) { const value = rawGetNS.call(node, 'http://www.w3.org/XML/1998/namespace', 'space') ?? get(node, 'xml:space'); if (value === 'preserve') return true; if (value === 'default') return false; } return false; }
  function content(element) {
    const value = element.textContent ?? '';
    return xmlPreserve(element) ? value.replace(/[\t\r\n]/g, ' ') : value.replace(/[\t\r\n ]+/g, ' ').replace(/^ | $/g, '');
  }
  const zeroWidth = code => (code >= 0x300 && code <= 0x36f) || (code >= 0x1ab0 && code <= 0x1aff) || (code >= 0x1dc0 && code <= 0x1dff) || (code >= 0x20d0 && code <= 0x20ff) || (code >= 0xfe00 && code <= 0xfe0f) || (code >= 0xfe20 && code <= 0xfe2f) || code === 0x200d;
  const wide = code => (code >= 0x1100 && code <= 0x115f) || (code >= 0x2329 && code <= 0x232a) || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe10 && code <= 0xfe19) || (code >= 0xfe30 && code <= 0xfe6f) || (code >= 0xff00 && code <= 0xff60) || (code >= 0xffe0 && code <= 0xffe6) || (code >= 0x1f000 && code <= 0x1ffff) || (code >= 0x20000 && code <= 0x3fffd);
  function text(element, override) {
    const value = override ?? content(element), size = font(element), glyphs = []; let offset = 0, length = 0;
    for (const glyph of value) { const code = glyph.codePointAt(0), width = size * (zeroWidth(code) ? 0 : glyph === ' ' ? .33 : wide(code) ? 1 : .6); glyphs.push({ start:offset, end:offset+glyph.length, width }); offset += glyph.length; length += width; }
    return { text:value, glyphs, length, size };
  }
  function inheritedValue(element, property, fallback) { for (let node=element; node; node=parent(node)) { const value=getCascadedStyleValue(node,property)??get(node,property); if (value && !['inherit','unset'].includes(value)) return value==='initial'?fallback:value; } return fallback; }
  function coordinate(element, name, fallback = 0) { const raw=get(element,name); if(raw!==null){const value=Number.parseFloat(raw);return Number.isFinite(value)?value:0;}return fallback; }
  function textBox(element) {
    if (!element.isConnected) return null;
    for(let node=element;node;node=parent(node))if(rawComputed.call(window,node).display==='none')return null;
    const data=text(element);if(!data.text.length)return null;
    let x=coordinate(element,'x'),y=coordinate(element,'y');
    const owner=parent(element);
    if(local(element)==='tspan'&&isSVG(owner)&&['text','tspan'].includes(local(owner))){
      if(get(element,'x')===null){const prefix=[];for(const node of owner.childNodes){if(node===element)break;prefix.push(node.textContent??'');}x=coordinate(owner,'x')+text(owner,prefix.join('')).length;}
      if(get(element,'y')===null)y=coordinate(owner,'y');
    }
    x+=coordinate(element,'dx');y+=coordinate(element,'dy');
    const anchor=inheritedValue(element,'text-anchor','start');if(anchor==='middle')x-=data.length/2;if(anchor==='end')x-=data.length;
    return{x,y:y-.8*data.size,width:data.length,height:data.size};
  }
  const transformGet=Object.getOwnPropertyDescriptor(window.SVGGraphicsElement.prototype,'transform').get;
  const baseGet=Object.getOwnPropertyDescriptor(window.SVGAnimatedTransformList.prototype,'baseVal').get;
  const lengthGet=Object.getOwnPropertyDescriptor(window.SVGTransformList.prototype,'length').get;
  const itemGet=window.SVGTransformList.prototype.getItem;
  function transform(element){const result=new Matrix();if(!Graphics.is(element))return result;const list=baseGet.call(transformGet.call(element));for(let i=0;i<lengthGet.call(list);i++)result.multiplySelf(itemGet.call(list,i).matrix);return result;}
  function transformedBox(box,matrix){if(!box)return null;const points=[[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]].map(([x,y])=>matrix.transformPoint({x,y}));const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));return{x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};}
  function bounds(element){
    const name=local(element);
    if(['text','tspan','textPath'].includes(name))return textBox(element);
    if(['rect','circle','ellipse','line','polygon','polyline','path','foreignObject'].includes(name))return metrics(element).bounds;
    if(!['g','svg'].includes(name))return null;
    return unionBounds(children(element).filter(child=>local(child)!=='svg').map(child=>transformedBox(bounds(child),transform(child))));
  }
  function ctm(element,screen){if(!element.isConnected)return null;const chain=[];let viewport=null;for(let node=element;node&&isSVG(node);node=parent(node)){chain.push(node);if(local(node)==='svg'){viewport=node;break;}}if(!viewport)return null;const result=new Matrix();if(screen){const rect=viewport.getBoundingClientRect();result.translateSelf(rect.x,rect.y);}for(const node of chain.reverse())result.multiplySelf(transform(node));return result;}
  const run = fn => (...args) => { fontCache.clear(); return fn(...args); };
  window.eval(`(${factory.toString()})`)(window,{valid(element,kind){return Graphics.is(element)&&(kind==='graphics'||(kind==='text'?['text','tspan','textPath']:['rect','circle','ellipse','line','path','polygon','polyline']).includes(local(element)));},metrics:run(metrics),bounds:run(bounds),ctm:run(ctm),text:run(text)});
  const controller={font:run(font),text:run(text),bounds:run(bounds)};installed.set(window,controller);return controller;
}
