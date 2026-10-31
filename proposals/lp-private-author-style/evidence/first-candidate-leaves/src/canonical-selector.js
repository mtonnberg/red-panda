// Canonical matching accepts only actual Node implementations held by a style
// owner. No public Node surface, selector callback or prototype supplies state.
import{createRequire}from'node:module';
import{canonicalSelectorProgram}from'./selectors.js';
const require=createRequire(import.meta.url),{domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js'),Element=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation;
const apply=Reflect.apply,attribute=Element.prototype.getAttribute,parent=domSymbolTree.parent,children=domSymbolTree.childrenIterator,iterator=domSymbolTree.treeIterator,disabled=require('jsdom/lib/jsdom/living/helpers/form-controls.js').isDisabled,HTML='http://www.w3.org/1999/xhtml';
const programs=new WeakMap(),lower=value=>value.replace(/[A-Z]/g,c=>c.toLowerCase()),attr=(node,name)=>apply(attribute,node,[name]),up=node=>apply(parent,domSymbolTree,[node]),elements=node=>Array.from(apply(children,domSymbolTree,[node])).filter(item=>item.nodeType===1);
const insensitive=new Set('accept accept-charset align alink axis bgcolor charset checked clear codetype color compact declare defer dir direction disabled enctype face frame hreflang http-equiv lang language link media method multiple nohref noresize noshade nowrap readonly rel rev rules scope scrolling selected shape target text type valign valuetype vlink'.split(' '));
const sameType=(a,b)=>a._namespaceURI===b._namespaceURI&&a._localName===b._localName;
function root(node){let current=node;while(up(current))current=up(current);return current}
function siblingList(node,type=false){const owner=up(node);return owner?elements(owner).filter(value=>!type||sameType(value,node)):[]}
function nth(argument,index){const text=argument.replace(/\s/g,'').toLowerCase();if(text==='even')return index%2===0;if(text==='odd')return index%2===1;if(!text.includes('n'))return index===Number(text);const match=/^([+-]?\d*)n([+-]\d+)?$/.exec(text);if(!match)return false;const a=match[1]===''||match[1]==='+'?1:match[1]==='-'?-1:Number(match[1]),b=Number(match[2]??0);return a===0?index===b:Number.isInteger((index-b)/a)&&(index-b)/a>=0}
function unsupported(name){const error=Error('Canonical selector state is not supported: '+name);error.code='UnsupportedCanonicalSelector';throw error}
function predicate(node,test,scope){
 if(test.kind==='never')return false;
 if(test.kind==='type'){if(test.namespace===''&&node._namespaceURI!==null)return false;const fold=(node._namespaceURI===HTML||node._namespaceURI==='http://www.w3.org/2000/svg')&&node._ownerDocument._parsingMode==='html';return test.name==='*'||(fold?lower(node._localName)===lower(test.name):node._localName===test.name)}
 if(test.kind==='id'||test.kind==='class'){let actual=attr(node,test.kind==='id'?'id':'class');if(actual===null)return false;let expected=test.name;if(node._ownerDocument._mode==='quirks'){actual=lower(actual);expected=lower(expected)}return test.kind==='id'?actual===expected:actual.split(/[\t\n\r\f ]+/).includes(expected)}
 if(test.kind==='attribute'){const actual=attr(node,test.name);if(actual===null)return false;if(!test.operator)return true;let a=actual,b=test.value;if(test.flag==='i'||test.flag!=='s'&&node._namespaceURI===HTML&&node._ownerDocument._parsingMode==='html'&&insensitive.has(lower(test.name))){a=lower(a);b=lower(b)}switch(test.operator){case'=':return a===b;case'^=':return b!==''&&a.startsWith(b);case'$=':return b!==''&&a.endsWith(b);case'*=':return b!==''&&a.includes(b);case'~=':return b!==''&&!/[\t\n\r\f ]/.test(b)&&a.split(/[\t\n\r\f ]+/).includes(b);case'|=':return a===b||a.startsWith(b+'-');default:return false}}
 if(test.kind==='logical'){if(test.name==='has'){for(const value of apply(iterator,domSymbolTree,[root(node)]))if(value.nodeType===1&&matchesProgram(value,test.program,node))return true;return false}const matched=matchesProgram(node,test.program,scope);return test.name==='not'?!matched:matched}
 const name=test.name;
 if(name==='scope')return node===scope;
 if(name==='root')return up(node)?.nodeType===9;
 if(name==='empty'){for(const child of apply(children,domSymbolTree,[node]))if(child.nodeType===1||child.nodeType===3&&child._data.length)return false;return true}
 if(['link','any-link','visited'].includes(name))return name!=='visited'&&['a','area','link'].includes(node._localName)&&attr(node,'href')!==null;
 if(name==='checked')return node._localName==='option'?node._selectedness===true:node._checkedness===true;
 if(name==='disabled'||name==='enabled'){if(node._namespaceURI!==HTML||!['button','fieldset','input','optgroup','option','select','textarea'].includes(node._localName))return false;return name==='disabled'?disabled(node):!disabled(node)}
 if(name==='focus')return node._ownerDocument._lastFocusedElement===node;
 if(name==='focus-within'){let current=node._ownerDocument._lastFocusedElement;while(current){if(current===node)return true;current=up(current)}return false}
 if(name==='defined')return node._ceState==='custom'||!node._localName.includes('-');
 if(name==='target')return attr(node,'id')===node._ownerDocument._URL?.fragment;
 if(/^(?:first|last|only|nth|nth-last)-(?:child|of-type)$/.test(name)){let values=siblingList(node,name.endsWith('of-type'));const index=values.indexOf(node)+1;if(name.startsWith('first-'))return index===1;if(name.startsWith('last-'))return index===values.length;if(name.startsWith('only-'))return values.length===1;return nth(test.argument,name.startsWith('nth-last-')?values.length-index+1:index)}
 return unsupported(name);
}
function matchesBranch(node,branch,scope,index=branch.compounds.length-1){if(index<0||!node||node.nodeType!==1)return false;if(!branch.compounds[index].every(test=>predicate(node,test,scope)))return false;if(index===0)return true;const relation=branch.relations[index-1];if(relation==='>')return matchesBranch(up(node),branch,scope,index-1);if(relation===' '){for(let current=up(node);current;current=up(current))if(matchesBranch(current,branch,scope,index-1))return true;return false}const siblings=siblingList(node),position=siblings.indexOf(node);if(relation==='+')return matchesBranch(siblings[position-1],branch,scope,index-1);if(relation==='~'){for(let i=position-1;i>=0;i--)if(matchesBranch(siblings[i],branch,scope,index-1))return true;return false}return false}
function matchesProgram(node,program,scope){return program.some(branch=>matchesBranch(node,branch,scope))}
export function matchCanonicalSelector(node,source,scope){const owner=scope?._ownerDocument??node._ownerDocument;let cache=programs.get(owner);if(!cache){cache=new Map();programs.set(owner,cache)}let program=cache.get(source);if(!program){program=canonicalSelectorProgram(source);cache.set(source,program)}return matchesProgram(node,program,scope??node._ownerDocument.documentElement)}
