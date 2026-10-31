// Genuine root-owned Worker transport quota/lifetime authority, without Window IDL.
import {browserWebSocketQuota} from './websocket-transports.js';
const ROOT_WORKER_OWNERS=new WeakMap(),record=value=>Object.assign(Object.create(null),value);
const rootFor=page=>{const seen=new Set();while(page.registry?.page&&page.registry.page!==page&&!seen.has(page)){seen.add(page);page=page.registry.page}return page};
function kill(owner){for(const transport of [...owner.transports])transport.kill()}
export function workerWebSocketOwner(page){const root=rootFor(page);let owner=ROOT_WORKER_OWNERS.get(root);if(!owner){owner=record({quota:browserWebSocketQuota(page.browser??root),transports:new Set()});ROOT_WORKER_OWNERS.set(root,owner);root.once('close',()=>kill(owner));if(!page.browser)root.documentAbort?.signal.addEventListener('abort',()=>kill(owner),{once:true})}return owner}
