import difflib, hashlib, json, os, shutil, tempfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
base=Path(json.loads((HERE/'manifest.json').read_text())['snapshot'])
target=Path(tempfile.mkdtemp(prefix='red-panda-frame-write-proposal-',dir='/tmp'))
for name in ['src','native']:shutil.copytree(base/name,target/name)
shutil.copy2(base/'package.json',target/'package.json');os.symlink(base/'node_modules',target/'node_modules')
sources={}
def replace(source,before,after):
 if source.count(before)!=1:raise RuntimeError(f'Changed integration point ({source.count(before)}): {before}')
 return source.replace(before,after)
def write(name,source):
 sources[name]=(base/name).read_text();(target/name).write_text(source)

source=(base/'src/listener-ownership.js').read_text()
source="import { AsyncLocalStorage } from 'node:async_hooks';\n"+source
source=replace(source,'const contexts = new WeakMap(), scopes = [];','const contexts = new WeakMap(), scopes = [];\nconst creation = new AsyncLocalStorage();')
source=replace(source,'    patched = true; const add = EventTargetImpl.prototype.addEventListener;',
'''    patched = true; const add = EventTargetImpl.prototype.addEventListener, dispatch = EventTargetImpl.prototype._dispatch;
    EventTargetImpl.prototype._dispatch = function (...args) {
      // Native creation tasks may dispatch authored event callbacks. Those
      // callbacks and their descendants must not inherit host ownership.
      const saved = scopes.splice(0);
      try { return creation.run(null, () => dispatch.apply(this, args)); }
      finally { scopes.push(...saved); }
    };''')
source=replace(source,'      const context = scopes.at(-1), targetContext = contexts.get(this._globalObject);',
'''      const inherited = creation.getStore()?.context;
      const context = scopes.at(-1) ?? inherited, targetContext = contexts.get(this._globalObject);''')
source=replace(source,'      if (before) for (const listener of this._eventListeners[type] ?? []) if (!before.has(listener)) context.internal.add(listener);',
'''      if (before) for (const listener of this._eventListeners[type] ?? []) if (!before.has(listener)) {
        context.internal.add(listener);
        if (context === inherited && this === context.document && type === 'load') context.nativeLoadBridge = true;
      }''')
source=replace(source,'  const context = { window, implementation, internal: new WeakSet() };',
                 '  const context = { window, implementation, document: implForWrapper(window.document), internal: new WeakSet(), nativeLoadBridge: false };')
source=replace(source,'  context.controller = { scope, eraseAuthoredListeners,',
'''  context.controller = { scope, eraseAuthoredListeners,
    get hasNativeLoadBridge() { return context.nativeLoadBridge; },
    checkpoint(target, type) { return new Set(implForWrapper(target)._eventListeners[type] ?? []); },
    adoptSince(target, type, checkpoint) {
      for (const listener of implForWrapper(target)._eventListeners[type] ?? []) if (!checkpoint.has(listener)) context.internal.add(listener);
    },''')
source+='''
// The native Window factory schedules its own load-bridge task. Bind that
// task's registration to the newly returned Window, before any authored parse.
// No callback source/realm heuristics or public getter overrides are involved.
export function createOwnedWindow(factory, options) {
  const binding = { context: null };
  const window = creation.run(binding, () => factory(options));
  const proxy = window._globalProxy ?? window;
  installListenerOwnership(proxy); binding.context = contexts.get(proxy);
  return window;
}
'''
write('src/listener-ownership.js',source)

source=(base/'src/frames.js').read_text()
source="import { completeInitialBlankFrame } from './document-reset.js';\n"+source
source=replace(source,"import { installListenerOwnership } from './listener-ownership.js';", "import { installListenerOwnership, createOwnedWindow } from './listener-ownership.js';")
source=replace(source,'    const window = createWindow(options);',
'''    const window = operation && !operation.created && !operation.owner.registry.disposed
      ? createOwnedWindow(createWindow, options) : createWindow(options);''')
source=replace(source,'    prepareWindow?.(framePage, childWindow._globalProxy);\n    operation.record = record;',
'''    prepareWindow?.(framePage, childWindow._globalProxy);
    // The known literal about:blank placeholder has no authored parser script.
    // Adopt only native load listeners added after prepareWindow has returned;
    // authored new-document injection listeners are already in the checkpoint.
    if (framePage.url === 'about:blank' && operation.srcdoc === undefined) {
      operation.blankListeners = installListenerOwnership(childWindow._globalProxy).checkpoint(record.document, 'load');
    }
    operation.record = record;''')
