// Independent optional HTTP response store. CacheStorage and inspector body
// retention are separate owners; only completed real HTTP bytes enter this DB.
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const validators=['if-none-match','if-modified-since','if-unmodified-since','if-match','if-range'];
const heuristicStatuses=new Set([200,203,204,300,404,405,410,414,501]);
const disabled=new WeakSet();
function directives(value){
 const result=new Map();
 for(const part of (value??'').split(',')){
  const split=part.indexOf('='),name=(split<0?part:part.slice(0,split)).trim().toLowerCase();
  if(name&&!result.has(name))result.set(name,split<0?true:part.slice(split+1).trim().replace(/^"|"$/g,''));
 }
 return result;
}
function seconds(value){return typeof value==='string'&&/^\d+$/.test(value)?Math.min(Number(value),2147483648):null}
function timestamp(value){const number=Date.parse(value);return Number.isFinite(number)?number:null}
function policy(headers,status,now,renewal=false){
 const control=directives(headers.get('cache-control'));
 if((!renewal&&(control.has('no-store')||control.has('private')||headers.has('set-cookie')))||headers.has('authorization')||headers.get('vary')?.trim()==='*')return null;
 const etag=headers.get('etag'),modified=headers.get('last-modified');
 if(control.has('no-cache')&&!etag&&!modified)return null;
 let lifetime=seconds(control.get('max-age'));
 const shared=seconds(control.get('s-maxage'));
 if(lifetime===null){
  const expires=timestamp(headers.get('expires')),date=timestamp(headers.get('date'))??now;
  if(expires!==null)lifetime=Math.max(0,(expires-date)/1000);
  else if(heuristicStatuses.has(status)||control.has('public')){
   const last=timestamp(modified);lifetime=last===null?0:Math.min(86400,Math.max(0,(date-last)/10000));
  }else return null;
 }
 if(shared!==null)lifetime=Math.min(lifetime,shared);
 return {lifetime:control.has('no-cache')||control.has('no-store')?0:lifetime,age:seconds(headers.get('age'))??0,etag,modified};
}
function validEntry(entry){
 return entry&&Number.isInteger(entry.status)&&entry.status>=200&&entry.status<=599&&
  typeof entry.statusText==='string'&&Array.isArray(entry.headers)&&Array.isArray(entry.vary)&&
  Number.isFinite(entry.stored)&&Number.isFinite(entry.lifetime)&&Number.isFinite(entry.age);
}

export function setHTTPCacheDisabled(context,value){if(value)disabled.add(context);else disabled.delete(context)}
export function openHTTPCache({httpCacheDir,httpCacheEntryLimit=1000}={}){
 if(!Number.isInteger(httpCacheEntryLimit)||httpCacheEntryLimit<0||httpCacheEntryLimit>4294967295)throw new TypeError('httpCacheEntryLimit must be an unsigned 32-bit integer');
 if(httpCacheDir===undefined)return null;
 if(typeof httpCacheDir!=='string'||!httpCacheDir)throw new TypeError('httpCacheDir must be a nonempty path');
 return new HTTPCache(httpCacheDir,httpCacheEntryLimit);
}

