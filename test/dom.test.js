import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser } from '../src/browser.js';
import { runDOM, supportsDOM, resetDOM } from '../src/dom.js';

async function fixture() {
  const browser = new Browser();
  const page = browser.createPage();
  await page.navigate(`data:text/html,${encodeURIComponent(`<!doctype html><title>DOM fixture</title>
    <main id="root"><input id="edit" value="original"><p class="item" data-note="needle">First <b>bold</b></p>
    <p class="item">Second</p><div id="shadow"></div><template id="template"><span>template child</span></template></main>`)}`);
  let nextNodeId = 1, nextObjectId = 1;
  const session = {
    page, nodes: new Map(), objects: new Map(), worlds: new Map([['utility', 999]]), domains: new Set(), events: [],
    backendId(node) {
      for (const [id, value] of this.nodes) if (value === node) return id;
      const id = nextNodeId++; this.nodes.set(id, node); return id;
    },
    object(id) {
      if (!this.objects.has(id)) throw Object.assign(new Error('Unknown object'), { code: -32602 });
      return this.objects.get(id).value;
    },
    remote(value, byValue, group) {
      const objectId = `object-${nextObjectId++}`;
      this.objects.set(objectId, { value, group }); return { type: 'object', subtype: 'node', objectId };
    },
    event(method, params) { if (this.domains.has('DOM')) this.events.push({ method, params }); },
  };
  return { browser, page, session, document: page.dom.window.document,
    run: (method, params) => runDOM(session, method, params),
    close: () => { resetDOM(session); browser.close(); } };
}

const descendants = node => [node, ...(node.children ?? []).flatMap(descendants)];
const settle = () => new Promise(resolve => setImmediate(resolve));

test('DOM document trees honor depth, stable node IDs, attributes and whitespace mode', async () => {
  const f = await fixture();
  try {
    const shallow = f.run('DOM.getDocument', { depth: 0 }).root;
    assert.equal(shallow.nodeType, 9); assert.equal(shallow.children, undefined);
    assert.equal(shallow.documentURL, f.page.url);
    assert.equal(f.session.domains.has('DOM'), true);
    const deep = f.run('DOM.getDocument', { depth: -1 }).root;
    assert.equal(deep.nodeId, shallow.nodeId);
    assert.ok(descendants(deep).some(node => node.localName === 'b' && node.children[0].nodeValue === 'bold'));
    const input = descendants(deep).find(node => node.localName === 'input');
    assert.deepEqual(input.attributes, ['id', 'edit', 'value', 'original']);
    assert.equal(descendants(deep).some(node => node.nodeType === 3 && !/\S/.test(node.nodeValue)), false);
    f.run('DOM.enable', { includeWhitespace: 'all' });
    const all = f.run('DOM.getDocument', { depth: -1 }).root;
    assert.ok(descendants(all).some(node => node.nodeType === 3 && !/\S/.test(node.nodeValue)));
    assert.throws(() => f.run('DOM.getDocument', { depth: -2 }), error => error.code === -32602);
  } finally { f.close(); }
});

test('DOM selectors operate on their selected subtree and expose paths to returned nodes', async () => {
  const f = await fixture();
  try {
    const root = f.run('DOM.getDocument').root;
    const main = f.run('DOM.querySelector', { nodeId: root.nodeId, selector: '#root' }).nodeId;
    assert.ok(main > 0);
    const items = f.run('DOM.querySelectorAll', { nodeId: main, selector: '.item' }).nodeIds;
    assert.equal(items.length, 2);
    assert.equal(f.run('DOM.querySelector', { nodeId: main, selector: '#root' }).nodeId, 0);
    assert.equal(f.run('DOM.querySelector', { nodeId: main, selector: '.missing' }).nodeId, 0);
    assert.ok(f.session.events.some(event => event.method === 'DOM.setChildNodes'));
    assert.throws(() => f.run('DOM.querySelector', { nodeId: main, selector: '[' }), error => error.code === -32602);
    assert.throws(() => f.run('DOM.querySelectorAll', { nodeId: 987654, selector: '*' }), /Unknown DOM node/);
  } finally { f.close(); }
});

