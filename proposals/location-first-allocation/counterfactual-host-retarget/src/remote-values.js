import { protocolPrototypeClass } from './protocol-classes.js';
import {utilityNodeIdentity} from './isolated-world.js';
// CDP value metadata without evaluating page getters or coercion hooks. This
// module deliberately does not allocate handles or select execution contexts.
import { types } from 'node:util';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { implSymbol, wrapperSymbol } = require('jsdom/lib/jsdom/living/generated/utils.js');
const ownDescriptor = Object.getOwnPropertyDescriptor;
const prototypeOf = Object.getPrototypeOf;
const apply = Reflect.apply;
const functionText = Function.prototype.toString;
const symbolText = Symbol.prototype.toString;
const dateText = Date.prototype.toString;
const mapSize = ownDescriptor(Map.prototype, 'size').get;
const setSize = ownDescriptor(Set.prototype, 'size').get;
const typedArrayLength = ownDescriptor(prototypeOf(Uint8Array.prototype), 'length').get;
const arrayBufferLength = ownDescriptor(ArrayBuffer.prototype, 'byteLength').get;
const sharedBufferLength = typeof SharedArrayBuffer === 'function' ? ownDescriptor(SharedArrayBuffer.prototype, 'byteLength').get : null;
const dataViewLength = ownDescriptor(DataView.prototype, 'byteLength').get;
const hostDOMExceptionName = typeof DOMException === 'function' ? ownDescriptor(DOMException.prototype,'name')?.get : null;
const hostDOMExceptionMessage = typeof DOMException === 'function' ? ownDescriptor(DOMException.prototype,'message')?.get : null;
const regexpSource = ownDescriptor(RegExp.prototype, 'source').get;
const regexpFlags = ['hasIndices','global','ignoreCase','multiline','dotAll','unicode','unicodeSets','sticky']
  .map((name,index) => [ownDescriptor(RegExp.prototype,name)?.get, 'dgimsuvy'[index]]).filter(([get]) => get);
let nodePrototype, domExceptionPrototype;

const htmlDDA = value => value !== undefined && typeof value === 'undefined';
const objectLike = value => value !== null && (typeof value === 'object' || typeof value === 'function' || htmlDDA(value));

function dataProperty(value, key, inherited = true) {
  if (!objectLike(value) || htmlDDA(value)) return { found:false };
  let object = value;
  for (let depth=0; object !== null && depth<64; depth++) {
    if (types.isProxy(object)) return { found:false, blocked:true };
    let descriptor;
    try { descriptor = ownDescriptor(object,key); }
    catch { return { found:false, blocked:true }; }
    if (descriptor) return Object.hasOwn(descriptor,'value') ? { found:true,value:descriptor.value } : { found:false,blocked:true };
    if (!inherited) break;
    try { object = prototypeOf(object); }
    catch { return { found:false,blocked:true }; }
  }
  return { found:false };
}

/** Own data properties only: accessors and Proxies are never read. */
export function ownDataValue(value,key) { return dataProperty(value,key,false).value; }

function hasPrototype(value, wanted) {
  if (!objectLike(value)) return false;
  let object = value;
  for (let depth=0; object!==null && depth<64; depth++) {
    if (types.isProxy(object)) return false;
    if (object===wanted) return true;
    try { object=prototypeOf(object); } catch { return false; }
  }
  return false;
}

function constructorName(value, fallback='Object') {
  if (!objectLike(value) || types.isProxy(value) || htmlDDA(value)) return fallback;
  let prototype;
  try { prototype=prototypeOf(value); } catch { return fallback; }
  const constructor=dataProperty(prototype,'constructor');
  if (!constructor.found || typeof constructor.value !== 'function' || types.isProxy(constructor.value)) return fallback;
  const name=dataProperty(constructor.value,'name',false);
  return name.found && typeof name.value==='string' && name.value ? name.value : fallback;
}

/** A real jsdom Node's owner, obtained from implementation data slots. A plain
 * object with nodeType/ownerDocument fields, or a Proxy around a Node, is not
 * promoted to a DOM node. No public Node getters are called. */
export function nodeIdentity(value) {
  const utility=utilityNodeIdentity(value);if(utility)return utility;
  if (!objectLike(value) || htmlDDA(value) || types.isProxy(value)) return undefined;
  const implementation=dataProperty(value,implSymbol,false);
  if (!implementation.found || !objectLike(implementation.value) || types.isProxy(implementation.value)) return undefined;
  if (dataProperty(implementation.value,wrapperSymbol,false).value !== value) return undefined;
  nodePrototype ??= require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation.prototype;
  if (!hasPrototype(implementation.value,nodePrototype)) return undefined;
  const type=dataProperty(implementation.value,'nodeType',false);
  if (!type.found || !Number.isInteger(type.value) || type.value<1 || type.value>12) return undefined;
  const documentImplementation=type.value===9 ? implementation.value : dataProperty(implementation.value,'_ownerDocument',false).value;
  const document=dataProperty(documentImplementation,wrapperSymbol,false).value;
  return {
    nodeType:type.value,
    ...(document ? { ownerDocument:document } : {}),
    className:constructorName(implementation.value,'NodeImpl').replace(/Impl$/,''),
  };
}

