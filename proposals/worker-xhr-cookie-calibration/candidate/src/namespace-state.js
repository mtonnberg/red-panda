// Ownership is captured from genuine installed documents, never public names.
const globals=new WeakSet(),creators=new WeakMap();
export function ownNamespaceGlobal(globalObject,creator){globals.add(globalObject);if(creator)creators.set(globalObject,creator);}
export function namespaceCreator(globalObject){return creators.get(globalObject);}
export function namespaceDocument(node){return node?.nodeType===9?node:node?._ownerDocument;}
export function ownsNamespaceNode(node){const document=namespaceDocument(node);return !!document&&globals.has(document._globalObject);}