source=replace(source,'    const record = operation.record;\n    if (!record?.page || record.page.closed || record.waitingResource) return;',
'''    const record = operation.record;
    if (!record?.page || record.page.closed || record.waitingResource) return;
    if (operation.blankListeners) {
      installListenerOwnership(record.window._globalProxy).adoptSince(record.document, 'load', operation.blankListeners);
      completeInitialBlankFrame(record.window._globalProxy);
    }''')
write('src/frames.js',source)

source=(base/'src/document-reset.js').read_text()
source=replace(source,'function eligible(context) {',
'''function freshBlank(context) {
  return context && active(context) && !context.loaded && !context.current &&
    context.page.registry && context.page.url === 'about:blank' &&
    context.initialBlank && context.record.parserDone && context.record.parserOptions;
}
function eligible(context) {''')
source=replace(source,"  return context && active(context) && context.loaded &&\n    (context.document.readyState === 'complete' || context.current?.kind === 'write');",
'''  return freshBlank(context) || context && active(context) &&
    (context.current?.kind === 'write' || context.loaded && context.document.readyState === 'complete');''')
source=replace(source,"  context.current?.abort('Superseded write-created parser');",
'''  // A fresh blank frame's placeholder close may still be queued. Retire its
  // real queues/listeners before new input, so they cannot set fresh readiness.
  document._queue.paused = true; document._deferQueue.paused = true;
  document._deferQueue.setListener(null); document._asyncQueue.setListener(null);
  context.current?.abort('Superseded write-created parser');''')
source=replace(source,'  if (!context.bridgeInstalled) {', '  if (context.loaded && !ownership.hasNativeLoadBridge && !context.bridgeInstalled) {')
write('src/document-reset.js',source)
source+='''
// Complete only the actual, parsed empty about:blank placeholder. Its queued
// native close has not run yet; retire those queues and use the real synchronous
// Document.close path. The native load-to-frame bridge still dispatches its real
// initial load, and subsequent writes create an independent open parser.
export function completeInitialBlankFrame(window) {
  const context = contexts.get(implForWrapper(window.document));
  if (!context || !active(context) || context.loaded || context.current || !context.record.parserDone ||
      context.page.url !== 'about:blank' || context.document.scripts.length ||
      context.document._requestManager.size() || context.record.styles.size) return false;
  const document = context.document;
  document._queue.paused = true; document._deferQueue.paused = true;
  document._deferQueue.setListener(null); document._asyncQueue.setListener(null);
  context.page.moduleScripts?.start();
  document.close(true);
  context.initialBlank = true;
  return true;
}
'''
write('src/document-reset.js',source)

source=(base/'src/write-created-parser.js').read_text()
source=replace(source,'    try { operation(); }',
'''    try {
      operation();
      // parse5 groups already-consumed character tokens across chunks. Expose
      // that real pending token before write returns, without a synthetic EOF,
      // delimiter, node, or table-builder token.
      const tokenizer = parser.tokenizer;
      if (!tokenizer.inLoop && !tokenizer.paused && tokenizer.currentCharacterToken) {
        tokenizer._emitCurrentCharacterToken(tokenizer.getCurrentLocation(0));
      }
    }''')
write('src/write-created-parser.js',source)

patch=''.join(''.join(difflib.unified_diff(original.splitlines(True),(target/name).read_text().splitlines(True),fromfile='a/'+name,tofile='b/'+name))for name,original in sources.items())
(HERE/'integration.patch').write_text(patch)
metadata={'kind':'isolated-fresh-blank-frame-write-proposal','baseSnapshot':str(base),'snapshot':str(target),'productionFilesModified':False,
 'files':{name:{'baseSHA256':hashlib.sha256(original.encode()).hexdigest(),'proposedSHA256':hashlib.sha256((target/name).read_bytes()).hexdigest()}for name,original in sources.items()}}
(HERE/'proposal.json').write_text(json.dumps(metadata,indent=2)+'\n');print(json.dumps(metadata))