export function ownerDocumentOf(value) { return nodeIdentity(value)?.ownerDocument; }

/** Symbols need remote handles in CDP despite being JS primitives. */
export function needsRemoteHandle(value) {
  return value !== null && (objectLike(value) || typeof value==='symbol');
}

/** Complete primitive CDP fields, or undefined when a remote handle is needed. */
export function primitiveRemoteValue(value) {
  if (value===undefined) return { type:'undefined' };
  if (value===null) return { type:'object',subtype:'null',value:null };
  if (htmlDDA(value)) return undefined;
  const type=typeof value;
  if (type==='number') {
    const description=Object.is(value,-0)?'-0':String(value);
    return Number.isFinite(value) && !Object.is(value,-0) ? { type,value,description } : { type,unserializableValue:description,description };
  }
  if (type==='bigint') { const description=`${value}n`; return { type,unserializableValue:description,description }; }
  if (type==='string' || type==='boolean') return { type,value };
  return undefined;
}

function primitiveText(value) {
  if (value===null) return 'null';
  if (value===undefined) return 'undefined';
  if (typeof value==='symbol') return apply(symbolText,value,[]);
  if (typeof value==='number' && Object.is(value,-0)) return '-0';
  if (!objectLike(value)) return String(value);
  return undefined;
}

function hostDOMExceptionData(value) {
  if (!hostDOMExceptionName || !hostDOMExceptionMessage || !types.isNativeError(value)) return undefined;
  try { return { name:apply(hostDOMExceptionName,value,[]),message:apply(hostDOMExceptionMessage,value,[]) }; }
  catch { return undefined; }
}

function nativeErrorDescription(value,className) {
  // A native Error's stack can itself be a user accessor or invoke a realm's
  // Error.prepareStackTrace callback. Only explicitly materialized string data
  // is used; ordinary lazy stacks remain available through the real handle.
  const stack=dataProperty(value,'stack',false);
  if (stack.found && typeof stack.value==='string') return stack.value;
  const platform=hostDOMExceptionData(value);
  if(platform)return platform.message ? `${platform.name}: ${platform.message}` : platform.name;
  const name=dataProperty(value,'name'), message=dataProperty(value,'message');
  const title=name.found && typeof name.value==='string' ? name.value : className;
  const detail=message.found ? primitiveText(message.value) : undefined;
  return detail ? (title ? `${title}: ${detail}` : detail) : title;
}

const typedArrays = [
  ['Int8Array',types.isInt8Array],['Uint8Array',types.isUint8Array],['Uint8ClampedArray',types.isUint8ClampedArray],
  ['Int16Array',types.isInt16Array],['Uint16Array',types.isUint16Array],['Int32Array',types.isInt32Array],['Uint32Array',types.isUint32Array],
  ['Float32Array',types.isFloat32Array],['Float64Array',types.isFloat64Array],['BigInt64Array',types.isBigInt64Array],['BigUint64Array',types.isBigUint64Array],
];

function sizedDescription(name,getter,value) {
  try { return `${name}(${apply(getter,value,[])})`; } catch { return name; }
}

/** By-reference metadata only. All caller object IDs, object groups and realm
 * IDs must be supplied by the Session that actually retains the value. */
