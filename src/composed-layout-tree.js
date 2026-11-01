// Internal layout traversal over the actual canonical tree and slot state.
// Closed roots and assignment are backend data; public host/getter overrides
// never select geometry ownership or create a new tree/front.
import{createRequire}from'node:module';
const require=createRequire(import.meta.url),{domSymbolTree}=require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const children=domSymbolTree.childrenIterator,parent=domSymbolTree.parent,apply=Reflect.apply;
export function composedLayoutChildren(node){
 if(node._shadowRoot)return Array.from(apply(children,domSymbolTree,[node._shadowRoot]));
 if(node._namespaceURI==='http://www.w3.org/1999/xhtml'&&node._localName==='slot'&&node._assignedNodes?.length)return[...node._assignedNodes];
 return Array.from(apply(children,domSymbolTree,[node]));
}
// Inverse of the same real flat-tree edges used above. This checks only
// ancestry; it never infers membership from ownerDocument/connected/prototypes.
export function composedLayoutContains(document,node){
 const seen=new Set();
 while(node){
  if(node===document)return true;
  if(seen.has(node))return false;
  seen.add(node);
  const slot=node._assignedSlot;
  if(slot&&!slot._shadowRoot&&slot._namespaceURI==='http://www.w3.org/1999/xhtml'&&slot._localName==='slot'&&slot._assignedNodes?.includes(node)){node=slot;continue;}
  const physical=apply(parent,domSymbolTree,[node]);
  if(!physical)return false;
  if(physical._host){
   if(physical._host._shadowRoot!==physical)return false;
   node=physical._host;continue;
  }
  if(physical._shadowRoot)return false;
  if(physical._namespaceURI==='http://www.w3.org/1999/xhtml'&&physical._localName==='slot'&&physical._assignedNodes?.length)return false;
  node=physical;
 }
 return false;
}
export function backendTreeRoot(node){let next;while(next=apply(parent,domSymbolTree,[node]))node=next;return node}
export function retargetLayoutHit(node,scope){
 for(;;){
  const root=backendTreeRoot(node);if(!root._host)return node;
  let contains=false;
  for(let current=scope;current;){if(current===root){contains=true;break}current=current._host?backendTreeRoot(current._host):null}
  if(contains)return node;
  node=root._host;
 }
}
