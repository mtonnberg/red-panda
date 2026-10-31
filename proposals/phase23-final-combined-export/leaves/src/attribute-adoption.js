import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const DocumentImpl=require('jsdom/lib/jsdom/living/nodes/Document-impl.js').implementation;
const {shadowIncludingInclusiveDescendantsIterator}=require('jsdom/lib/jsdom/living/helpers/shadow-dom.js');
const globals=new WeakSet(),apply=Reflect.apply,adopt=DocumentImpl.prototype._adoptNode;

// Called only by the trusted attribute-interface installer. Ownership follows
// the actual immutable Document registry; adopting never retargets a wrapper's
// prototype, creation realm or _globalObject.
export function registerAttributeAdoptionRealm(globalObject){globals.add(globalObject);}

DocumentImpl.prototype._adoptNode=function(node){
 if(!globals.has(this._globalObject)||node._ownerDocument===this)return apply(adopt,this,arguments);
 try{return apply(adopt,this,arguments);}
 finally{
  // The canonical backend performs removal, real shadow-inclusive adoption,
  // custom-element reaction enqueueing and template-content adoption. Complete
  // each live attribute's document ownership before generated CE post-steps
  // invoke authored adoptedCallback methods. No public DOM getters are used.
  for(const element of shadowIncludingInclusiveDescendantsIterator(node)){
   if(element.nodeType!==1)continue;
   const attributes=element._attributeList;
   for(let index=0;index<attributes.length;index++)attributes[index]._ownerDocument=element._ownerDocument;
  }
 }
};