test('DOM remote-object round trips validate node identities and execution contexts', async () => {
  const f = await fixture();
  try {
    f.run('DOM.getDocument');
    const input = f.document.querySelector('#edit');
    const remote = f.session.remote(input);
    const requested = f.run('DOM.requestNode', { objectId: remote.objectId });
    const described = f.run('DOM.describeNode', { nodeId: requested.nodeId, depth: 0 }).node;
    assert.equal(described.localName, 'input');
    const resolved = f.run('DOM.resolveNode', { backendNodeId: described.backendNodeId, objectGroup: 'test-group', executionContextId: 999 }).object;
    assert.equal(f.session.object(resolved.objectId), input);
    assert.equal(f.session.objects.get(resolved.objectId).group, 'test-group');
    assert.throws(() => f.run('DOM.resolveNode', { nodeId: requested.nodeId, executionContextId: -1 }), /Cannot find context/);
    assert.throws(() => f.run('DOM.describeNode', { nodeId: requested.nodeId, backendNodeId: requested.nodeId }), /Exactly one/);
    const notANode = f.session.remote({ nodeType: 1 });
    assert.throws(() => f.run('DOM.requestNode', { objectId: notANode.objectId }), /Unknown DOM node/);
  } finally { f.close(); }
});

test('DOM attributes and character data mutate the live document and emit notifications', async () => {
  const f = await fixture();
  try {
    const root = f.run('DOM.getDocument', { depth: -1 }).root;
    const item = f.run('DOM.querySelector', { nodeId: root.nodeId, selector: '.item' }).nodeId;
    f.run('DOM.setAttributeValue', { nodeId: item, name: 'data-updated', value: 'yes' });
    await settle();
    assert.equal(f.document.querySelector('.item').getAttribute('data-updated'), 'yes');
    assert.ok(f.session.events.some(event => event.method === 'DOM.attributeModified' && event.params.name === 'data-updated' && event.params.value === 'yes'));
    f.run('DOM.removeAttribute', { nodeId: item, name: 'data-updated' }); await settle();
    assert.ok(f.session.events.some(event => event.method === 'DOM.attributeRemoved' && event.params.name === 'data-updated'));
    assert.ok(f.run('DOM.getAttributes', { nodeId: item }).attributes.includes('data-note'));
    const text = f.document.querySelector('b').firstChild;
    f.run('DOM.setNodeValue', { nodeId: f.session.backendId(text), value: 'changed' }); await settle();
    assert.equal(f.document.querySelector('b').textContent, 'changed');
    assert.ok(f.session.events.some(event => event.method === 'DOM.characterDataModified' && event.params.characterData === 'changed'));
    assert.throws(() => f.run('DOM.setNodeValue', { nodeId: item, value: 'ignored' }), /does not have a text value/);
  } finally { f.close(); }
});

test('DOM child requests and replacements deliver node lists and live mutation events', async () => {
  const f = await fixture();
  try {
    const root = f.run('DOM.getDocument', { depth: 0 }).root;
    f.run('DOM.requestChildNodes', { nodeId: root.nodeId, depth: -1 });
    const pushed = f.session.events.find(event => event.method === 'DOM.setChildNodes');
    assert.equal(pushed.params.parentId, root.nodeId);
    assert.ok(pushed.params.nodes.some(node => node.localName === 'html'));
    const item = f.run('DOM.querySelector', { nodeId: root.nodeId, selector: '.item' }).nodeId;
    f.run('DOM.setOuterHTML', { nodeId: item, outerHTML: '<article id="replacement">Replacement</article>' }); await settle();
    assert.equal(f.document.querySelector('#replacement').textContent, 'Replacement');
    assert.ok(f.session.events.some(event => event.method === 'DOM.childNodeRemoved' && event.params.nodeId === item));
    assert.ok(f.session.events.some(event => event.method === 'DOM.childNodeInserted' && event.params.node.localName === 'article'));
    const replacement = f.run('DOM.querySelector', { nodeId: root.nodeId, selector: '#replacement' }).nodeId;
    assert.equal(f.run('DOM.getOuterHTML', { nodeId: replacement }).outerHTML, '<article id="replacement">Replacement</article>');
    f.run('DOM.removeNode', { nodeId: replacement });
    assert.equal(f.document.querySelector('#replacement'), null);
    assert.throws(() => f.run('DOM.requestChildNodes', { nodeId: root.nodeId, depth: 0 }), /Depth/);
  } finally { f.close(); }
});

