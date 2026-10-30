import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {implForWrapper}=require('jsdom/lib/jsdom/living/generated/utils.js');
const CONTEXTS=new WeakMap(),OPAQUE=new WeakMap();
const originOf=window=>implForWrapper(window.document)._origin??window.location.origin;

// Standalone embedders without BrowserContext still get a private Page scope,
// rather than joining a process-global default namespace.
export const contextOf=page=>page.context??page.registry?.page.context??page.registry?.page??page;
function opaqueKey(document){if(!OPAQUE.has(document))OPAQUE.set(document,randomUUID());return OPAQUE.get(document)}

/** Host-only storage key. Worker realms receive this immutable configuration
 * through workerData rather than exposing namespace tokens to page code. */
export function broadcastConfig(page,window){
 const context=contextOf(page);
 if(!context||typeof context!=='object')throw new TypeError('BroadcastChannel requires a BrowserContext');
 if(!CONTEXTS.has(context))CONTEXTS.set(context,randomUUID());
 const origin=originOf(window),originKey=origin==='null'?opaqueKey(window.document):origin;
 return Object.freeze({namespace:CONTEXTS.get(context),originKey,origin});
}

