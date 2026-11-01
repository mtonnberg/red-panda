// Real bounded LP producers. Semantic-tree and AX commands are intentionally
// absent until their independent traversal writers exist.
import {selectCDPCookieContext} from './cdp-cookie-metadata.js';
import {cdpDocumentForPage,cdpNodeEntry,cdpNodeOwner,registerCDPNode} from './cdp-node-registry.js';
import {createSemanticReader,semanticWalk,semanticWrapper} from './semantic-node-reader.js';
const methods=new Set(['LP.getNodeDetails','LP.detectForms','LP.getInteractiveElements']);
export const supportsSemantic=method=>methods.has(method);
function uint(value,Error){
 if(typeof value!=='number'&&typeof value!=='string')throw new Error('UnexpectedToken',-31998);
 if(typeof value==='string'){
  if(!/^[+-]?[0-9]+$/.test(value))throw new Error('InvalidCharacter',-31998);
  const actual=BigInt(value);if(actual<0n||actual>4294967295n)throw new Error('Overflow',-31998);return Number(actual);
 }
 if(value<0||value>4294967295)throw new Error('Overflow',-31998);
 if(!Number.isInteger(value))throw new Error('InvalidNumber',-31998);return value;
}
export function runSemantic(connection,session,method,params,present,Error){
 let selected;
 if(method==='LP.getNodeDetails'){
  if(!present||params===null)throw new Error('InvalidParam',-31998);
  if(!Object.hasOwn(params,'backendNodeId'))throw new Error('MissingField',-31998);
  selected=uint(params.backendNodeId,Error);
 }else if(method==='LP.getInteractiveElements'&&params?.nodeId!=null)selected=uint(params.nodeId,Error);
 const context=session?.page.context??selectCDPCookieContext(connection.browser);
 if(!context)throw new Error('NoBrowserContext',-31998);
 const page=session?.page??[...connection.browser.pages.values()].find(value=>value.context===context&&!value.closed);
 if(!page)throw new Error('FrameNotLoaded',-31998);
 const document=cdpDocumentForPage(page);if(!document)throw new Error('FrameNotLoaded',-31998);
 const node=selected===undefined?document:cdpNodeEntry(context,selected)?.node;
 const owner=cdpNodeOwner(node,context);if(!owner)throw new Error('InvalidNodeId',-31998);
 const reader=createSemanticReader(owner.document),idFor=value=>registerCDPNode(context,semanticWrapper(value));
 if(method==='LP.getNodeDetails')return{nodeDetails:reader.details(node,selected)};
 if(method==='LP.detectForms')return{forms:reader.forms(idFor)};
 const elements=[];for(const value of semanticWalk(node))if(value.nodeType===1&&reader.classification(value)&&reader.visible(value)){const result=reader.interactive(value,idFor(value));if(result)elements.push(result);}
 return{elements};
}
