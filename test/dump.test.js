import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { dumpDocument, truncateDump, DumpError, STRIP_MODES } from '../src/dump.js';

function fixture(source) { return new JSDOM(source, { url: 'https://fixture.test/path/page' }); }
const walk = node => [node, ...(node.children ?? []).flatMap(walk)];

test('HTML dump serializes document or first matching subtree without mutating the DOM', () => {
  const dom = fixture('<!doctype html><title>Fixture</title><p class=x hidden>A &amp; B</p><p class=x>Second</p><!-- own comment --><script>const x="<raw>";</script>');
  try {
    const { document } = dom.window;
    assert.ok(dumpDocument(document).startsWith('<!DOCTYPE html>\n<html><head><title>Fixture</title>'));
    assert.equal(dumpDocument(document, { selector: '.x' }), '<p class="x" hidden>A &amp; B</p>');
    assert.match(dumpDocument(document), /<!-- own comment -->/);
    assert.match(dumpDocument(document), /const x="<raw>"/);
    assert.equal(document.querySelectorAll('.x').length, 2);
    assert.throws(() => dumpDocument(document, { selector: '#absent' }), error => error instanceof DumpError && error.code === 'SelectorNotFound');
    assert.throws(() => dumpDocument(document, { selector: '[' }), error => error.code === 'InvalidSelector');
  } finally { dom.window.close(); }
});

test('UTF-8 caps preserve complete characters and append the native marker beyond the cap', () => {
  const input = '<h1>A 🐼 é 中文</h1>', marker = '\n\n[truncated]\n';
  assert.equal(truncateDump(input, 0), marker);
  assert.equal(truncateDump(input, 8), '<h1>A ' + marker);
  assert.equal(truncateDump(input, 9), '<h1>A ' + marker);
  assert.equal(truncateDump(input, 10), '<h1>A 🐼' + marker);
  assert.equal(truncateDump(input, 15), '<h1>A 🐼 é ' + marker);
  assert.equal(truncateDump(input, Buffer.byteLength(input)), input);
  assert.equal(truncateDump('', 0), '');
  assert.throws(() => truncateDump(input, -1), /non-negative integer/);
  const dom = fixture('<h1>A 🐼 é 中文</h1>');
  try {
    assert.equal(dumpDocument(dom.window.document, { format: 'markdown', selector: 'h1', maxBytes: 9 }), '\n# A 🐼' + marker);
    assert.throws(() => dumpDocument(dom.window.document, { format: 'semantic_tree_text', maxBytes: 10 }), /only for html and markdown/);
  } finally { dom.window.close(); }
});

test('all documented strip groups validate and unsupported effects reject explicitly', () => {
  const dom = fixture('<p>Content</p>');
  try {
    assert.deepEqual(STRIP_MODES, ['clutter', 'css', 'js', 'invisible', 'shell', 'ui']);
    for (const format of ['png', 'pdf', 'invented']) assert.throws(() => dumpDocument(dom.window.document, { format }), error => error.code === 'UnsupportedDumpFormat');
    assert.throws(() => dumpDocument(dom.window.document, { stripModes: ['invented'] }), /Unknown strip mode/);
    assert.throws(() => dumpDocument(dom.window.document, { stripModes: 'css' }), /must be an array/);
  } finally { dom.window.close(); }
});

test('JS/CSS/UI stripping removes real DOM groups independently and keeps live content intact', () => {
  const dom = fixture('<style>p{color:red}</style><link rel=stylesheet href=own.css><link rel=preload as=script href=own.js><script>window.own=true</script><p>Words</p><img alt=Own><picture>Picture</picture><video>Video</video><svg><title>Vector</title></svg>');
  try {
    const document = dom.window.document, js = dumpDocument(document, { stripModes: ['js'] });
    assert.doesNotMatch(js, /<script|as="script"/); assert.match(js, /<style>/);
    const css = dumpDocument(document, { stripModes: ['css'] });
    assert.doesNotMatch(css, /<style|rel="stylesheet"/); assert.match(css, /<script>/);
    const ui = dumpDocument(document, { stripModes: ['ui'] });
    assert.doesNotMatch(ui, /<img|<picture|<video|<svg|<style|rel="stylesheet"/); assert.match(ui, /<p>Words<\/p>/);
    assert.equal(document.querySelectorAll('script').length, 1); assert.equal(document.querySelectorAll('img').length, 1);
  } finally { dom.window.close(); }
});

