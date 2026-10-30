// Build an isolated proposal only. Importing this helper does not change the
// current runtime; the adapter is copied and patched before later integration.
import path from 'node:path';
import { cp, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export async function createParserWriteProposal() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const filename = path.join(root, 'src/classic-scripts.js');
  const original = await readFile(filename, 'utf8'); let source = original;
  const replace = (before, after) => {
    if (source.indexOf(before) < 0 || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Classic proposal integration changed: ${before}`);
    source = source.replace(before, after);
  };
  replace('function state(script) {', `// Track only scripts actually being evaluated on behalf of the active parser.
// A dynamic nested inline script inherits that nesting; an unrelated async
// script executing while the parser is waiting does not acquire it.
function duringParserScript(record, script, evaluate) {
  const parserScript = record.parser && !record.parserDone &&
    (record.parserScriptDepth > 0 || (script._parserInserted &&
      (record.parser.tokenizer.inLoop || record.blocker?.script === script)));
  if (parserScript) record.parserScriptDepth = (record.parserScriptDepth ?? 0) + 1;
  try { return evaluate(); }
  finally { if (parserScript) record.parserScriptDepth--; }
}
function state(script) {`);
  replace('const closeDocument = DocumentImpl.prototype.close;',
    'const closeDocument = DocumentImpl.prototype.close;\n  const openDocument = DocumentImpl.prototype.open, writeDocument = DocumentImpl.prototype.write;');
  replace('  DocumentImpl.prototype.close = function (...args) {', `  DocumentImpl.prototype.open = function (...args) {
    const record = documents.get(this);
    // The HTML open algorithm returns the current document while a parser
    // script is on the stack. Do not apply this new no-op branch to XML or
    // custom-element dynamic-markup scopes; their existing behavior is retained.
    if (active(record) && record.parserScriptDepth > 0 &&
        this._parsingMode !== 'xml' && !this._throwOnDynamicMarkupInsertionCounter) return this;
    return openDocument.apply(this, args);
  };
  DocumentImpl.prototype.write = function (...args) {
    const record = documents.get(this), anchor = this._writeAfterElement;
    const parent = anchor?.parentNode, boundary = anchor?.nextSibling;
    const result = writeDocument.apply(this, args);
    // Follow the actual insertion boundary, including nodes produced by a
    // nested written script. The next write must follow the preceding write.
    // If page code detached the old boundary/anchor, leave its mutation intact.
    if (active(record) && parent && anchor.parentNode === parent &&
        (!boundary || boundary.parentNode === parent)) {
      const cursor = boundary ? boundary.previousSibling : parent.lastChild;
      if (cursor?.parentNode === parent) this._writeAfterElement = cursor;
    }
    return result;
  };
  DocumentImpl.prototype.close = function (...args) {`);
  replace('return this._innerEval(this.text, document.URL);',
    'return duringParserScript(record, this, () => this._innerEval(this.text, document.URL));');
  replace('return options.onLoad?.(data);',
    'return duringParserScript(record, element, () => options.onLoad?.(data));');
  const snapshot = await mkdtemp(path.join(tmpdir(), 'red-panda-parser-write-proposal-'));
  for (const name of ['src', 'native', 'package.json']) await cp(path.join(root, name), path.join(snapshot, name), { recursive: true });
  await symlink(path.join(root, 'node_modules'), path.join(snapshot, 'node_modules'), 'dir');
  await writeFile(path.join(snapshot, 'src/classic-scripts.js'), source);
  const diff = spawnSync('diff', ['-u', '--label', 'a/src/classic-scripts.js', '--label', 'b/src/classic-scripts.js',
    filename, path.join(snapshot, 'src/classic-scripts.js')], { encoding: 'utf8' });
  if (diff.status !== 1) throw new Error(`Expected an isolated changed adapter: ${diff.stderr}`);
  const hash = value => createHash('sha256').update(value).digest('hex');
  const proposal = { kind: 'unapplied-bounded-parser-write-proposal', snapshot, productionFilesModified: false,
    baseClassicSHA256: hash(original), proposedClassicSHA256: hash(source),
    fixes: ['sequential script write call order', 'open no-op during active parser-script evaluation'],
    remaining: ['post-load document reset lifetime/listeners/readyState', 'nested written external synchronous execution', 'native nested-written-inline deferred insertion timing'] };
  await writeFile(new URL('./parser-write-integration.patch', import.meta.url), diff.stdout);
  await writeFile(new URL('./parser-write-proposal.json', import.meta.url), JSON.stringify(proposal, null, 2) + '\n');
  return proposal;
}
