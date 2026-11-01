// Conservative private absence facts about the canonical light DOM tree.
// Unknown/potential membership always takes the original feature traversal.
// This index grants no brands and stores no public markers or strong DOM lists.
import {createRequire} from 'node:module';
import {readdirSync} from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url);
const apply=Reflect.apply,own=Object.getOwnPropertyDescriptor,prototype=Object.getPrototypeOf;
const ancestor=Object.prototype.isPrototypeOf;
export const IMAGE_SUBTREE=1,TRACK_SUBTREE=2,FORM_CANDIDATE_SUBTREE=4;
const ALL=IMAGE_SUBTREE|TRACK_SUBTREE|FORM_CANDIDATE_SUBTREE;
const absent=new WeakMap();
let installed=false,healthy=false,tree,treeParent,treeHasChildren;
let knownPrototypes,imagePrototype,trackPrototype,genericHTMLElementPrototype;

function disable(){healthy=false;}
function clearAncestorsForInserted(node){
  const uncertain=ALL&~(absent.get(node)??0);
  if(!uncertain)return;
  const seen=new Set();
  for(let parent=apply(treeParent,tree,[node]);parent;parent=apply(treeParent,tree,[parent])){
    // Canonical DOM pre-insertion validity prevents cycles. An unexpected
    // private mutation must disable the shortcut rather than loop forever.
    if(seen.has(parent)){disable();return;}seen.add(parent);
    const previous=absent.get(parent);
    if(previous!==undefined)absent.set(parent,previous&~uncertain);
    // Never stop at an unknown intermediate ancestor: a higher independently
    // recorded absence fact may still require invalidation.
  }
}

export function installSubtreeFeatureIndex(){
  if(installed)return;installed=true;
  try{
    // Demand loaded after the existing canonical interface compiler completes;
    // importing this module alone never changes jsdom bootstrap order.
    const directory=path.dirname(require.resolve('jsdom/lib/jsdom/living/nodes/Node-impl.js'));
    const NodeImpl=require(path.join(directory,'Node-impl.js')).implementation;
    imagePrototype=require(path.join(directory,'HTMLImageElement-impl.js')).implementation.prototype;
    trackPrototype=require(path.join(directory,'HTMLTrackElement-impl.js')).implementation.prototype;
    genericHTMLElementPrototype=require(path.join(directory,'HTMLElement-impl.js')).implementation.prototype;
    knownPrototypes=new Set();
    for(const filename of readdirSync(directory)){
      if(!filename.endsWith('-impl.js'))continue;
      const Implementation=require(path.join(directory,filename)).implementation;
      const value=Implementation?.prototype;
      if(value&&(value===NodeImpl.prototype||apply(ancestor,NodeImpl.prototype,[value])))knownPrototypes.add(value);
    }
    tree=require('jsdom/lib/jsdom/living/helpers/internal-constants.js').domSymbolTree;
    treeParent=tree.parent;treeHasChildren=tree.hasChildren;
    for(const name of ['appendChild','prependChild','insertBefore','insertAfter']){
      const original=tree[name];
      const wrapper=({invoke(...args){
        try{return apply(original,this,args);}
        finally{
          if(healthy&&this===tree){
            // The original singleton link operation invokes no authored
            // callback. Complete metadata before its caller can do so.
            try{clearAncestorsForInserted(args[1]);}catch{disable();}
          }
        }
      }}).invoke;
      Object.defineProperties(wrapper,{name:{value:original.name,configurable:true},length:{value:original.length,configurable:true}});
      Object.defineProperty(tree,name,{value:wrapper,writable:true,configurable:true});
    }
    // remove cannot introduce a member into any already-negative subtree.
    // We conservatively retain old unknown bits instead of guessing new zeros.
    healthy=true;
  }catch{disable();}
}

// Called only after the canonical successful setup/register sequence returns,
// never for generated .new shells or allocation-scope finally cleanup.
export function noteInitializedSubtreeNode(implementation){
  if(!healthy||!implementation)return;
  try{
    const concrete=prototype(implementation);
    if(!knownPrototypes.has(concrete))return;
    const type=own(implementation,'nodeType'),owner=own(implementation,'_ownerDocument');
    if(!type||!('value'in type)||!Number.isInteger(type.value)||type.value<1||type.value>12||!owner||!('value'in owner)||!owner.value)return;
    // A custom/Host factory subscriber or constructor may already have added
    // children. Own class alone never proves a nonempty subtree absent.
    if(apply(treeHasChildren,tree,[implementation]))return;
    let mask=ALL;
    if(concrete===imagePrototype||apply(ancestor,imagePrototype,[implementation]))mask&=~IMAGE_SUBTREE;
    if(concrete===trackPrototype||apply(ancestor,trackPrototype,[implementation]))mask&=~TRACK_SUBTREE;
    // In pinned jsdom autonomous custom candidates/HTMLConstructor use the
    // generic HTMLElement backend before definition/upgrade/author code.
    // Keep ALL such backends potential, including generic builtin false
    // positives. Specialized builtins cannot satisfy current autonomous-only
    // supported() via public define/upgrade. Unknown subclasses are not seeded.
    if(concrete===genericHTMLElementPrototype)mask&=~FORM_CANDIDATE_SUBTREE;
    absent.set(implementation,mask);
  }catch{disable();}
}

export function subtreeDefinitelyAbsent(implementation,feature){
  return healthy&&((absent.get(implementation)??0)&feature)===feature;
}
