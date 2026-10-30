import {registerHooks} from 'node:module';
const root=new URL('../',import.meta.url);
const sessions=new URL('./world-sessions.mjs',import.meta.url).href;
const world=new URL('./isolated-world.mjs',import.meta.url).href;
const realm=new URL('./realm-values.mjs',import.meta.url).href;
const patches=new Map([
 [new URL('src/cdp.js',root).href,{prefix:`import {initializeUtilitySession,attachUtilityMethods,utilityUniqueId} from ${JSON.stringify(sessions)};\nimport {protocolValue} from ${JSON.stringify(realm)};\n`,edits:[
  ['    this.lifecycle = false;','    this.lifecycle = false;\n    initializeUtilitySession(this,resetRuntime);'],
  ['id, origin: page.securityOrigin ?? new URL(page.url).origin, name, uniqueId: randomUUID(),','id, origin: page.securityOrigin ?? new URL(page.url).origin, name, uniqueId: utilityUniqueId(this,id,page,name),'],
  ['  argument(arg) {','  argument(arg,contextId,window=this.executionPage(contextId).dom.window) {'],
  ['    return arg.value;','    return protocolValue(window,arg.value);'],
  ['(params.arguments ?? []).map(arg => this.argument(arg)),','(params.arguments ?? []).map(arg => this.argument(arg,target.executionContextId,target.dom.window)),'],
  ['class Connection {','attachUtilityMethods(Session,ProtocolError);\nclass Connection {'],
 ]}],
 [new URL('src/browser.js',root).href,{prefix:`import {captureProtocolRealm} from ${JSON.stringify(realm)};\n`,edits:[
  ['    const listenerOwnership = installListenerOwnership(window);','    captureProtocolRealm(window);\n    const listenerOwnership = installListenerOwnership(window);'],
  ['    for (const { source } of this.newDocumentScripts.values()) {','    (this.registry?.page??this).emit(\'utilityWindowPrepared\',{page:this,window});\n    for (const { source,worldName } of this.newDocumentScripts.values()) {\n      if(worldName)continue;'],
 ]}],
 [new URL('src/remote-values.js',root).href,{prefix:`import {utilityNodeIdentity} from ${JSON.stringify(world)};\n`,edits:[['export function nodeIdentity(value) {','export function nodeIdentity(value) {\n  const utility=utilityNodeIdentity(value);if(utility)return utility;']]}],
 [new URL('src/dom.js',root).href,{prefix:`import {canonicalUtilityValue} from ${JSON.stringify(world)};\nimport {wrapUtilityDOMNode} from ${JSON.stringify(sessions)};\n`,edits:[['(node.ownerDocument ?? node) !== page.dom.window.document','(node.ownerDocument ?? node) !== canonicalUtilityValue(page.dom.window.document)'],['object: session.remote(node, false, params.objectGroup,','object: session.remote(wrapUtilityDOMNode(session,node,params.executionContextId), false, params.objectGroup,']]}],
]);
export const hook=registerHooks({load(url,context,nextLoad){const loaded=nextLoad(url,context),patch=patches.get(url);if(!patch)return loaded;let source=typeof loaded.source==='string'?loaded.source:new TextDecoder().decode(loaded.source);for(const[before,after]of patch.edits){if(source.split(before).length!==2)throw new Error('World overlay anchor count changed: '+before);source=source.replace(before,after);}return {...loaded,source:patch.prefix+source};}});
