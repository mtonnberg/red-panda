import{installHTMLQualifiedNameParser}from'./html-qualified-name-parser.js';
// Actual owned DOM query and parser-error production policy. Generated public
// WebIDL conversions, original backends and genuine live collections remain.
import vm from'node:vm';
import{createRequire}from'node:module';
import{readFileSync}from'node:fs';
import{createHash}from'node:crypto';
import{dirname}from'node:path';
import{ownsNamespaceNode,namespaceCreator}from'./namespace-state.js';
const require=createRequire(import.meta.url),apply=Reflect.apply;
const DocumentImpl=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const ElementImpl=require('jsdom/lib/jsdom/living/nodes/Element-impl.js').implementation;
const Collection=require('jsdom/lib/jsdom/living/generated/HTMLCollection.js');
const Unknown=require('jsdom/lib/jsdom/living/generated/HTMLUnknownElement.js');
const ParserImpl=require('jsdom/lib/jsdom/living/domparsing/DOMParser-impl.js').implementation;
const{getHTMLElementInterface}=require('jsdom/lib/jsdom/living/helpers/create-element.js');
const{domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const{HTML_NS}=require('jsdom/lib/jsdom/living/helpers/namespaces.js');
const{memoizeQuery}=require('jsdom/lib/jsdom/utils.js');
const lower=value=>value.replace(/[A-Z]/g,letter=>letter.toLowerCase());
const pins={"living/domparsing/DOMParser-impl.js":"3ce9f996d67e6c5bfa950ff94aeea2d01626563fb319aaef23751acaa050d343","living/node.js":"1603aeefde459bfcae9d5702d761f2be9b1cc02801daa196d535685f54ada4e8","living/helpers/create-element.js":"68983134fabf3e594b2ff6e9813fe09cb70db322554ace8c5cb902e394e343a3","utils.js":"0e1e78d4086d6dc7e8637d4971e69fb87054f95748852b40746004fa0ab654e7"};
let installed=false;
export function installXMLQueryPolicy(){
 if(installed)return;
 installHTMLQualifiedNameParser();
 for(const[name,digest]of Object.entries(pins)){const actual=createHash('sha256').update(readFileSync(require.resolve('jsdom/lib/jsdom/'+name))).digest('hex');if(actual!==digest)throw new Error('Pinned canonical XML query/parser source changed: '+name)}
 // Recompile the original private catch producer with ONE scalar error-message
 // decision. This creates the genuine parsererror Text node at original birth;
 // no returned tree, public getter or serializer output is patched afterward.
 const full=require.resolve('jsdom/lib/jsdom/living/domparsing/DOMParser-impl.js'),original=readFileSync(full,'utf8'),needle='element.textContent = error.message;';
 if(original.split(needle).length!==2)throw new Error('Canonical DOMParser error-node producer changed');
 const transformed=original.replace(needle,'element.textContent = parserErrorMessage(this, error);'),module={exports:{}};
 vm.compileFunction(transformed,['require','exports','module','__filename','__dirname','parserErrorMessage'],{filename:full})(createRequire(full),module.exports,module,full,dirname(full),(parser,error)=>namespaceCreator(parser._globalObject)?'error':error.message);
 ParserImpl.prototype.parseFromString=module.exports.implementation.prototype.parseFromString;
 for(const Implementation of[DocumentImpl,ElementImpl]){
  const originalQuery=Implementation.prototype.getElementsByTagName;
  Implementation.prototype.getElementsByTagName=memoizeQuery(function(qualifiedName){
   if(!ownsNamespaceNode(this)||qualifiedName==='*')return apply(originalQuery,this,arguments);
   const folded=lower(qualifiedName),known=getHTMLElementInterface(folded)!==Unknown;
   return Collection.createImpl(this._globalObject,[],{element:this,query:()=>domSymbolTree.treeToArray(this,{filter:node=>{
    if(node===this||node.nodeType!==1)return false;
    if(node._namespaceURI!==HTML_NS)return node._qualifiedName===qualifiedName;
    // Known HTML names select their canonical spelling; unknown HTML names
    // compare ASCII-insensitively, while foreign namespaces stay exact.
    return known?node._qualifiedName===folded:lower(node._qualifiedName)===folded;
   }})});
  });
 }
 installed=true;
}
