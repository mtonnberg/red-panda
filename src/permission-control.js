// Permission-only Host authorities. Root Browser/Context/Target architecture
// and cookies remain independent; no state or controller slot is public VM data.
import {parseProtocolFloat,protocolFloatError} from './protocol-float.js';
const owners=new WeakMap(),browsers=new WeakMap(),connections=new WeakMap(),pages=new WeakMap(),contexts=new WeakMap();
const record=data=>Object.assign(Object.create(null),data);
const methods=new Set(['Browser.grantPermissions','Browser.setPermission','Browser.resetPermissions','Emulation.setGeolocationOverride','Emulation.clearGeolocationOverride']);
export const supportsPermissionControl=method=>methods.has(method);
function browserRecord(browser){let state=browsers.get(browser);if(!state){state=record({owners:new Set()});browsers.set(browser,state)}return state}
function createOwner(browser){const owner=Object.create(null),state=record({browser,permissions:new Map(),override:null,connections:0,pages:0,contexts:0});owners.set(owner,state);browserRecord(browser).owners.add(owner);return owner}
export function defaultPermissionOwner(browser){const state=browserRecord(browser);return state.default??=(createOwner(browser))}
function state(owner){const value=owners.get(owner);if(!value)throw new TypeError('A genuine permission authority is required');return value}
function release(owner){const value=state(owner);if(value.connections||value.pages||value.contexts)return;value.permissions.clear();value.override=null;browserRecord(value.browser).owners.delete(owner)}
export function registerPermissionContext(context,owner){if(contexts.has(context)){if(contexts.get(context)!==owner)throw new TypeError('Permission context authority cannot be retargeted');return}state(owner).contexts++;contexts.set(context,owner)}
export function disposePermissionContext(context){const owner=contexts.get(context);if(!owner)return;contexts.delete(context);const value=state(owner);value.permissions.clear();value.contexts--;release(owner)}
export function registerPermissionPage(page,owner){if(pages.has(page)){if(pages.get(page)!==owner)throw new TypeError('Permission Page authority cannot be retargeted');return}state(owner).pages++;pages.set(page,owner);page.once('close',()=>{state(owner).pages--;release(owner)})}
export function permissionOwnerForPage(page){let owner=pages.get(page);if(owner)return owner;const parent=page.registry?.page;owner=parent&&parent!==page?permissionOwnerForPage(parent):defaultPermissionOwner(page.browser??page);pages.set(page,owner);return owner}
export function initializePermissionConnection(connection,directPage){if(connections.has(connection))return;const owner=directPage?permissionOwnerForPage(directPage):createOwner(connection.browser);state(owner).connections++;connections.set(connection,owner)}
export function permissionOwnerForConnection(connection,page){return page?permissionOwnerForPage(page):connections.get(connection)}
export function releasePermissionConnection(connection){const owner=connections.get(connection);if(!owner)return;connections.delete(connection);state(owner).connections--;release(owner)}
export function closePermissionBrowser(browser){for(const owner of browserRecord(browser).owners){const value=state(owner);value.permissions.clear();value.override=null}}
export const permissionState=(owner,name)=>state(owner).permissions.get(name)??'prompt';
export function permissionStateProvider(page){const owner=permissionOwnerForPage(page);return name=>permissionState(owner,name)}
export const geolocationOverride=owner=>state(owner).override;
export function runPermissionControl(owner,method,params,present,ProtocolError){
 const value=state(owner),fail=message=>{throw new ProtocolError(message,-31998)};
 if(method==='Browser.resetPermissions'){value.permissions.clear();return{}}
 if(method==='Emulation.clearGeolocationOverride'){value.override=null;return{}}
 if(method==='Emulation.setGeolocationOverride'){
  const input=params??{};const values=record({});
  for(const name of ['latitude','longitude','accuracy']){const item=input[name];if(item===undefined||item===null)values[name]=null;else try{values[name]=parseProtocolFloat(item)}catch(error){const message=protocolFloatError(error);if(message)fail(message);throw error}}
  value.override=values.latitude===null||values.longitude===null?null:Object.freeze(record({latitude:values.latitude,longitude:values.longitude,accuracy:values.accuracy??0}));return{};
 }
 if(!present||params===null||params===undefined)fail('InvalidParams');
 const required=(object,key,type)=>{if(!Object.hasOwn(object,key))fail('MissingField');const item=object[key];if(typeof item!==type||item===null)fail('UnexpectedToken');return item};
 for(const key of ['origin','browserContextId'])if(params[key]!=null&&typeof params[key]!=='string')fail('UnexpectedToken');
 if(method==='Browser.grantPermissions'){
  if(!Object.hasOwn(params,'permissions'))fail('MissingField');const names=params.permissions;if(!Array.isArray(names)||names.some(name=>typeof name!=='string'))fail('UnexpectedToken');for(const name of names)value.permissions.set(name,'granted');return{};
 }
 if(method==='Browser.setPermission'){
  const permission=required(params,'permission','object');if(Array.isArray(permission))fail('UnexpectedToken');const name=required(permission,'name','string'),setting=required(params,'setting','string');if(!['granted','prompt','denied'].includes(setting))fail('InvalidPermissionSetting');value.permissions.set(name,setting);return{};
 }
 throw new TypeError('Unknown permission-control operation');
}
