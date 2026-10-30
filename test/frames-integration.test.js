import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Browser, until } from '../src/browser.js';

async function fixture(t) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, referrer: req.headers.referer });
    const routes = {
      '/parent': '<!doctype html><title>Parent</title><iframe id="child" src="/child"></iframe><iframe id="inline" srcdoc="<p>Inline</p><script>globalThis.inlineReady=true</script>"></iframe>',
      '/child': '<!doctype html><title>Child</title><button>Child button</button><script>globalThis.childOnly=42;fetch("./data").then(r=>r.json()).then(d=>globalThis.fetched=d.value)</script><script type="module">import {answer} from "./dep.js";globalThis.moduleAnswer=answer;</script>',
      '/next': '<!doctype html><title>Next frame</title><h1>Next frame</h1>',
      '/data': '{"value":"frame data"}', '/dep.js': 'export const answer=73;',
    };
    res.writeHead(routes[req.url] ? 200 : 404, { 'content-type': req.url.endsWith('.js') ? 'text/javascript' : req.url === '/data' ? 'application/json' : 'text/html' });
    res.end(routes[req.url] ?? 'Missing');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = new Browser({ loadResources: ['iframe'] }), page = browser.createPage();
  t.after(async () => { browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { page, requests, base: `http://127.0.0.1:${server.address().port}` };
}

test('Browser frames use their real realms, relative network transport and module readiness', async t => {
  const { page, base, requests } = await fixture(t);
  const network = []; page.on('request', request => network.push(request));
  await page.navigate(`${base}/parent`);
  const element = page.dom.window.document.getElementById('child'), child = page.frames.findElement(element);
  assert.ok(child); assert.equal(child.dom.window, element.contentWindow);
  assert.equal(child.evaluate('childOnly'), 42); assert.equal(page.evaluate('typeof childOnly'), 'undefined');
  await child.moduleReady;
  assert.equal(child.evaluate('moduleAnswer'), 73);
  await until(() => child.evaluate('globalThis.fetched') === 'frame data');
  assert.equal(requests.find(request => request.url === '/data').referrer, `${base}/child`);
  const document = network.find(request => request.url === `${base}/child`);
  assert.equal(document.type, 'Document'); assert.equal(document.frameId, child.frameId);
  assert.equal(document.loaderId, child.loaderId); assert.notEqual(document.id, page.loaderId);
  const inline = page.frames.findElement(page.dom.window.document.getElementById('inline'));
  assert.equal(inline.evaluate('inlineReady'), true); assert.equal(inline.dom.window.document.body.textContent.includes('Inline'), true);
  assert.equal(page.frames.getTree().childFrames.length, 2);
});

test('actual child-frame invocation ignores authored apply and exposes no temporary Window frame',async t=>{
 const {page,base}=await fixture(t);await page.navigate(`${base}/parent`);
 const child=page.frames.findElement(page.dom.window.document.getElementById('child'));
 child.evaluate('Function.prototype.apply=function(){throw Error("authored apply")};Reflect.apply=function(){throw Error("authored Reflect")}');
 const body=child.dom.window.document.body,keys=Reflect.ownKeys(child.dom.window);
 const declaration='Object.defineProperty(function(value){this.dataset.invoked=value;return this},"apply",{get(){throw Error("own apply")}})';
 assert.equal(child.callFunction(declaration,body,['actual']),body);assert.equal(body.dataset.invoked,'actual');
 assert.deepEqual(Reflect.ownKeys(child.dom.window),keys);
 page.timeout=50;assert.throws(()=>child.callFunction('function(){try{for(;;){}}finally{globalThis.finished=true}}',null,[]),{code:'ERR_SCRIPT_EXECUTION_TIMEOUT'});
 assert.equal(child.evaluate('globalThis.finished'),undefined);assert.equal(child.callFunction('function(){return 42}',null,[]),42);
});

test('child navigation changes its real iframe document and invalidates old realms without replacing the parent', async t => {
  const { page, base } = await fixture(t);
  await page.navigate(`${base}/parent`);
  const element = page.dom.window.document.getElementById('child'), previous = page.frames.findElement(element);
  const contextId = previous.executionContextId, parentGeneration = page.documentGeneration;
  await previous.navigate(`${base}/next`);
  const next = page.frames.findElement(element);
  assert.equal(next.frameId, previous.frameId); assert.notEqual(next.executionContextId, contextId);
  assert.equal(page.frames.findContext(contextId), undefined);
  assert.throws(() => previous.evaluate('1'), /detached|current/);
  assert.equal(next.evaluate('document.title'), 'Next frame'); assert.equal(element.contentDocument, next.dom.window.document);
  assert.equal(page.documentGeneration, parentGeneration); assert.equal(page.evaluate('document.title'), 'Parent');
  await assert.rejects(next.navigate(`${base}/next`, { method: 'POST', body: 'unsupported' }), /not implemented/);
  element.remove(); assert.equal(page.frames.findFrame(next.frameId), undefined);
});