class HTTPCache {
 #db;#get;#put;#remove;#limit;#epoch=0;#closed=false;
 constructor(directory,limit){
  // Loading SQLite is deferred until the caller explicitly configures a store.
  // This is our own schema/file; never remove or migrate unrelated cache files.
  const {DatabaseSync}=require('node:sqlite');
  mkdirSync(directory,{recursive:true,mode:0o700});
  this.#db=new DatabaseSync(join(directory,'red-panda-http-cache.sqlite'));
  try{
   this.#db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000; CREATE TABLE IF NOT EXISTS responses (url TEXT PRIMARY KEY, metadata TEXT NOT NULL, body BLOB NOT NULL, stored REAL NOT NULL)');
   this.#get=this.#db.prepare('SELECT metadata, body FROM responses WHERE url=?');
   this.#put=this.#db.prepare('INSERT OR REPLACE INTO responses(url,metadata,body,stored) VALUES(?,?,?,?)');
   this.#remove=this.#db.prepare('DELETE FROM responses WHERE url=?');this.#limit=limit;this.#maintain();
  }catch(error){this.#db.close();throw error}
 }
 #maintain(){
  if(this.#limit)this.#db.prepare('DELETE FROM responses WHERE url IN (SELECT url FROM responses ORDER BY stored DESC, rowid DESC LIMIT -1 OFFSET ?)').run(this.#limit);
 }
 clear(){if(this.#closed)return;this.#epoch++;this.#db.exec('DELETE FROM responses')}
 close(){if(this.#closed)return;this.#closed=true;this.#epoch++;try{this.#maintain()}finally{this.#db.close()}}
 #active(token){return !this.#closed&&token.epoch===this.#epoch&&!disabled.has(token.context)}
 begin(context,url,method,headers,{topLevelDocument=false}={}){
  if(this.#closed||disabled.has(context)||method.toUpperCase()!=='GET'||topLevelDocument||!/^https?:/.test(url)||validators.some(name=>headers.has(name)))return null;
  const token={context,url,epoch:this.#epoch,requestHeaders:new Headers(headers),entry:null,fresh:false};
  // A broken cache row is a miss, never an alternate network response.
  try{
   const row=this.#get.get(url);if(!row)return token;
   const entry=JSON.parse(row.metadata);if(!validEntry(entry))throw new Error('Invalid response record');
   if(!entry.vary.every(([name,value])=>(headers.get(name)??'').toLowerCase()===value.toLowerCase()))return token;
   entry.body=Buffer.from(row.body);token.entry=entry;
   token.fresh=(Date.now()-entry.stored)/1000+entry.age<entry.lifetime;
   if(!token.fresh&&!entry.etag&&!entry.modified){this.#remove.run(url);token.entry=null}
  }catch{try{this.#remove.run(url)}catch{}}
  return token;
 }
 requestHeaders(token,headers){
  if(!token?.entry||token.fresh)return headers;
  const result=new Headers(headers);
  if(token.entry.etag)result.set('if-none-match',token.entry.etag);
  if(token.entry.modified)result.set('if-modified-since',token.entry.modified);
  return result;
 }
 cachedData(token,statusText=token?.entry?.statusText){
  if(!token?.entry||!this.#active(token))return null;
  const entry=token.entry;
  return {url:token.url,status:entry.status,statusText,headers:new Headers(entry.headers),bytes:Buffer.from(entry.body)};
 }
 #response(data){
  return data?new Response([204,205,304].includes(data.status)?null:data.bytes,{status:data.status,statusText:data.statusText,headers:data.headers}):null;
 }
 cachedResponse(token,statusText=token?.entry?.statusText){return this.#response(this.cachedData(token,statusText))}
 revalidateData(token,response){
  if(!token?.entry||!this.#active(token)||response.status!==304)return null;
  // Inspector/cookie ingress retain real transport headers separately. Both
  // synchronous and asynchronous consumers use this same metadata transition.
  const previous=this.cachedData(token,response.statusText),headers=new Headers(token.entry.headers);
  response.headers.forEach((value,name)=>{if(!['content-length','content-encoding','transfer-encoding'].includes(name))headers.set(name,value)});
  this.store(token,{status:token.entry.status,statusText:token.entry.statusText,headers},token.entry.body,true);
  return previous;
 }
 revalidate(token,response){return this.#response(this.revalidateData(token,response))}
 store(token,response,bytes,renewal=false){
  if(!token||!this.#active(token)||response.status===206||response.status===304||response.status>=300&&response.status<400)return;
  const now=Date.now(),metadata=policy(response.headers,response.status,now,renewal);if(!metadata)return;
  const vary=(response.headers.get('vary')??'').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean).map(name=>[name,token.requestHeaders.get(name)??'']);
  const entry={...metadata,status:response.status,statusText:response.statusText,headers:[...response.headers],vary,stored:now};
  // Storage failure cannot replace successful transport bytes with an error.
  try{this.#put.run(token.url,JSON.stringify(entry),bytes,now)}catch{}
 }
}
