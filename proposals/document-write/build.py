import difflib,hashlib,json,os,shutil,tempfile
from pathlib import Path
HERE=Path(__file__).resolve().parent
base=Path(json.loads((HERE/'manifest.json').read_text())['snapshot'])
target=Path(tempfile.mkdtemp(prefix='red-panda-document-write-proposal-',dir='/tmp'))
for name in ['src','native']:shutil.copytree(base/name,target/name)
shutil.copy2(base/'package.json',target/'package.json');os.symlink(base/'node_modules',target/'node_modules')
sources={}
def replace(source,before,after):
 if source.count(before)!=1:raise RuntimeError(f'Changed integration point ({source.count(before)}): {before}')
 return source.replace(before,after)
def write(name,source):sources[name]=(base/name).read_text();(target/name).write_text(source)

source=(base/'src/shadow.js').read_text()
source=replace(source,'      declarativeAdapter(options.treeAdapter, permit.record);',
'''      declarativeAdapter(options.treeAdapter, permit.record);
      if (permit.executeScripts) {
        const pop = options.treeAdapter.onItemPop;
        options.treeAdapter.onItemPop = function (node, ...args) {
          const script = node.localName === 'script' && node.namespaceURI === HTML && node._parserInserted;
          const attached = node._attached;
          // Written scripts are prepared during the real fragment parse, before
          // its live-DOM splice. isConnected still reflects the detached tree.
          if (script) node._attached = true;
          try { return pop.call(this, node, ...args); }
          finally { if (script) node._attached = attached || node.isConnected; }
        };
      }''')
source+='''
// Scope one actual fragment-parser entry. Nested ordinary innerHTML parsing
// remains inert after the permit is consumed, as with setHTMLUnsafe.
export function parseDocumentWriteFragment(document, markup) {
  patchHosts();
  const context = document.createElement('div');
  FORCED_FRAGMENTS.set(context, { record: recordFor(document), executeScripts: true });
  try { return htmlParser.parseFragment(markup, context); }
  finally { FORCED_FRAGMENTS.delete(context); }
}
'''
write('src/shadow.js',source)

source=(base/'src/classic-scripts.js').read_text()
source="import { parseDocumentWriteFragment } from './shadow.js';\n"+source
source=replace(source,'function patch() {',
'''// Queue ownership remains with the real loader. Drop only delivery into an
// inactive Document; completed bytes/error cleanup still drain the retired
// queue without dispatching late events or invoking its DOM callbacks.
function fetchOwnedResource(record, loader, fetch, url, options) {
  const names = ['_queue', '_deferQueue', '_asyncQueue'];
  const previous = names.map(name => loader[name]);
  for (let index = 0; index < names.length; index++) {
    const queue = previous[index];
    loader[names[index]] = Object.create(queue, { push: { value(request, loaded, failed, ...args) {
      const guard = callback => typeof callback === 'function'
        ? (...values) => {
          if (active(record)) return callback(...values);
          loader._requestManager.remove(request);
          return Promise.resolve();
        }
        : callback;
      return queue.push(request, guard(loaded), guard(failed), ...args);
    } } });
  }
  try { return fetch.call(loader, url, options); }
  finally { for (let index = 0; index < names.length; index++) loader[names[index]] = previous[index]; }
}

function patch() {''')
source=replace(source,'      const request = fetchResource.call(this, url, options);',
                 '      const request = fetchOwnedResource(record, this, fetchResource, url, options);')
source=replace(source,"    if (element.localName !== 'script') return fetchResource.call(this, url, options);",
                 "    if (element.localName !== 'script') return fetchOwnedResource(record, this, fetchResource, url, options);")
source=replace(source,'      request = fetchResource.call(this, url, { ...options, onLoad(data) {',
                 '      request = fetchOwnedResource(record, this, fetchResource, url, { ...options, onLoad(data) {')
before='''    const parent = anchor?.parentNode, boundary = anchor?.nextSibling;
    const result = writeDocument.apply(this, args);'''
