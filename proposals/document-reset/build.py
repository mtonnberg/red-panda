"""Build an isolated reviewable overlay; never mutate the working runtime."""
import difflib
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
snapshot = Path(tempfile.mkdtemp(prefix='red-panda-postload-reset-', dir='/tmp'))
for name in ['src', 'native']:
    shutil.copytree(ROOT / name, snapshot / name)
shutil.copy2(ROOT / 'package.json', snapshot / 'package.json')
os.symlink(ROOT / 'node_modules', snapshot / 'node_modules')
originals = {}

def replace(source, before, after):
    if source.count(before) != 1:
        raise RuntimeError(f'Expected one integration point, found {source.count(before)}: {before}')
    return source.replace(before, after)

def write(name, source):
    originals[name] = (ROOT / name).read_text() if (ROOT / name).exists() else ''
    (snapshot / name).write_text(source)

source = (ROOT / 'src/classic-scripts.js').read_text()
source = "import { installDocumentReset } from './document-reset.js';\n" + source
start = source.index('    const parser = new parse5.Parser(options, undefined, null, script => {')
end = source.index('    record.parser = parser; record.parserDone = false;', start)
construction = source[start:end]
factory = 'function makeParser(record, options) {\n' + '\n'.join(line[2:] if line.startswith('  ') else line for line in construction.rstrip().splitlines()) + '\n  return parser;\n}\n\n'
source = source[:start] + '    record.parserOptions = options;\n    const parser = makeParser(record, options);\n' + source[end:]
source = replace(source, 'function patch() {', factory + 'function patch() {')
source = replace(source, 'if (!active(record) || parser.tokenizer.paused || !parser.stopped) return;',
                 'if (!active(record) || record.parser !== parser || parser.tokenizer.paused || !parser.stopped) return;')
source = replace(source, 'signal: record.signal, active: () => active(record),',
                 'signal: record.signal, active: () => active(record) && record.parser === parser,')
source = replace(source, '  try { return evaluate(); }\n  finally { if (parserScript) record.parserScriptDepth--; }',
'''  const writeParser = parserScript && record.stream?.kind === 'write' ? record.stream : null;
  const entered = writeParser?.enterScript();
  try { return evaluate(); }
  finally {
    if (entered) writeParser.leaveScript();
    if (parserScript) record.parserScriptDepth--;
  }''')
source = replace(source, '    record.disposed = true; record.stream?.abort();',
                 '    record.disposed = true; record.resetController?.dispose(); record.stream?.abort();')
source = replace(source, '  if (record.signal?.aborted || page.closed) dispose();',
                 '  record.resetController = installDocumentReset(page, window, record, makeParser, finishParser);\n  if (record.signal?.aborted || page.closed) dispose();')
write('src/classic-scripts.js', source)

source = (ROOT / 'src/browser.js').read_text()
source = "import { installListenerOwnership } from './listener-ownership.js';\n" + source
source = replace(source, '  prepareWindow(window, historyState = null, { main = true } = {}) {',
'''  prepareWindow(window, historyState = null, { main = true } = {}) {
    const listenerOwnership = installListenerOwnership(window);
    listenerOwnership.scope(() => {''')
source = replace(source, '    installModuleScripts(this, window);', '    this.moduleScripts = installModuleScripts(this, window);')
source = replace(source, '    for (const { source } of this.newDocumentScripts.values()) {',
                 '    });\n    for (const { source } of this.newDocumentScripts.values()) {')
source = replace(source, "else this.dom.window.document.addEventListener('DOMContentLoaded', resolve, { once: true });",
                 "else installListenerOwnership(this.dom.window).add(this.dom.window.document, 'DOMContentLoaded', resolve, { once: true });")
source = replace(source, "else this.dom.window.addEventListener('load', resolve, { once: true });",
                 "else installListenerOwnership(this.dom.window).add(this.dom.window, 'load', resolve, { once: true });")
write('src/browser.js', source)

source = (ROOT / 'src/frames.js').read_text()
source = "import { installListenerOwnership } from './listener-ownership.js';\n" + source
source = replace(source, "    record.document.addEventListener('DOMContentLoaded', () => {",
'''    installListenerOwnership(childWindow._globalProxy).scope(() => {
    record.document.addEventListener('DOMContentLoaded', () => {''')
source = replace(source, "    for (const type of ['log', 'info', 'warn', 'error', 'debug']) childWindow.console[type]",
                 "    });\n    for (const type of ['log', 'info', 'warn', 'error', 'debug']) childWindow.console[type]")
source = replace(source, "registry.announce('frameDOMContentLoaded', { frameId: record.id, loaderId: framePage.loaderId });\n    }, { once: true });",
                 "registry.announce('frameDOMContentLoaded', { frameId: record.id, loaderId: framePage.loaderId });\n    });")
source = replace(source, "registry.announce('frameLoad', { frameId: record.id, loaderId: framePage.loaderId });\n    }, { once: true });",
                 "registry.announce('frameLoad', { frameId: record.id, loaderId: framePage.loaderId });\n    });")
source = replace(source, "else current.dom.window.addEventListener(waitUntil === 'domcontentloaded' ? 'DOMContentLoaded' : 'load', resolve, { once: true });",
                 "else installListenerOwnership(current.dom.window).add(current.dom.window, waitUntil === 'domcontentloaded' ? 'DOMContentLoaded' : 'load', resolve, { once: true });")
write('src/frames.js', source)