test('invisible stripping follows authored display rules and composes with CSS removal', () => {
  const dom = fixture('<title>Keep head</title><style>.gone{display:none}</style><main><div class=gone>CSS hidden</div><div style="display:none">Inline hidden</div><template>Template</template><div hidden>Hidden attribute stays</div><div aria-hidden=true>ARIA stays</div><div style="visibility:hidden">Visibility stays</div><input type=hidden value=own><p>Content</p></main>');
  try {
    const output = dumpDocument(dom.window.document, { stripModes: ['css', 'invisible'] });
    assert.doesNotMatch(output, /CSS hidden|Inline hidden|Template|<style>/);
    assert.match(output, /<title>Keep head<\/title>/); assert.match(output, /Hidden attribute stays|ARIA stays|Visibility stays/);
    assert.match(output, /type="hidden" value="own"/);
    assert.ok(dom.window.document.querySelector('.gone'));
  } finally { dom.window.close(); }
});

test('shell stripping preserves article headers and falls back when almost everything is shell', () => {
  const dom = fixture('<header>Site header</header><nav>Navigation</nav><main><article><header>Article header</header><p>Article text.</p><footer>Article foot</footer></article></main><aside>Sidebar</aside><footer>Site foot</footer>');
  const fallback = fixture('<nav>All page content is here</nav>');
  try {
    const output = dumpDocument(dom.window.document, { stripModes: ['shell'] });
    assert.doesNotMatch(output, /Site header|Navigation|Sidebar|Site foot/);
    assert.match(output, /Article header/); assert.match(output, /Article foot/);
    assert.match(dumpDocument(fallback.window.document, { stripModes: ['shell'] }), /All page content is here/);
  } finally { dom.window.close(); fallback.window.close(); }
});

test('clutter keeps a strong main article, removes surrounding clutter, and preserves head metadata', () => {
  const dom = fixture(`<title>Article</title><p>Unrelated promotion</p><div><main><h1>News</h1><p>${'Actual article content. '.repeat(15)}</p><div style="display:none">Hidden ad</div></main><p>Unrelated recommendation</p></div>`);
  try {
    const output = dumpDocument(dom.window.document, { stripModes: ['clutter'] });
    assert.match(output, /Actual article content/); assert.match(output, /<title>Article<\/title>/);
    assert.doesNotMatch(output, /Unrelated|Hidden ad/);
    assert.match(dom.window.document.body.textContent, /Unrelated promotion/);
  } finally { dom.window.close(); }
});

test('Markdown includes resolved links, lists, code, tables and visible content', () => {
  const dom = fixture('<h1>Heading</h1><p>One <a href="/relative">link</a>.</p><p>Two</p><ul><li>A</li><li>B</li></ul><ol><li>X</li><li>Y</li></ol><pre>raw\ncode</pre><table><tr><th>A</th><th>B</th></tr><tr><td>C</td><td>D</td></tr></table><div hidden>Not shown</div>');
  try {
    assert.equal(dumpDocument(dom.window.document, { format: 'markdown' }), '\n# Heading\n\nOne [link](https://fixture.test/relative).\n\nTwo\n- A\n- B\n1. X\n2. Y\n\n```\nraw\ncode\n```\n\n| A | B |\n|---|---|\n| C | D |\n');
  } finally { dom.window.close(); }
});