test('DOM search supports CSS and XPath, bounded ranges, discarding and invalid-query empty results', async () => {
  const f = await fixture();
  try {
    f.run('DOM.getDocument');
    const css = f.run('DOM.performSearch', { query: '.item' });
    assert.equal(css.resultCount, 2);
    assert.equal(f.run('DOM.getSearchResults', { searchId: css.searchId, fromIndex: 0, toIndex: 1 }).nodeIds.length, 1);
    assert.throws(() => f.run('DOM.getSearchResults', { searchId: css.searchId, fromIndex: 0, toIndex: 3 }), /Invalid search result range/);
    const xpath = f.run('DOM.performSearch', { query: '//input[@id="edit"]' });
    assert.equal(xpath.resultCount, 1);
    assert.equal(f.run('DOM.performSearch', { query: 'needle' }).resultCount, 0);
    assert.equal(f.run('DOM.performSearch', { query: '[invalid' }).resultCount, 0);
    f.run('DOM.discardSearchResults', { searchId: css.searchId });
    assert.throws(() => f.run('DOM.getSearchResults', { searchId: css.searchId, fromIndex: 0, toIndex: 1 }), /Unknown search/);
  } finally { f.close(); }
});

test('DOM focus changes the active element and rejects nodes that cannot be focused', async () => {
  const f = await fixture();
  try {
    const input = f.session.backendId(f.document.querySelector('#edit'));
    f.run('DOM.focus', { backendNodeId: input });
    assert.equal(f.document.activeElement.id, 'edit');
    const main = f.session.backendId(f.document.querySelector('main'));
    assert.throws(() => f.run('DOM.focus', { nodeId: main }), /cannot be focused/);
    assert.equal(supportsDOM('DOM.setFileInputFiles'), false);
    assert.throws(() => f.run('DOM.setFileInputFiles', { nodeId: input, files: [] }), error => error.code === -32601);
  } finally { f.close(); }
});

test('DOM reset invalidates searches and observers and document changes produce a new tree', async () => {
  const f = await fixture();
  try {
    f.run('DOM.getDocument', { depth: -1 });
    const search = f.run('DOM.performSearch', { query: '.item' });
    f.run('DOM.disable');
    f.document.querySelector('.item').setAttribute('data-after-disable', 'unreported'); await settle();
    assert.equal(f.session.events.some(event => event.params.name === 'data-after-disable'), false);
    assert.throws(() => f.run('DOM.getSearchResults', { searchId: search.searchId, fromIndex: 0, toIndex: 1 }), /Unknown search/);
    resetDOM(f.session); f.session.nodes.clear();
    await f.page.navigate('data:text/html,<h1 id="new-document">New</h1>');
    const root = f.run('DOM.getDocument', { depth: -1 }).root;
    assert.ok(descendants(root).some(node => node.attributes?.includes('new-document')));
  } finally { f.close(); }
});

test('DOM piercing exposes available open shadow trees and template content', async () => {
  const f = await fixture();
  try {
    const host = f.document.querySelector('#shadow');
    host.attachShadow({ mode: 'open' }).innerHTML = '<strong>Shadow text</strong>';
    const tree = f.run('DOM.getDocument', { depth: -1, pierce: true }).root;
    const serializedHost = descendants(tree).find(node => node.attributes?.includes('shadow'));
    assert.equal(serializedHost.shadowRoots[0].shadowRootType, 'open');
    assert.equal(serializedHost.shadowRoots[0].children[0].localName, 'strong');
    const template = descendants(tree).find(node => node.localName === 'template');
    assert.equal(template.templateContent.children[0].localName, 'span');
  } finally { f.close(); }
});