source = (ROOT / 'src/modules.js').read_text()
source = replace(source, '  const tasks = new Set();', '  const cycles = new Set();\n  let parseCycle;')
source = replace(source, 'let context, observer, started = false, disposed = false,', 'let context, observer, disposed = false,')
source = replace(source, '  let resolveReady, releaseAbort;\n  const ready = new Promise(resolve => { resolveReady = resolve; });', '  let releaseAbort;')
source = replace(source, '  page.moduleReady = ready;\n', '')
source = replace(source, 'function dispose() { disposed = true; observer?.disconnect(); releaseAbort(); resolveReady(); }',
                 'function dispose() { disposed = true; observer?.disconnect(); releaseAbort(); for (const cycle of cycles) cycle.resolveReady(); }')
source = replace(source, '''  function track(task) {
    tasks.add(task); task.then(() => tasks.delete(task), () => tasks.delete(task)); return task;
  }
  function execute(script, prepared) {''', '''  function track(task, cycle) {
    cycle.tasks.add(task); task.then(() => cycle.tasks.delete(task), () => cycle.tasks.delete(task)); return task;
  }
  function execute(script, prepared, cycle = parseCycle) {''')
source = replace(source, '    })());\n  }\n  function discover(root = document) {',
                 '    })(), cycle);\n  }\n  function discover(root = document, includeParser = false) {')
source = replace(source, "      if (!script.isConnected || !['module', 'importmap'].includes(script.getAttribute('type')?.trim().toLowerCase()) || seen.has(script)) return false;",
'''      if (!script.isConnected || !['module', 'importmap'].includes(script.getAttribute('type')?.trim().toLowerCase()) || seen.has(script)) return false;
      if (!includeParser && !parseCycle.started && implForWrapper(script)._parserInserted) return false;''')
source = replace(source, '''  async function begin() {
    if (started) return;
    started = true;
    if (!active() || page.javascript === false) { resolveReady(); return; }''',
'''  async function begin(cycle = parseCycle) {
    if (cycle.started || cycle !== parseCycle) return;
    cycle.started = true;
    if (!active() || page.javascript === false) { cycle.resolveReady(); return; }''')
source = replace(source, '    const scripts = discover(), prepared = scripts.map(', '    const scripts = discover(document, true), prepared = scripts.map(')
source = replace(source, '      if (!active()) break;', '      if (!active() || cycle !== parseCycle) break;')
source = replace(source, '        execute(script, prepared[index]); continue;', '        execute(script, prepared[index], cycle); continue;')
source = replace(source, '        await link(module);\n        check();\n        startEvaluation(module);', '        await link(module);\n        check();\n        if (cycle !== parseCycle) break;\n        startEvaluation(module);')
source = replace(source, '        execute(script, Promise.resolve(module));', '        execute(script, Promise.resolve(module), cycle);')
source = replace(source, '    observer = createInternalMutationObserver(window, records => {', '    if (!observer) {\n    observer = createInternalMutationObserver(window, records => {')
source = replace(source, "    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'type'] });",
                 "    observer.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'type'] });\n    }")
source = replace(source, '      while (active() && tasks.size) await Promise.race([Promise.all([...tasks]), aborted]);\n      resolveReady();',
                 '      while (active() && cycle.tasks.size) await Promise.race([Promise.all([...cycle.tasks]), aborted]);\n      cycle.resolveReady();')
source = replace(source, '''  impl._deferQueue.push(Promise.resolve(), () => begin().catch(error => { report(error); resolveReady(); }), null, false);
  return { ready, start: begin, dispose };''', '''  function beginParseCycle(queue, token = null) {
    if (parseCycle && !parseCycle.started) parseCycle.resolveReady();
    let resolve;
    const cycle = { token, started: false, tasks: new Set(), done: false, ready: new Promise(done => { resolve = done; }),
      resolveReady() { if (!cycle.done) { cycle.done = true; cycles.delete(cycle); resolve(); } } };
    cycles.add(cycle); parseCycle = cycle; page.moduleReady = cycle.ready;
    queue.push(Promise.resolve(), () => begin(cycle).catch(error => { report(error); cycle.resolveReady(); }), null, false);
    return cycle.ready;
  }
  beginParseCycle(impl._deferQueue);
  return { get ready() { return parseCycle.ready; }, start: () => begin(parseCycle), beginParseCycle, dispose };''')
write('src/modules.js', source)

write('src/document-reset.js', (HERE / 'runtime/document-reset.js').read_text())
write('src/write-created-parser.js', (ROOT / 'docs/reference/write-created-parser.mjs').read_text())
write('src/listener-ownership.js', (ROOT / 'docs/reference/listener-ownership.mjs').read_text())
patch = ''.join(''.join(difflib.unified_diff(original.splitlines(True), (snapshot / name).read_text().splitlines(True),
                  fromfile=f'a/{name}' if original else '/dev/null', tofile=f'b/{name}')) for name, original in originals.items())
(HERE / 'integration.patch').write_text(patch)
manifest = {'kind': 'unapplied-post-load-document-reset-proposal', 'snapshot': str(snapshot),
            'baseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
            'productionFilesModified': False, 'files': {name: {'baseSHA256': hashlib.sha256(original.encode()).hexdigest() if original else None,
              'proposedSHA256': hashlib.sha256((snapshot / name).read_bytes()).hexdigest()} for name, original in originals.items()}}
(HERE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest))