test('structured data retains raw JSON-LD, duplicate fields, social metadata and alternate links', () => {
  const dom = fixture('<title>Title</title><meta name=description content=One><meta name=description content=Two><meta property=og:title content=OG><meta name=twitter:card content=summary><meta charset=utf-8><meta name=__proto__ content=Own><link rel=canonical href="/canonical"><link rel=alternate type=text/markdown href="own.md"><script type="application/ld+json">{"a":1}</script><script type="application/ld+json">broken</script><main><h1>Body</h1></main>');
  try {
    const result = JSON.parse(dumpDocument(dom.window.document, { format: 'structured_data' }));
    assert.deepEqual(result.jsonLd, ['{"a":1}', 'broken']); assert.deepEqual(result.meta.description, ['One', 'Two']);
    assert.deepEqual(result.openGraph, { title: 'OG' }); assert.deepEqual(result.twitterCard, { card: 'summary' });
    assert.equal(result.links.canonical, 'https://fixture.test/canonical'); assert.equal(result.meta.__proto__, 'Own');
    assert.deepEqual(result.alternate, [{ href: 'https://fixture.test/path/own.md', type: 'text/markdown' }]);
    assert.deepEqual(JSON.parse(dumpDocument(dom.window.document, { format: 'structured_data', selector: 'main' })), { jsonLd: [], openGraph: {}, twitterCard: {}, meta: {}, links: {} });
  } finally { dom.window.close(); }
});

test('Markdown and metadata resolve against the original document and explicit base, preserving unresolved data URLs', () => {
  const source = '<base href="/assets/"><link rel=canonical href="../canonical"><link rel=alternate type=text/markdown href="own.md"><p><a href=next>Next</a><a href="/root">Root</a><img src="image.png" alt=Panda></p>';
  const http = fixture(source), data = new JSDOM('<link rel=canonical href="/canonical"><link rel=alternate type=text/markdown href="own.md"><p><a href=next>Next</a><a href="/root">Root</a><img src="image.png" alt=Panda></p>', { url: 'data:text/html,own' });
  try {
    const resolved = dumpDocument(http.window.document, { format: 'markdown' });
    assert.match(resolved, /\[Next\]\(https:\/\/fixture.test\/assets\/next\)/);
    assert.match(resolved, /\[Root\]\(https:\/\/fixture.test\/root\)/);
    assert.match(resolved, /!\[Panda\]\(https:\/\/fixture.test\/assets\/image.png\)/);
    assert.doesNotMatch(resolved, /\]\(next\)|\]\(\/root\)|\]\(image.png\)/);
    const metadata = JSON.parse(dumpDocument(http.window.document, { format: 'structured_data' }));
    assert.equal(metadata.links.canonical, 'https://fixture.test/canonical');
    assert.equal(metadata.alternate[0].href, 'https://fixture.test/assets/own.md');
    const unresolved = dumpDocument(data.window.document, { format: 'markdown' });
    assert.equal(unresolved, '\n[Next](next)[Root](/root)![Panda](image.png)\n');
    assert.doesNotMatch(unresolved, /https?:\/\/|data:/);
    const unresolvedMetadata = JSON.parse(dumpDocument(data.window.document, { format: 'structured_data' }));
    assert.equal(unresolvedMetadata.links.canonical, '/canonical'); assert.equal(unresolvedMetadata.alternate[0].href, 'own.md');
  } finally { http.window.close(); data.window.close(); }
});

test('HTML retains source attributes by default and optionally prepends an absolute base without changing live DOM', () => {
  const dom = fixture('<title>Base</title><base href="/assets/"><a href=next>Next</a>');
  try {
    const original = dumpDocument(dom.window.document);
    assert.match(original, /<head><title>Base<\/title><base href="\/assets\/">/);
    assert.match(original, /<a href="next">Next<\/a>/);
    const withBase = dumpDocument(dom.window.document, { withBase: true });
    assert.match(withBase, /<head><base href="https:\/\/fixture.test\/assets\/"><title>Base<\/title><base href="\/assets\/">/);
    assert.equal(dom.window.document.querySelectorAll('base').length, 1);
    assert.equal(dumpDocument(dom.window.document, { selector: 'head', withBase: true }), dumpDocument(dom.window.document, { selector: 'head' }));
    assert.equal(dumpDocument(dom.window.document), original);
  } finally { dom.window.close(); }
});

