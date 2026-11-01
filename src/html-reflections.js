// Native-profile HTML IDL reflection over real attributes. State and policy
// stay in Host records; only the actual public accessors live in the VM.
import vm from'node:vm';import{createRequire}from'node:module';import{platformFactoryRecord}from'./platform-factories.js';import{implementationForWrapper}from'./dom-event-state.js';
const require=createRequire(import.meta.url),installed=new WeakSet(),apply=Reflect.apply;
const implementation=name=>require('jsdom/lib/jsdom/living/nodes/'+name+'-impl.js').implementation;
const HTML='http://www.w3.org/1999/xhtml',defaultTabTags=new Set(['a','area','button','input','select','textarea','iframe']);
const symbolDescription=Object.getOwnPropertyDescriptor(Symbol.prototype,'description').get,wellFormed=String.prototype.toWellFormed;
const lower=value=>value.replace(/[A-Z]/g,c=>c.toLowerCase());
function integer(raw,fallback,signed){
 if(raw===null)return fallback;let i=0;while(i<raw.length){const code=raw.charCodeAt(i);if(code!==9&&code!==10&&code!==12&&code!==13&&code!==32)break;i++;}
 let negative=false;if(raw[i]==='+'||raw[i]==='-')negative=raw[i++]==='-';const start=i,limit=signed&&negative?2147483648:2147483647;let value=0;
 for(;i<raw.length;i++){const digit=raw.charCodeAt(i)-48;if(digit<0||digit>9)break;if(value>(limit-digit)/10)return fallback;value=value*10+digit;}
 if(i===start||!signed&&negative&&value!==0)return fallback;
 return value===0?0:negative?-value:value;
}
function uint32(value){if(!Number.isFinite(value)||value===0)return 0;const residue=Math.trunc(value)%4294967296;return residue<0?residue+4294967296:residue;}
function number(value,signed,fallback){const unsigned=uint32(value);return signed?(unsigned>=2147483648?unsigned-4294967296:unsigned):unsigned<=2147483647?unsigned:fallback;}
const specifications=[
 ['HTMLDetailsElement','name','name','string',''],
 ['HTMLElement','tabIndex','tabindex','signed',null],
 ['HTMLOListElement','start','start','signed',1],
 ['HTMLOListElement','type','type','string','1'],
 ['HTMLSourceElement','width','width','unsigned',0],
 ['HTMLSourceElement','height','height','unsigned',0],
 ['HTMLMarqueeElement','hspace','hspace','unsigned',0],
 ['HTMLMarqueeElement','vspace','vspace','unsigned',0],
 ['HTMLMarqueeElement','scrollAmount','scrollamount','unsigned',6],
 ['HTMLMarqueeElement','scrollDelay','scrolldelay','unsigned',85],
 ['HTMLMarqueeElement','behavior','behavior','enum','scroll',new Set(['scroll','slide','alternate'])],
 ['HTMLMarqueeElement','direction','direction','enum','left',new Set(['left','right','up','down'])],
 ['HTMLAreaElement','download','download','string',''],
 ['HTMLAreaElement','referrerPolicy','referrerpolicy','enum','',new Set(['','no-referrer','no-referrer-when-downgrade','origin','origin-when-cross-origin','same-origin','strict-origin','strict-origin-when-cross-origin','unsafe-url'])],
];
export function installHTMLReflections(window,{context}={}){
 context??=implementationForWrapper(window.document)._globalObject;if(installed.has(context))return;installed.add(context);
 const TypeError=vm.runInContext('TypeError',context),setAttributeNS=window.Element.prototype.setAttributeNS;
 for(const[kind,property,attribute,type,defaultValue,keywords]of specifications){
  const Impl=implementation(kind),fallback=element=>defaultValue===null?(element._namespaceURI===HTML&&defaultTabTags.has(element._localName)?0:-1):defaultValue;
  const state=value=>{const element=platformFactoryRecord(value)?.implementation;if(!(element instanceof Impl))throw new TypeError('Illegal invocation');return element;};
  const bridge={
   check(value){state(value)},
   get(value){const element=state(value),raw=element.getAttributeNS(null,attribute),missing=fallback(element);if(type==='signed'||type==='unsigned')return integer(raw,missing,type==='signed');if(type==='string')return raw===null?missing:raw;const normalized=raw===null?'':lower(raw);return keywords.has(normalized)?normalized:missing;},
   bigint(value){const converted=BigInt.asUintN(64,value);if(converted>4294967295n)throw new TypeError('BigInt does not fit an unsigned long');return Number(converted)},
   symbol(value){return String(apply(symbolDescription,value,[]))},
   set(value,converted){const element=state(value),text=type==='signed'||type==='unsigned'?String(number(converted,type==='signed',fallback(element))):apply(wellFormed,converted,[]);return apply(setAttributeNS,value,[null,attribute,text]);},
  };
  const convert=type==='signed'?'+value':type==='unsigned'?"typeof value==='bigint'?bridge.bigint(value):+value":"typeof value==='symbol'?bridge.symbol(value):`${value}`";
  const descriptor=vm.compileFunction(`return Object.getOwnPropertyDescriptor({get ${property}(){return bridge.get(this)},set ${property}(value){bridge.check(this);const converted=${convert};bridge.set(this,converted)}},${JSON.stringify(property)});`,['bridge'],{parsingContext:context})(bridge);
  Object.defineProperty(window[kind].prototype,property,{...descriptor,enumerable:true,configurable:true});
 }
}