after='''    if (active(record) && anchor && this._parsingMode === 'html' && !this._throwOnDynamicMarkupInsertionCounter) {
      const fragment = parseDocumentWriteFragment(this, args.join(''));
      // Fragment scripts can remove the writing script while parsing. Preserve
      // their actual effects and stop the splice if its live anchor vanished.
      if (!active(record)) return;
      const parent = anchor.parentNode;
      if (!parent) return;
      let cursor = anchor;
      while (fragment.firstChild) {
        const node = fragment.firstChild;
        parent.insertBefore(node, cursor.parentNode === parent ? cursor.nextSibling : null);
        cursor = node;
      }
      this._writeAfterElement = cursor;
      return;
    }
    const parent = anchor?.parentNode, boundary = anchor?.nextSibling;
    const result = writeDocument.apply(this, args);'''
source=replace(source,before,after)
write('src/classic-scripts.js',source)

source=(base/'src/frames.js').read_text()
marker='function stale() {'
helper='''// Keep retained inactive Documents as real DOM trees. Delegate every other
// cleanup operation to the original close, including timers, requests and ports.
function closeRetainingDocument(document, close) {
  const view = document._defaultView;
  // Registry teardown already discarded child browsing contexts. Remove their
  // Window accessors before native close recurses; retained iframe DOM nodes
  // no longer have a live contentWindow after their own teardown.
  if (view) {
    for (let index = 0; index < view._length; index++) Reflect.deleteProperty(view, String(index));
    view._length = 0;
  }
  document._lastFocusedElement = null;
  const body = document.body;
  const descriptor = body && Object.getOwnPropertyDescriptor(body, '_replaceAll');
  const replaceAll = body?._replaceAll;
  let pending = true;
  if (body) Object.defineProperty(body, '_replaceAll', { configurable: true, writable: true, value(node, ...args) {
    // Pinned jsdom's native close clears body.innerHTML with an empty real
    // fragment. Skip only that destructive teardown replacement, not parsing
    // or public mutation methods, and restore the private method immediately.
    if (pending && node?.nodeType === 11 && !node.firstChild) { pending = false; return; }
    return replaceAll.call(this, node, ...args);
  } });
  try { return close(); }
  finally {
    if (body) { if (descriptor) Object.defineProperty(body, '_replaceAll', descriptor); else delete body._replaceAll; }
    document._defaultView = null;
  }
}

'''
source=replace(source,marker,helper+marker)
source=replace(source,'    childWindow.close = () => { if (record.page === framePage) destroyDocument(record); return closed(); };',
'''    childWindow.close = () => {
      if (record.page === framePage) destroyDocument(record);
      return closeRetainingDocument(impl, closed);
    };''')
source=replace(source,'    for (const child of children(root)) registry.detach(child.element);',
'''    for (const child of children(root)) registry.detach(child.element);
    for (let index = 0; index < window._length; index++) Reflect.deleteProperty(window, String(index));
    window._length = 0;''')
write('src/frames.js',source)

source=(base/'src/document-reset.js').read_text()
source=replace(source,'    const context = contexts.get(this);\n    if (eligible(context) && this._throwOnDynamicMarkupInsertionCounter)',
'''    const context = contexts.get(this);
    if (context && this._parsingMode === 'html' && !active(context)) return this;
    if (eligible(context) && this._throwOnDynamicMarkupInsertionCounter)''')
source=replace(source,"    if (this._parsingMode === 'xml' || this._throwOnDynamicMarkupInsertionCounter) return write.apply(this, args);",
'''    if (this._parsingMode === 'xml' || this._throwOnDynamicMarkupInsertionCounter) return write.apply(this, args);
    if (context && !active(context)) return;''')
source=replace(source,'    const context = contexts.get(this), cycle = context?.current;',
'''    const context = contexts.get(this), cycle = context?.current;
    if (context && this._parsingMode === 'html' && !active(context)) return;''')
write('src/document-reset.js',source)

patch=''.join(''.join(difflib.unified_diff(original.splitlines(True),(target/name).read_text().splitlines(True),fromfile='a/'+name,tofile='b/'+name))for name,original in sources.items())
(HERE/'integration.patch').write_text(patch)
metadata={'kind':'isolated-document-write-compatibility-proposal','baseSnapshot':str(base),'snapshot':str(target),'productionFilesModified':False,
 'files':{name:{'baseSHA256':hashlib.sha256(original.encode()).hexdigest(),'proposedSHA256':hashlib.sha256((target/name).read_bytes()).hexdigest()}for name,original in sources.items()}}
(HERE/'proposal.json').write_text(json.dumps(metadata,indent=2)+'\n');print(json.dumps(metadata))
