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