export function describeRemoteValue(value) {
  const primitive=primitiveRemoteValue(value);
  if (primitive) return primitive;
  if (typeof value==='symbol') return { type:'symbol',description:apply(symbolText,value,[]) };
  if (htmlDDA(value)) return { type:'function',className:'HTMLAllCollection',description:'function () { [native code] }' };
  const prototypeClass = protocolPrototypeClass(value);
  if (prototypeClass !== undefined) return { type:'object',className:prototypeClass,description:prototypeClass };
  const type=typeof value;
  // JS cannot unwrap or distinguish revocation of a Proxy without extra native
  // support. A generic Proxy description is truthful and never invokes traps.
  if (types.isProxy(value)) return { type:'object',subtype:'proxy',className:type==='function'?'Function':'Object',description:'Proxy' };
  const node=nodeIdentity(value);
  if (node) return { type:'object',subtype:'node',className:node.className,description:'' };
  if (Array.isArray(value)) {
    const length=dataProperty(value,'length',false).value;
    return { type:'object',subtype:'array',className:'Array',description:`Array(${length})` };
  }
  const implementation=dataProperty(value,implSymbol,false).value;
  if (implementation && objectLike(implementation) && !types.isProxy(implementation) && dataProperty(implementation,wrapperSymbol,false).value===value) {
    domExceptionPrototype ??= require('jsdom/lib/jsdom/living/webidl/DOMException-impl.js').implementation.prototype;
    if (hasPrototype(implementation,domExceptionPrototype)) {
      const name=dataProperty(implementation,'name',false).value;
      const message=dataProperty(implementation,'message',false).value;
      const description=typeof name==='string' ? name : 'DOMException';
      return { type:'object',subtype:'error',className:'DOMException',description:typeof message==='string' && message ? `${description}: ${message}` : description };
    }
  }
  if (types.isNativeError(value)) {
    const name=constructorName(value,'Error'), className=name==='Object'?'Error':name;
    return { type:'object',subtype:'error',className,description:nativeErrorDescription(value,className) };
  }
  if (type==='function') {
    let description='function () { [native code] }';
    try { description=apply(functionText,value,[]); } catch { /* a safe opaque callable description */ }
    return { type,className:'Function',description };
  }
  if (types.isPromise(value)) return { type,subtype:'promise',className:'Promise',description:'Promise' };
  if (types.isMap(value)) return { type,subtype:'map',className:'Map',description:sizedDescription('Map',mapSize,value) };
  if (types.isSet(value)) return { type,subtype:'set',className:'Set',description:sizedDescription('Set',setSize,value) };
  if (types.isWeakMap(value)) return { type,subtype:'weakmap',className:'WeakMap',description:'WeakMap' };
  if (types.isWeakSet(value)) return { type,subtype:'weakset',className:'WeakSet',description:'WeakSet' };
  if (types.isDate(value)) return { type,subtype:'date',className:'Date',description:apply(dateText,value,[]) };
  if (types.isRegExp(value)) {
    const flags=regexpFlags.filter(([getter])=>apply(getter,value,[])).map(([,flag])=>flag).join('');
    return { type,subtype:'regexp',className:'RegExp',description:`/${apply(regexpSource,value,[])}/${flags}` };
  }
  if (types.isTypedArray(value)) {
    const name=typedArrays.find(([,is])=>is(value))?.[0] ?? 'TypedArray';
    return { type,subtype:'typedarray',className:name,description:sizedDescription(name,typedArrayLength,value) };
  }
  if (types.isDataView(value)) return { type,subtype:'dataview',className:'DataView',description:sizedDescription('DataView',dataViewLength,value) };
  if (types.isArrayBuffer(value)) return { type,subtype:'arraybuffer',className:'ArrayBuffer',description:sizedDescription('ArrayBuffer',arrayBufferLength,value) };
  if (types.isSharedArrayBuffer(value)) return { type,subtype:'arraybuffer',className:'SharedArrayBuffer',description:sizedDescription('SharedArrayBuffer',sharedBufferLength,value) };
  if (types.isGeneratorObject(value)) return { type,subtype:'generator',className:'Generator',description:'Generator' };
  const className=constructorName(value);
  return { type,className,description:className };
}

/** Safe human-readable failure text. No String(object), user toString,
 * Symbol.toPrimitive, message getter or stack getter is invoked. */
export function safeErrorMessage(value, fallback='Protocol command failed') {
  const primitive=primitiveText(value);
  if (primitive!==undefined) return primitive;
  const message=dataProperty(value,'message');
  if (message.found && typeof message.value==='string') return message.value;
  const platform=hostDOMExceptionData(value);if(platform)return platform.message;
  const metadata=describeRemoteValue(value);
  return typeof metadata.description==='string' && metadata.description ? metadata.description : fallback;
}

export function protocolErrorFields(value, { defaultCode=-32602, defaultMessage='Protocol command failed' }={}) {
  const code=dataProperty(value,'code');
  return { code:code.found && Number.isInteger(code.value) ? code.value : defaultCode,
    message:safeErrorMessage(value,defaultMessage) };
}

/** Preserve the original thrown value and the retaining Session's real handle.
 * Line/column zero are explicit unavailable-position fallbacks, not recovered
 * source locations. Callers with trustworthy position metadata can supply it. */
export function exceptionDetailsFor(value, { remote, executionContextId, exceptionId=1, lineNumber=0, columnNumber=0 }={}) {
  if (typeof remote!=='function') throw new TypeError('Exception details require the retaining Session serializer');
  return { exceptionId,text:'Uncaught',lineNumber,columnNumber,
    ...(executionContextId!==undefined ? { executionContextId } : {}),
    exception:remote(value) };
}
