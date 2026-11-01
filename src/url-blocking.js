// Privileged HTTP admission policy. Authorities are captured at real CDP,
// Context and Page creation; no authored URL/object metadata establishes one.
const owners=new WeakMap(),connections=new WeakMap(),contexts=new WeakMap(),pages=new WeakMap(),denials=new WeakSet();
function newOwner(){const owner=Object.create(null);owners.set(owner,{rules:[]});return owner}
function state(owner){const value=owners.get(owner);if(!value)throw new TypeError('An actual URL policy authority is required');return value}
// The active connection indexes genuine contexts weakly. Old contexts can stay
// alive through legitimate retained values without being retained by this index.
function loadedContexts(connection,record){
 const live=[];
 for(const ref of record.loaded){
  const context=ref.deref();
  if(!context||connection.browser.contexts.get(context.id)!==context){record.loaded.delete(ref);if(context)record.seen.delete(context)}
  else live.push(context);
 }
 return live;
}
function markLoaded(connection,record,context){
 loadedContexts(connection,record);
 if(record.seen.has(context))return;
 const ref=new WeakRef(context);record.seen.set(context,ref);record.loaded.add(ref);
}
export function initializeURLBlockConnection(connection,directPage){
 if(connections.has(connection))return;
 const owner=directPage?urlBlockOwnerForPage(directPage):newOwner();
 const record={owner,loaded:new Set(),seen:new WeakMap()};connections.set(connection,record);
 if(directPage)markLoaded(connection,record,directPage.context);
}
export function urlBlockOwnerForConnection(connection){const value=connections.get(connection);if(!value)throw new TypeError('An actual CDP connection is required');return value.owner}
export function registerURLBlockContext(connection,context){
 const value=connections.get(connection);if(!value)throw new TypeError('An actual CDP connection is required');
 if(contexts.has(context)&&contexts.get(context)!==value.owner)throw new TypeError('URL policy context cannot be retargeted');
 contexts.set(context,value.owner);markLoaded(connection,value,context);
}
export const urlBlockOwnerForContext=context=>contexts.get(context);
export function registerURLBlockPage(page,owner){
 owner??=newOwner();state(owner);
 if(pages.has(page)&&pages.get(page)!==owner)throw new TypeError('URL policy Page cannot be retargeted');
 pages.set(page,owner);
}
export function urlBlockOwnerForPage(page){return pages.get(page)??(page.registry?.page!==page&&page.registry?.page?urlBlockOwnerForPage(page.registry.page):undefined)}
export function markURLBlockPageContext(connection,page){const value=connections.get(connection);if(!value)throw new TypeError('An actual CDP connection is required');markLoaded(connection,value,page.context)}
export function releaseURLBlockConnection(connection){connections.delete(connection)}
// Only ASCII case folds. '?' and all punctuation remain literal characters.
const fold=value=>value.replace(/[A-Z]/g,char=>String.fromCharCode(char.charCodeAt(0)+32));
function matches(pattern,input){
 let p=0,i=0,star=-1,resume=0;
 while(i<input.length){
  if(pattern[p]==='*'){star=p++;resume=i;continue}
  if(p<pattern.length&&pattern[p]===input[i]){p++;i++;continue}
  if(star<0)return false;
  p=star+1;i=++resume;
 }
 while(pattern[p]==='*')p++;
 return p===pattern.length;
}
export function setBlockedURLs(connection,page,params,ProtocolError){
 const fail=message=>{throw new ProtocolError(message,-31998)};
 if(!Object.hasOwn(params,'urlPatterns'))fail('MissingField');
 if(!Array.isArray(params.urlPatterns))fail('UnexpectedToken');
 // Complete conversion and compilation before replacing the active program.
 const rules=[];
 for(const entry of params.urlPatterns){
  if(entry===null||typeof entry!=='object'||Array.isArray(entry))fail('UnexpectedToken');
  if(!Object.hasOwn(entry,'urlPattern'))fail('MissingField');
  if(typeof entry.urlPattern!=='string')fail('UnexpectedToken');
  if(!Object.hasOwn(entry,'block'))fail('MissingField');
  if(typeof entry.block!=='boolean')fail('UnexpectedToken');
  if(entry.urlPattern)rules.push(Object.freeze({pattern:fold(entry.urlPattern),block:entry.block}));
 }
 const record=connections.get(connection);
 if(!record||loadedContexts(connection,record).length===0)fail('BrowserContextNotLoaded');
 // Commands belong to their actual connection. Attaching an existing foreign
 // Root target does not retarget its birth authority or mutate its owner's rules.
 state(record.owner).rules=rules;return{};
}
export function assertURLAllowed(page,address){
 const owner=urlBlockOwnerForPage(page);if(!owner)return;
 const url=new URL(address);if(!['http:','https:'].includes(url.protocol))return;
 const input=fold(url.href);
 for(const rule of state(owner).rules)if(matches(rule.pattern,input)){
  if(!rule.block)return;
  const error=new Error('UrlBlocked');denials.add(error);throw error;
 }
}
export const urlBlockedError=error=>denials.has(error);
