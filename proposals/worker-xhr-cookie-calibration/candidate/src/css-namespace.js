import { cssPropertyNames } from './css-properties.js';
import { supportsSelector } from './selectors.js';

const installed=new WeakMap();
const space=/[\t\n\r\f ]/;
// Token scanning keeps commas, colons and boolean operators inside strings and
// nested component values from becoming condition grammar boundaries.
function tokens(source){
 const out=[];let current='';
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(c==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);if(end<0)return null;if(current){out.push(current);current='';}i=end+1;continue;}
  if(c==='\\'){current+=c+(source[++i]??'');continue;}
  if(c==='"'||c==="'") {let end=i+1;for(;end<source.length;end++){if(source[end]==='\\')end++;else if(source[end]===c)break;}if(end===source.length)return null;current+=source.slice(i,end+1);i=end;continue;}
  if(c==='('||c==='['||c==='{'){
   const stack=[c==='('?')':c==='['?']':'}'];let end=i+1;
   for(;end<source.length&&stack.length;end++){
    const d=source[end];if(d==='\\'){end++;continue;}
    if(d==='"'||d==="'"){const quote=d;for(end++;end<source.length;end++){if(source[end]==='\\')end++;else if(source[end]===quote)break;}continue;}
    if(d==='/'&&source[end+1]==='*'){const e=source.indexOf('*/',end+2);if(e<0)return null;end=e+1;continue;}
    if(d==='('||d==='['||d==='{')stack.push(d==='('?')':d==='['?']':'}');
    else if(d===')'||d===']'||d==='}'){if(stack.pop()!==d)return null;}
   }
   if(stack.length)return null;current+=source.slice(i,end);out.push(current);current='';i=end-1;continue;
  }
  if(c===')'||c===']'||c==='}')return null;
  if(space.test(c)){if(current){out.push(current);current='';}}else current+=c;
 }
 if(current)out.push(current);return out;
}
function declaration(source){
 // A single optional terminal semicolon is valid. Interior top-level
 // semicolons represent a declaration list, which supports() does not accept.
 let text=source.trim(),colon=-1;
 const chunks=tokens(text);if(!chunks)return false;text=chunks.join(' ');
 for(let i=0;i<text.length;i++){
  const c=text[i];if(c===':'&&colon<0){colon=i;break;}
 }
 if(colon<0)return false;
 const property=text.slice(0,colon).trim(),value=text.slice(colon+1).trim();
 if(!value)return false;
 // Values are intentionally not validated against each property's grammar:
 // the observed native namespace tests property recognition and nonemptiness.
 const components=tokens(value);if(!components)return false;
 let stripped=components.join(' ');if(stripped.endsWith(';'))stripped=stripped.slice(0,-1).trim();
 if(!stripped||hasTopLevelSemicolon(stripped))return false;
 return recognized(property);
}
function hasTopLevelSemicolon(text){
 let quote=null,depth=0;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='\\'){i++;continue;}if(quote){if(c===quote)quote=null;continue;}if(c==='"'||c==="'"){quote=c;continue;}if('([{'.includes(c))depth++;else if(')]}'.includes(c))depth--;else if(c===';'&&!depth)return true;}
 return false;
}
const recognized=property=>property.startsWith('--')||cssPropertyNames.has(property.toLowerCase());
export function evaluateCSSCondition(source,depth=0){
 if(depth>64)return false;
 const list=tokens(source);if(!list||!list.length)return false;
 const operand=text=>/^(?:\(|[\w-]+\()/.test(text);
 if(list.length>=2&&list[0].toLowerCase()==='not')return list.length===2&&operand(list[1])&&!evaluateCSSCondition(list[1],depth+1);
 if(list.length>=3){
  const operator=list[1].toLowerCase();
  if((operator==='and'||operator==='or')&&list.length%2===1){
   for(let i=1;i<list.length;i+=2)if(list[i].toLowerCase()!==operator)return false;
   const values=[];for(let i=0;i<list.length;i+=2){if(!operand(list[i]))return false;values.push(evaluateCSSCondition(list[i],depth+1));}
   return operator==='and'?values.every(Boolean):values.some(Boolean);
  }
 }
 const text=list.join(' ');
 if(text.startsWith('(')&&text.endsWith(')'))return evaluateCSSCondition(text.slice(1,-1),depth+1);
 const fn=/^([\w-]+)\(([\s\S]*)\)$/.exec(text);
 if(fn){const name=fn[1].toLowerCase(),body=fn[2].trim();
  if(name==='selector')return supportsSelector(body);
  if(name==='font-tech')return /^(?:features-opentype|features-aat|color-colrv0|color-colrv1|color-sbix|color-cbdt|variations|palettes)$/i.test(body);
  if(name==='font-format')return /^(?:collection|embedded-opentype|opentype|svg|truetype|woff|woff2)$/i.test(body);
  return false;
 }
 return declaration(text);
}
function factory(g,bridge){
 const String=g.String,TypeError=g.TypeError,apply=g.Reflect.apply,define=g.Object.defineProperty;
 const description=g.Object.getOwnPropertyDescriptor(g.Symbol.prototype,'description').get,primitive=g.Symbol.toPrimitive;
 const charCode=String.prototype.charCodeAt,slice=String.prototype.slice,wellFormed=String.prototype.toWellFormed;
 const object=value=>value!==null&&(typeof value==='object'||typeof value==='function');
 function string(value){
  if(object(value)){
   const fn=value[primitive];if(fn!=null){if(typeof fn!=='function')throw new TypeError('invalid argument');value=apply(fn,value,['string']);if(object(value))throw new TypeError('invalid argument');}
   else {let done=false;for(let i=0;i<2;i++){const fn=value[i?'valueOf':'toString'];if(typeof fn!=='function')continue;const v=apply(fn,value,[]);if(!object(v)){value=v;done=true;break;}}if(!done)throw new TypeError('invalid argument');}
  }
  return apply(wellFormed,typeof value==='symbol'?apply(description,value,[])??'':String(value),[]);
 }
 class Css{constructor(){throw new TypeError('Illegal constructor');}}
 const css={
  escape(value){
   if(arguments.length===0)throw new TypeError('invalid argument');
   const text=string(value);let result='';
   for(let i=0;i<text.length;i++){
    const code=apply(charCode,text,[i]),c=apply(slice,text,[i,i+1]);
    if(code===0){result+='\ufffd';continue;}
    if(code<=31||code===127||i===0&&code>=48&&code<=57||i===1&&code>=48&&code<=57&&text[0]==='-'){result+='\\'+code.toString(16)+' ';continue;}
    if(i===0&&c==='-'&&text.length===1){result+='\\-';continue;}
    result+=code>=128||c==='-'||c==='_'||code>=48&&code<=57||code>=65&&code<=90||code>=97&&code<=122?c:'\\'+c;
   }
   return result;
  },
  supports(property){if(arguments.length===0)throw new TypeError('invalid argument');const first=string(property);if(arguments.length>=2){const value=string(arguments[1]);return bridge.property(first,value);}return bridge.condition(first);},
 };
 g.Object.setPrototypeOf(css,Css.prototype);define(css,g.Symbol.toStringTag,{value:'CSS',configurable:true});
 const accessor={get CSS(){if(!bridge.window(this))throw new TypeError('Illegal invocation');return css;}};
 define(g,'CSS',g.Object.getOwnPropertyDescriptor(accessor,'CSS'));
 return css;
}
export function installCSSNamespace(realm,{evaluate=source=>realm.eval(source)}={}){
 if(installed.has(realm))return installed.get(realm);
 const windows=new WeakSet([realm,evaluate('globalThis')]);
 for(const name of['_globalProxy','_globalObject']){const d=Object.getOwnPropertyDescriptor(realm,name);if(d?.value)windows.add(d.value);}
 // V8 supplies its real context sandbox as the receiver of an unqualified
 // global accessor, and its global proxy for window.CSS. Capture that actual
 // receiver during installation, before any authored code can run.
 let capturing=true;
 const bridge=Object.freeze(Object.assign(Object.create(null),{window(value){if(capturing){windows.add(value);return true;}return windows.has(value);},property:(property,value)=>value.trim().length>0&&recognized(property),condition:evaluateCSSCondition}));
 const result=evaluate(`(${factory.toString()})`)(realm,bridge);
 try{evaluate('CSS');}finally{capturing=false;}
 installed.set(realm,result);return result;
}
