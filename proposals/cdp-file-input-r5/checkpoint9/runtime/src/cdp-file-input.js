// Independent CDP disk-input adapter, calibrated against actual owned files.
// Read/stat the whole input vector before mutating any real control state.
import 'jsdom';
import {openSync,readSync,closeSync,statSync} from 'node:fs';
import {basename,extname} from 'node:path';
import {createRequire} from 'node:module';
import {canonicalUtilityValue} from './isolated-world.js';
import {platformFactoryRecord} from './platform-factories.js';
import {fileInputOwner,commitFileInputSelection} from './file-inputs.js';
import {createDiskFileImplementation} from './file-wrapper-realms.js';
const require=createRequire(import.meta.url);
const Node=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation,Input=require('jsdom/lib/jsdom/living/nodes/HTMLInputElement-impl.js').implementation;
const owners=new WeakMap(),MAX_BYTES=100*1024*1024;
const MIME=Object.freeze({'.txt':'text/plain','.html':'text/html','.htm':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.xml':'application/xml','.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.csv':'text/csv','.zip':'application/zip'});
export const supportsFileInput=method=>method==='DOM.setFileInputFiles';
export function rememberFileInputContext(connection,context){owners.set(connection,context)}
export function forgetFileInputContext(connection,id){if(owners.get(connection)?.id===id)owners.delete(connection)}
function fail(Error,message){throw new Error(message,-31998)}
function uint(value,Error){
 if(typeof value!=='number'&&typeof value!=='string')fail(Error,'UnexpectedToken');
 if(typeof value==='string'){
  if(!/^[+-]?[0-9]+$/.test(value))fail(Error,'InvalidCharacter');
  const n=BigInt(value);if(n<0n||n>4294967295n)fail(Error,'Overflow');return Number(n);
 }
 if(value<0||value>4294967295)fail(Error,'Overflow');
 if(!Number.isInteger(value))fail(Error,'InvalidNumber');return value;
}
function parameters(params,Error){
 if(!Object.hasOwn(params,'files'))fail(Error,'MissingField');
 if(!Array.isArray(params.files)||params.files.some(value=>typeof value!=='string'))fail(Error,'UnexpectedToken');
 const selectors=Object.create(null);
 // Optional fields are all decoded, including ignored lower-priority fields.
 for(const name of ['nodeId','backendNodeId'])if(params[name]!=null)selectors[name]=uint(params[name],Error);
 if(params.objectId!=null){if(typeof params.objectId!=='string')fail(Error,'UnexpectedToken');selectors.objectId=params.objectId}
 return {paths:params.files,selectors};
}
function read(path,Error){
 let fd;
 try{
  fd=openSync(path,'r');const parts=[];let size=0;
  for(;;){const buffer=Buffer.allocUnsafe(Math.min(65536,MAX_BYTES+1-size)),count=readSync(fd,buffer,0,buffer.length,null);if(count===0)break;size+=count;if(size>MAX_BYTES)fail(Error,'StreamTooLong');parts.push(buffer.subarray(0,count))}
  // Native source stats the path after the actual byte read. Preserve that
  // distinction rather than substituting a pre-read size or fake metadata.
  const st=statSync(path,{bigint:true});return {bytes:Buffer.concat(parts,size),name:basename(path),lastModified:Number(st.mtimeNs/1000000n),type:MIME[extname(path).toLowerCase()]??'application/octet-stream'};
 }catch(error){
  const name={ENOENT:'FileNotFound',EISDIR:'IsDir',ENOTDIR:'NotDir',EACCES:'AccessDenied',EPERM:'AccessDenied',ENAMETOOLONG:'NameTooLong',ELOOP:'SymLinkLoop'}[error.code];
  if(name)fail(Error,name);throw error;
 }finally{if(fd!==undefined)closeSync(fd)}
}
function selectedPage(connection,session,Error){
 if(session)return session.page;
 const context=owners.get(connection);
 if(!context||connection.browser.contexts.get(context.id)!==context)fail(Error,'BrowserContextNotLoaded');
 const page=[...connection.browser.pages.values()].find(page=>page.context===context&&!page.closed);
 if(!page)fail(Error,'FrameNotLoaded');return page;
}
function selectedNode(connection,session,page,selectors,Error){
 const id=selectors.nodeId??selectors.backendNodeId;
 if(id!==undefined){
  const nodes=new Set();for(const s of session?[session]:connection.sessions.values())if(s.page===page){const node=s.nodes?.get(id);if(node)nodes.add(node)}
  if(nodes.size!==1)fail(Error,'NodeNotFound');return [...nodes][0];
 }
 if(selectors.objectId!==undefined){
  const chosen=session??[...connection.sessions.values()].find(s=>s.page===page);let value;
  try{value=chosen?.object(selectors.objectId)}catch{fail(Error,'UnwrapFailed')}
  if(value===undefined)fail(Error,'UnwrapFailed');
  const node=canonicalUtilityValue(value),implementation=platformFactoryRecord(node)?.implementation;
  if(!(implementation instanceof Node))fail(Error,'ObjectIdIsNotANode');return node;
 }
 fail(Error,'MissingParams');
}
export function runFileInput(connection,session,params,Error){
 const {paths,selectors}=parameters(params,Error),page=selectedPage(connection,session,Error);
 if(page.closed||!page.dom)fail(Error,'FrameNotLoaded');
 const wrapper=selectedNode(connection,session,page,selectors,Error),implementation=platformFactoryRecord(wrapper)?.implementation;
 if(!(implementation instanceof Node))fail(Error,'NodeNotFound');
 if(implementation.nodeType!==1)fail(Error,'NodeIsNotAnElement');
 if(!(implementation instanceof Input))fail(Error,'NotAnInputElement');
 if(implementation.type!=='file')fail(Error,'NotAFileInput');
 const owner=fileInputOwner(implementation);if(!owner||owner.page.closed||owner.page.retired||owner.signal?.aborted)fail(Error,'InvalidNodeId');
 const records=paths.map(path=>read(path,Error));
 const values=records.map(record=>createDiskFileImplementation(owner.document._globalObject,[[record.bytes],record.name,{type:record.type,lastModified:record.lastModified,endings:'transparent'}]));
 if(!commitFileInputSelection(implementation,values))fail(Error,'InvalidNodeId');
 return {};
}
