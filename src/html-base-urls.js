// Native-profile base policy plus genuine first publication of the original
// canonical HTMLBaseElement interface. No already-created public shell is moved.
import 'jsdom';import vm from 'node:vm';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import {platformFactoryRecord} from './platform-factories.js';
const require=createRequire(import.meta.url),utils=require('jsdom/lib/jsdom/living/generated/utils.js'),URL=require('whatwg-url');
const Document=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation,Base=require('jsdom/lib/jsdom/living/nodes/HTMLBaseElement-impl.js').implementation;
const documents=new WeakMap(),realms=new WeakMap(),apply=Reflect.apply,hasInstance=Function.prototype[Symbol.hasInstance],originalHref=Object.getOwnPropertyDescriptor(Base.prototype,'href').get;let patched=false;
const sourceSHA='b572bdcf19dd26f43b9af763cd2e313e24042a61e54fede8ca5a049d364f61fb';
const names=['exports','conversions','utils','HTMLConstructor_helpers_html_constructor','ceReactionsPreSteps_helpers_custom_elements','ceReactionsPostSteps_helpers_custom_elements','implSymbol','ctorRegistrySymbol','HTMLElement','interfaceName','exposed','Impl','readBaseHref'];
function implementation(value){const result=platformFactoryRecord(value)?.implementation;return apply(hasInstance,Base,[result])?result:undefined}
function capture(globalObject){
 if(realms.has(globalObject))return;
 const context=vm.isContext(globalObject)?globalObject:utils.implForWrapper(globalObject)?._globalObject;
 const TypeError=context&&vm.isContext(context)?vm.runInContext('TypeError',context):globalObject.TypeError;
 realms.set(globalObject,Object.assign(Object.create(null),{TypeError}));
}
function read(globalObject,value){
 const element=implementation(value);if(!element)throw new (realms.get(globalObject).TypeError)('Illegal invocation');
 if(!documents.has(element._ownerDocument))return apply(originalHref,element,[]);
 const raw=element.getAttributeNS(null,'href');if(raw===null||raw==='')return '';
 const owner=element._ownerDocument,record=documents.get(owner);
 // Public href resolves the real receiver document URL; inherited fallback is
 // reserved for the separate document base selection producer.
 const parsed=URL.parseURL(raw,{baseURL:owner._URL});
 if(parsed===null)throw new (record.TypeError)();
 return URL.serializeURL(parsed);
}
export const baseInterfaceHelpers=Object.freeze({capture,read,is:value=>implementation(value)!==undefined,convert(globalObject,value,{context='The provided value'}={}){const result=implementation(value);if(result)return result;const TypeError=realms.get(globalObject)?.TypeError??globalObject.TypeError;throw new TypeError(`${context} is not of type 'HTMLBaseElement'.`)}});
export function transformBaseInterface(source,originalSource){
 if(require('jsdom/package.json').version!=='26.1.0'||createHash('sha256').update(originalSource).digest('hex')!==sourceSHA)throw new Error('Pinned original HTMLBaseElement source changed');
 const signature='exports.install = (globalObject, globalNames) => {\n',footer='};\n\nconst Impl = require(',start=source.indexOf(signature),end=source.indexOf(footer,start),originalStart=originalSource.indexOf(signature),originalEnd=originalSource.indexOf(footer,originalStart);
 if(source.split(signature).length!==2||source.split(footer).length!==2||start<0||end<start)throw new Error('Pinned base installer boundaries changed');
 const body=source.slice(start+signature.length,end);if(body!==originalSource.slice(originalStart+signature.length,originalEnd))throw new Error('Original base public installer body changed');
 const expression='return esValue[implSymbol]["href"];';if(body.split(expression).length!==2)throw new Error('Pinned base href producer changed');
 const compiled=body.replace(expression,'return readBaseHref(globalObject, esValue);');
 return source+'\nconst readBaseHref = baseInterfaceHelpers.read;\nexports.is = baseInterfaceHelpers.is;\nexports.convert = baseInterfaceHelpers.convert;\nconst originalBaseInterfaceInstall = exports.install;\nexports.install = (globalObject, globalNames) => {baseInterfaceHelpers.capture(globalObject);return installControlInterface(globalObject,globalNames,originalBaseInterfaceInstall,'+JSON.stringify(compiled)+','+JSON.stringify(names)+',['+names.join(', ')+'],__filename)};\n';
}
export function installHTMLBaseURLs(window){
 const document=platformFactoryRecord(window.document)?.implementation;if(!apply(hasInstance,Document,[document]))throw new TypeError('A successful canonical Document factory is required');
 if(!patched){patched=true;const original=Document.prototype._frozenBaseURL;Document.prototype._frozenBaseURL=function(baseElement,fallback){const parsed=apply(original,this,arguments);return documents.has(this)&&(parsed.scheme==='data'||parsed.scheme==='javascript')?fallback:parsed}}
 if(document._parsingMode==='html'){capture(document._globalObject);documents.set(document,realms.get(document._globalObject));}
}