test('semantic JSON describes structure, names, controls, current values and source node identity', () => {
  const dom = fixture('<title>Semantic</title><main><label for=name>Name</label><input id=name value=old><input type=checkbox checked><button disabled aria-label=Send>Visible text</button><select><option value=a selected>One</option></select><p>Words</p><div hidden>Hidden</div><div aria-hidden=true>ARIA remains</div></main>');
  try {
    const document = dom.window.document; document.querySelector('#name').value = 'Current';
    const ids = new WeakMap(); let next = 100;
    const idFor = node => { assert.equal(node === document || node.ownerDocument === document, true); if (!ids.has(node)) ids.set(node, next++); return ids.get(node); };
    const tree = JSON.parse(dumpDocument(document, { format: 'semantic_tree', nodeIdFor: idFor }));
    assert.equal(tree.nodeName, 'root'); assert.equal(tree.backendDOMNodeId, 100);
    const nodes = walk(tree), input = nodes.find(node => node.attributes?.id === 'name');
    assert.equal(input.role, 'textbox'); assert.equal(input.name, 'Name'); assert.equal(input.value, 'Current');
    assert.ok(nodes.some(node => node.role === 'checkbox' && node.checked));
    assert.ok(nodes.some(node => node.role === 'button' && node.isDisabled && node.name === 'Send'));
    assert.deepEqual(nodes.find(node => node.role === 'combobox').options, [{ value: 'a', text: 'One', selected: true }]);
    assert.equal(nodes.some(node => node.nodeValue === 'Hidden'), false); assert.ok(nodes.some(node => node.nodeValue === 'ARIA remains'));
    assert.equal(input.backendDOMNodeId, idFor(document.querySelector('#name')));
  } finally { dom.window.close(); }
});

test('semantic text prunes wrappers and named children while retaining interactive state', () => {
  const dom = fixture('<title>Controls</title><main><h1>Title</h1><p>Content <b>bold</b>.</p><input type=checkbox checked><button disabled aria-label=Send>Visible</button></main>');
  try {
    const output = dumpDocument(dom.window.document, { format: 'semantic_tree_text' });
    assert.match(output, /^1 RootWebArea 'Controls'\n/); assert.match(output, /heading 'Title'/);
    assert.match(output, /\[i\] checkbox value='on' \[checked\]/); assert.match(output, /\[i:disabled\] button 'Send'/);
    assert.doesNotMatch(output, /Visible|\bmain\b|\bnone\b/); assert.match(output, /'bold'/);
    assert.ok(!dumpDocument(dom.window.document, { format: 'semantic_tree_text', selector: 'main' }).includes('RootWebArea'));
  } finally { dom.window.close(); }
});

test('prototype text and absolute-link extra formats remain available with selectors', () => {
  const dom = fixture('<main><p>Visible <b>text</b></p><script>own()</script><a href="/next">Next</a></main><a href="/outside">Outside</a>');
  try {
    assert.equal(dumpDocument(dom.window.document, { format: 'text', selector: 'p' }), 'Visible text');
    assert.deepEqual(JSON.parse(dumpDocument(dom.window.document, { format: 'links', selector: 'main' })), [{ text: 'Next', href: 'https://fixture.test/next' }]);
  } finally { dom.window.close(); }
});

test('captured native dump fixtures agree across selector, cap, strip, semantic and metadata cases', async () => {
  let count = 0;
  for (const file of ['dump-observations.json', 'dump-structure-observations.json', 'dump-detail-observations.json', 'dump-http-observations.json', 'dump-base-selector-observations.json']) {
    const { observations } = JSON.parse(await readFile(new URL(`../docs/reference/${file}`, import.meta.url), 'utf8'));
    for (const sample of observations) {
      if (!sample.result || sample.result.error) continue;
      const dom = new JSDOM(sample.source, { url: sample.url ?? 'data:text/html,' + encodeURIComponent(sample.source) });
      const options = { format: sample.format, stripModes: [], selector: sample.selector, withBase: sample.withBase ?? false };
      for (let index = 0; index < (sample.flags ?? []).length; index++) {
        const key = sample.flags[index], value = sample.flags[index + 1];
        if (key === '--dump-selector') options.selector = value;
        if (key === '--dump-max-bytes') options.maxBytes = Number(value);
        if (key === '--strip-mode') options.stripModes.push(value);
      }
      try { assert.equal(dumpDocument(dom.window.document, options), sample.result.content, `${sample.name}/${sample.format}`); count++; }
      finally { dom.window.close(); }
    }
  }
  assert.equal(count, 47);
});
