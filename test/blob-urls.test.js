import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { Browser } from '../src/browser.js';
import { installBlobURLs, resolveBlobURL, BlobURLFetchError } from '../src/blob-urls.js';
const { implForWrapper } = createRequire(import.meta.url)('jsdom/lib/jsdom/living/generated/utils.js');

let server, otherServer, origin, otherOrigin;
before(async () => {
  const listener = (request, response) => {
    response.setHeader('content-type', 'text/html');
    if (request.url === '/redirect-frame') { response.writeHead(302, { location: `${otherOrigin}/redirected-frame` }); response.end(); }
    else if (request.url === '/redirected-frame') response.end('<h1>Redirect committed</h1><script>window.afterRedirectURL=URL.createObjectURL(new Blob(["after redirect"]));</script>');
    else if (request.url === '/frames') response.end(`<h1>Frames</h1><iframe id=blank></iframe><iframe id=srcdoc srcdoc="<h1>Srcdoc</h1>"></iframe><iframe id=cross src="${otherOrigin}/peer"></iframe><iframe id=sandbox sandbox srcdoc="<h1>Sandbox</h1>"></iframe>`);
    else response.end('<h1>Own blob fixture</h1>');
  };
  otherServer = createServer(listener); otherServer.listen(0, '127.0.0.1'); await once(otherServer, 'listening'); otherOrigin = `http://127.0.0.1:${otherServer.address().port}`;
  server = createServer(listener); server.listen(0, '127.0.0.1'); await once(server, 'listening'); origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { for (const service of [server, otherServer]) { service.closeAllConnections(); await new Promise(accept => service.close(accept)); } });

async function create(browser, url = origin, context) {
  const page = browser.createPage(context); await page.navigate(url);
  return { page, window: page.dom.window, controller: installBlobURLs(page, page.dom.window) };
}
const denied = action => assert.throws(action, error => error instanceof BlobURLFetchError && error.name === 'TypeError' && error.code === 'ERR_BLOB_URL_UNAVAILABLE');
const decoded = snapshot => new TextDecoder().decode(snapshot.bytes);

test('object URLs expose actual branded DOM Blob/File bytes, normalized MIME and creator origin', async () => {
  const browser = new Browser();
  try {
    const { page, window, controller } = await create(browser);
    const input = new window.Uint8Array([65, 0, 255]), blob = new window.Blob([input], { type: 'TEXT/PLAIN' }); input[0] = 90;
    const url = window.URL.createObjectURL(blob), snapshot = resolveBlobURL(page, url);
    assert.ok(url.startsWith(`blob:${origin}/`)); assert.equal(new URL(url).origin, origin);
    assert.deepEqual([...snapshot.bytes], [65, 0, 255]); assert.equal(snapshot.mimeType, 'text/plain'); assert.equal(snapshot.url, url);
    const file = new window.File(['own file'], 'own.txt', { type: 'text/markdown' });
    const fileSnapshot = resolveBlobURL(page, window.URL.createObjectURL(file));
    assert.equal(decoded(fileSnapshot), 'own file'); assert.equal(fileSnapshot.mimeType, 'text/markdown');
    assert.equal(controller.size, 2);
    const slice = window.URL.createObjectURL(blob.slice(1, 3, 'application/octet-stream'));
    assert.deepEqual([...resolveBlobURL(page, slice).bytes], [0, 255]);
  } finally { browser.close(); }
});

test('revocation rejects future lookups but retained snapshots and independent reads remain valid', async () => {
  const browser = new Browser();
  try {
    const { page, window, controller } = await create(browser);
    const url = window.URL.createObjectURL(new window.Blob(['actual bytes']));
    const first = resolveBlobURL(page, url), second = resolveBlobURL(page, url); first.bytes[0] = 0;
    assert.equal(decoded(second), 'actual bytes'); assert.equal(decoded(resolveBlobURL(page, url)), 'actual bytes');
    assert.equal(window.URL.revokeObjectURL(url), undefined); assert.equal(controller.size, 0); denied(() => resolveBlobURL(page, url));
    assert.equal(decoded(second), 'actual bytes'); assert.equal(window.URL.revokeObjectURL(url), undefined);
    assert.equal(window.URL.revokeObjectURL('not a URL'), undefined);
  } finally { browser.close(); }
});

test('native fragment lookup works, fragment revocation is a no-op, and queries/forged URLs fail', async () => {
  const browser = new Browser();
  try {
    const { page, window } = await create(browser), url = window.URL.createObjectURL(new window.Blob(['own']));
    const fragment = resolveBlobURL(page, `${url}#fragment`);
    assert.equal(decoded(fragment), 'own'); assert.equal(fragment.url, `${url}#fragment`);
    window.URL.revokeObjectURL(`${url}#fragment`); assert.equal(decoded(resolveBlobURL(page, url)), 'own');
    denied(() => resolveBlobURL(page, `${url}?query`)); denied(() => resolveBlobURL(page, `blob:${otherOrigin}/${url.split('/').at(-1)}`));
    denied(() => resolveBlobURL(page, 'file:///etc/passwd')); denied(() => resolveBlobURL(page, 'blob:nodedata:unknown'));
    window.URL.revokeObjectURL(url); denied(() => resolveBlobURL(page, `${url}#fragment`));
  } finally { browser.close(); }
});

test('same-context/origin pages share access and revocation; other origins and contexts cannot resolve or revoke', async () => {
  const browser = new Browser();
  try {
    const creator = await create(browser, `${origin}/creator`), peer = await create(browser, `${origin}/peer`);
    const cross = await create(browser, otherOrigin), context = browser.createContext(), isolated = await create(browser, origin, context);
    const url = creator.window.URL.createObjectURL(new creator.window.Blob(['shared same origin']));
    assert.equal(decoded(resolveBlobURL(peer.page, url)), 'shared same origin');
    denied(() => resolveBlobURL(cross.page, url)); denied(() => resolveBlobURL(isolated.page, url));
    cross.window.URL.revokeObjectURL(url); isolated.window.URL.revokeObjectURL(url);
    assert.equal(decoded(resolveBlobURL(creator.page, url)), 'shared same origin');
    peer.window.URL.revokeObjectURL(url); denied(() => resolveBlobURL(creator.page, url));
  } finally { browser.close(); }
});

test('opaque documents use null serialization but distinct unforgeable origin identities', async () => {
  const browser = new Browser();
  try {
    const creator = await create(browser, 'data:text/html,<h1>Opaque A</h1>'), other = await create(browser, 'data:text/html,<h1>Opaque B</h1>');
    const url = creator.window.URL.createObjectURL(new creator.window.Blob(['opaque own bytes']));
    assert.match(url, /^blob:null\//); assert.equal(decoded(resolveBlobURL(creator.page, url)), 'opaque own bytes');
    denied(() => resolveBlobURL(other.page, url)); other.window.URL.revokeObjectURL(url);
    assert.equal(decoded(resolveBlobURL(creator.page, url)), 'opaque own bytes');
  } finally { browser.close(); }
});

test('inherited blank/srcdoc frames share tuple origins; cross-origin and sandbox frames are denied', async () => {
  const browser = new Browser({ loadResources: ['iframe'] });
  try {
    const root = await create(browser, `${origin}/frames`);
    const frame = id => {
      const window = root.window.document.getElementById(id).contentWindow;
      const page = [...root.page.frames.frames.values()].find(candidate => candidate.dom.window === window);
      assert.ok(page, `registered frame ${id}`); installBlobURLs(page, window); return { page, window };
    };
    const blank = frame('blank'), srcdoc = frame('srcdoc'), cross = frame('cross'), sandbox = frame('sandbox');
    const url = root.window.URL.createObjectURL(new root.window.Blob(['frame-shared']));
    assert.equal(decoded(resolveBlobURL(blank.page, url)), 'frame-shared'); assert.equal(decoded(resolveBlobURL(srcdoc.page, url)), 'frame-shared');
    denied(() => resolveBlobURL(cross.page, url)); denied(() => resolveBlobURL(sandbox.page, url));
    const childURL = srcdoc.window.URL.createObjectURL(new srcdoc.window.Blob(['child-owned']));
    assert.equal(decoded(resolveBlobURL(root.page, childURL)), 'child-owned');
    const retained = resolveBlobURL(root.page, childURL); root.window.document.getElementById('srcdoc').remove();
    denied(() => resolveBlobURL(root.page, childURL)); assert.equal(decoded(retained), 'child-owned');
  } finally { browser.close(); }
});

test('blank child frames inherit opaque identity while independent opaque pages remain separate', async () => {
  const browser = new Browser({ loadResources: ['iframe'] });
  try {
    const root = await create(browser, 'data:text/html,<h1>Opaque parent</h1><iframe></iframe>');
    const window = root.window.document.querySelector('iframe').contentWindow;
    const page = [...root.page.frames.frames.values()].find(candidate => candidate.dom.window === window);
    installBlobURLs(page, window);
    const url = root.window.URL.createObjectURL(new root.window.Blob(['opaque inherited']));
    assert.equal(decoded(resolveBlobURL(page, url)), 'opaque inherited');
    const peer = await create(browser, 'data:text/html,<h1>Independent</h1>'); denied(() => resolveBlobURL(peer.page, url));
  } finally { browser.close(); }
});

test('a redirected frame refreshes its actual origin before inline blob creation and revokes pre-commit entries', async () => {
  const browser = new Browser({ loadResources: ['iframe'] });
  try {
    const root = await create(browser), peer = await create(browser, otherOrigin);
    let child, controller, beforeCommitURL, retained;
    root.page.frames.on('frameNavigationStarted', ({ frameId }) => {
      child = root.page.frames.frames.get(frameId);
      const window = child.dom.window; controller = installBlobURLs(child, window);
      beforeCommitURL = window.URL.createObjectURL(new window.Blob(['before redirect']));
      retained = resolveBlobURL(child, beforeCommitURL);
      assert.ok(beforeCommitURL.startsWith(`blob:${origin}/`));
    });
    const iframe = root.window.document.createElement('iframe'), loaded = once(iframe, 'load');
    iframe.src = `${origin}/redirect-frame`; root.window.document.body.append(iframe); await loaded;
    assert.equal(child.dom.window.document.querySelector('h1').textContent, 'Redirect committed');
    const finalURL = child.dom.window.afterRedirectURL;
    assert.ok(finalURL.startsWith(`blob:${otherOrigin}/`));
    assert.equal(decoded(resolveBlobURL(child, finalURL)), 'after redirect');
    assert.equal(decoded(resolveBlobURL(peer.page, finalURL)), 'after redirect');
    denied(() => resolveBlobURL(root.page, finalURL)); denied(() => resolveBlobURL(root.page, beforeCommitURL));
    assert.equal(controller.size, 1); assert.equal(decoded(retained), 'before redirect');
  } finally { browser.close(); }
});

test('origin refresh uses actual document origin, invalidates obsolete entries without a creator call and ignores forged window.origin', async () => {
  const browser = new Browser();
  try {
    const creator = await create(browser), oldPeer = await create(browser), newPeer = await create(browser, otherOrigin);
    const url = creator.window.URL.createObjectURL(new creator.window.Blob(['obsolete origin']));
    Object.defineProperty(creator.window, 'origin', { value: origin, configurable: true });
    implForWrapper(creator.window.document)._origin = otherOrigin;
    denied(() => resolveBlobURL(oldPeer.page, url)); assert.equal(creator.controller.size, 0);
    const refreshed = creator.window.URL.createObjectURL(new creator.window.Blob(['actual new origin']));
    assert.ok(refreshed.startsWith(`blob:${otherOrigin}/`));
    assert.equal(decoded(resolveBlobURL(newPeer.page, refreshed)), 'actual new origin');
    denied(() => resolveBlobURL(oldPeer.page, refreshed));
    const opaque = await create(browser, 'data:text/html,<h1>Stable opaque</h1>');
    const opaqueURL = opaque.window.URL.createObjectURL(new opaque.window.Blob(['stable']));
    Object.defineProperty(opaque.window, 'origin', { value: otherOrigin, configurable: true });
    assert.equal(decoded(resolveBlobURL(opaque.page, opaqueURL)), 'stable');
    assert.match(opaque.window.URL.createObjectURL(new opaque.window.Blob(['still opaque'])), /^blob:null\//);
    denied(() => resolveBlobURL(newPeer.page, opaqueURL));
  } finally { browser.close(); }
});

test('sandbox origin identity remains fixed for the document after iframe attribute and private origin updates', async () => {
  const browser = new Browser({ loadResources: ['iframe'] });
  try {
    const root = await create(browser, `${origin}/frames`), iframe = root.window.document.getElementById('sandbox');
    const window = iframe.contentWindow, page = [...root.page.frames.frames.values()].find(candidate => candidate.dom.window === window);
    installBlobURLs(page, window);
    const url = window.URL.createObjectURL(new window.Blob(['sandbox stable']));
    iframe.removeAttribute('sandbox'); implForWrapper(window.document)._origin = otherOrigin;
    assert.equal(decoded(resolveBlobURL(page, url)), 'sandbox stable');
    assert.match(window.URL.createObjectURL(new window.Blob(['still sandboxed'])), /^blob:null\//);
    denied(() => resolveBlobURL(root.page, url));
  } finally { browser.close(); }
});

test('navigation, page close and context disposal revoke document-owned URLs without changing retained bytes', async () => {
  const browser = new Browser();
  try {
    const context = browser.createContext(), creator = await create(browser, origin, context), peer = await create(browser, `${origin}/peer`, context);
    const url = creator.window.URL.createObjectURL(new creator.window.Blob(['before navigation'])), retained = resolveBlobURL(peer.page, url);
    await creator.page.navigate(`${origin}/next`); installBlobURLs(creator.page, creator.page.dom.window);
    assert.equal(creator.controller.disposed, true); denied(() => resolveBlobURL(peer.page, url));
    assert.throws(() => creator.window.URL.createObjectURL(new creator.window.Blob(['stale'])), error => error.name === 'InvalidStateError');
    assert.equal(decoded(retained), 'before navigation');
    const current = creator.page.dom.window, newURL = current.URL.createObjectURL(new current.Blob(['before close']));
    creator.page.close(); denied(() => resolveBlobURL(peer.page, newURL));
    const peerURL = peer.window.URL.createObjectURL(new peer.window.Blob(['before disposal'])), peerSnapshot = resolveBlobURL(peer.page, peerURL);
    browser.disposeContext(context); denied(() => resolveBlobURL(peer.page, peerURL)); assert.equal(decoded(peerSnapshot), 'before disposal');
  } finally { browser.close(); }
});

test('controller disposal and raw DOM window close revoke all and only creator-owned entries', async () => {
  const browser = new Browser();
  try {
    const a = await create(browser), b = await create(browser), first = a.window.URL.createObjectURL(new a.window.Blob(['a']));
    const second = b.window.URL.createObjectURL(new b.window.Blob(['b']));
    assert.equal(installBlobURLs(a.page, a.window), a.controller); a.controller.dispose(); a.controller.dispose();
    denied(() => resolveBlobURL(b.page, first)); assert.equal(decoded(resolveBlobURL(b.page, second)), 'b');
    b.window.close(); denied(() => resolveBlobURL(b.page, second)); assert.equal(b.controller.size, 0);
  } finally { browser.close(); }
});

test('blob APIs enforce DOM brands and required arguments instead of trusting caller-shaped buffers', async () => {
  const browser = new Browser();
  try {
    const { window } = await create(browser);
    for (const value of [undefined, null, {}, 'text', { _buffer: Buffer.from('forged') }, new Blob(['host blob'])]) assert.throws(() => window.URL.createObjectURL(value), error => error.name === 'TypeError');
    assert.throws(() => window.URL.createObjectURL(), error => error.name === 'TypeError');
    assert.throws(() => window.URL.revokeObjectURL(), error => error.name === 'TypeError');
    assert.throws(() => window.URL.revokeObjectURL(Symbol('own')), error => error.name === 'TypeError');
    assert.equal(window.URL.revokeObjectURL(undefined), undefined);
  } finally { browser.close(); }
});
