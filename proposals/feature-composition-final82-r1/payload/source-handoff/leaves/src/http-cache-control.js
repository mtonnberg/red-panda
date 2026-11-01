import {setHTTPCacheDisabled} from './http-cache.js';

const settings=new WeakMap();
const methods=new Set(['LP.configureCDP','Network.setCacheDisabled','Network.clearBrowserCache','Network.canClearBrowserCache']);
export function supportsHTTPCacheControl(method){return methods.has(method)}
export function runHTTPCacheControl(connection,session,method,params,present,ProtocolError,context){
 if(method==='LP.configureCDP'){
  if(!present)throw new ProtocolError('InvalidParams',-31998);
  if(params.disableSetCacheDisabled!==undefined&&typeof params.disableSetCacheDisabled!=='boolean')throw new ProtocolError('UnexpectedToken',-31998);
  const state=settings.get(connection)??{disableSetCacheDisabled:false};
  if(params.disableSetCacheDisabled!==undefined)state.disableSetCacheDisabled=params.disableSetCacheDisabled;
  settings.set(connection,state);return {};
 }
 if(method==='Network.setCacheDisabled'){
  if(!present)throw new ProtocolError('InvalidParams',-31998);
  if(!Object.hasOwn(params,'cacheDisabled'))throw new ProtocolError('MissingField',-31998);
  if(typeof params.cacheDisabled!=='boolean')throw new ProtocolError('UnexpectedToken',-31998);
 }
 if(!context)throw new ProtocolError('NoBrowserContext',-31998);
 if(method==='Network.canClearBrowserCache')return {result:!!connection.browser.httpCache};
 if(method==='Network.clearBrowserCache'){connection.browser.httpCache?.clear();return {}}
 if(!settings.get(connection)?.disableSetCacheDisabled)setHTTPCacheDisabled(context,params.cacheDisabled);
 return {};
}
