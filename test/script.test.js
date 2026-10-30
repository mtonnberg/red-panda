import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { runScript, ScriptError } from '../src/script.js';

const html = `<title>Script fixture</title><h1>Example</h1><input id="name" value="old">
<button id="click" onclick="document.querySelector('h1').textContent='clicked'">Click</button>
<input id="check" type="checkbox"><select id="select"><option value="a">One</option><option value="b">Two</option></select>`;
const url = `data:text/html,${encodeURIComponent(html)}`;
const start = `const page = new Page(); await page.goto(${JSON.stringify(url)});`;

test('saved scripts use explicit return and native primitive/JSON formatting', async () => {
  const result = await runScript({ source: 'return await Promise.resolve({value:42});' });
  assert.deepEqual(result, { value: { value: 42 }, output: '{"value":42}\n' });
  assert.deepEqual(await runScript({ source: '1+2;' }), { value: undefined, output: '' });
  assert.equal((await runScript({ source: 'return "hello";' })).output, 'hello\n');
  assert.equal((await runScript({ source: 'return null;' })).output, 'null\n');
});

test('script console output is captured in order and host globals are absent', async () => {
  const result = await runScript({ source: `console.log('own log',42);return {Page:typeof Page,process:typeof process,fetch:typeof fetch,args:typeof args,setTimeout:typeof setTimeout};` });
  assert.deepEqual(result.value, { Page: 'function', process: 'undefined', fetch: 'undefined', args: 'undefined', setTimeout: 'undefined' });
  assert.ok(result.output.startsWith('own log 42\n'));
});

test('script Page goto, synchronous evaluation and extraction retain native value types', async () => {
  const result = await runScript({ source: `${start}const title=page.extract({title:'h1'});return {frame:page.__lpFrameId,read:title,object:page.evaluate('({x:1})'),number:page.evaluate('42'),returned:page.evaluate('return 3'),promise:page.evaluate('Promise.resolve(8)')};` });
  assert.deepEqual(result.value, { frame: 1, read: { title: 'Example' }, object: '{"x":1}', number: '42', returned: '3', promise: '8' });
});

test('script fill/click/check/select/press perform synchronous browser effects', async () => {
  const result = await runScript({ source: `${start}page.fill('#name','new');page.press('#name','!');page.click('#click');page.setChecked('#check',true);page.selectOption('#select','b');return {read:page.extract({heading:'h1'}),state:JSON.parse(page.evaluate('({name:document.querySelector("#name").value,checked:document.querySelector("#check").checked,selected:document.querySelector("#select").value})'))};` });
  assert.deepEqual(result.value, { read: { heading: 'clicked' }, state: { name: 'new!', checked: true, selected: 'b' } });
});

test('synchronous script waits allow async browser fetch and page timers to progress', async () => {
  const server = createServer((request, response) => {
    if (request.url === '/data') { setTimeout(() => response.end('Fetched value'), 80); return; }
    response.setHeader('content-type', 'text/html');
    response.end(`<h1>Waiting</h1><script>fetch('/data').then(r=>r.text()).then(text=>{const p=document.createElement('p');p.id='ready';p.textContent=text;document.body.append(p);setTimeout(()=>window.finished=true,30)});</script>`);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const result = await runScript({ source: `const p=new Page();await p.goto('http://127.0.0.1:${server.address().port}/');p.waitForSelector('#ready',{timeout:2000});p.waitForScript('window.finished === true',{timeout:2000});p.waitForState('load');return p.extract({result:'#ready'});` });
    assert.deepEqual(result.value, { result: 'Fetched value' });
  } finally { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
});

test('multiple script pages retain separate DOMs and outer script values survive navigation', async () => {
  const result = await runScript({ source: `${start}const first=page.extract({title:'h1'});const second=new Page();await second.goto('data:text/html,<h1>Second</h1>');return {first,current:page.extract({title:'h1'}),second:second.extract({title:'h1'})};` });
  assert.deepEqual(result.value, { first: { title: 'Example' }, current: { title: 'Example' }, second: { title: 'Second' } });
});

test('script selector waits return stable node identifiers usable in subsequent actions', async () => {
  const result = await runScript({ source: `${start}const first=page.waitForSelector('#name');const again=page.waitForSelector('#name');const id=Number(first.split(': ').at(-1));page.fill({backendNodeId:id,value:'by id'});return {first,again,value:page.evaluate('document.querySelector("#name").value')};` });
  assert.deepEqual(result.value, { first: 'Element found. backendNodeId: 1', again: 'Element found. backendNodeId: 1', value: 'by id' });
});

test('native object arguments and navigation after close work for script Pages', async () => {
  const result = await runScript({ source: `const p=new Page();await p.goto({url:${JSON.stringify(url)},timeout:2000});p.waitForSelector({selector:'h1',timeout:2000});p.fill({selector:'#name',value:'object args'});const before=p.evaluate({script:'document.querySelector("#name").value'});p.close();await p.goto('data:text/html,<h1>Reopened</h1>');return {before,after:p.extract({title:'h1'})};` });
  assert.deepEqual(result.value, { before: 'object args', after: { title: 'Reopened' } });
});

test('script Pages share session cookies, including after close and reopen', async () => {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html'); response.end('<h1>Own cookie fixture</h1>');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/`;
  try {
    const result = await runScript({ source: `const p=new Page();await p.goto(${JSON.stringify(base)});p.evaluate('document.cookie="own_fixture=value; path=/"');const q=new Page();await q.goto(${JSON.stringify(base)});const second=q.evaluate('document.cookie');p.close();await p.goto(${JSON.stringify(base)});return {second,reopened:p.evaluate('document.cookie')};` });
    assert.deepEqual(result.value, { second: 'own_fixture=value', reopened: 'own_fixture=value' });
  } finally { server.closeAllConnections(); await new Promise(accept => server.close(accept)); }
});

test('script source is loaded relative to cwd or from stdin without binding on import', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'red-panda-script-'));
  try {
    await writeFile(join(cwd, 'fixture.js'), 'return [1,2];');
    assert.equal((await runScript({ path: 'fixture.js', cwd })).output, '[1,2]\n');
    assert.equal((await runScript({ path: '-', input: Readable.from(['return ', '7;']) })).output, '7\n');
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('script errors distinguish load, syntax, execution and unsupported effects', async () => {
  await assert.rejects(runScript({ path: 'missing-own-script.js' }), error => error instanceof ScriptError && error.phase === 'load');
  await assert.rejects(runScript({ source: 'return (', }), error => error.phase === 'parse');
  await assert.rejects(runScript({ source: 'console.log("before");throw new Error("own failure");' }), error => error.phase === 'runtime' && error.message === 'own failure' && error.output === 'before\n');
  await assert.rejects(runScript({ source: `${start}page.screenshot('own.png');` }), /screenshot is not implemented/);
  await assert.rejects(runScript({ source: `${start}page.scroll(0,100);` }), /scroll is not implemented/);
  await assert.rejects(runScript({ source: `${start}page.waitForSelector('h1',100);` }), /options must be an object/);
  await assert.rejects(runScript({ source: `${start}await page.goto('data:text/html,hi',{madeUp:true});` }), /Unsupported script option/);
  await assert.rejects(runScript({ source: 'return 1;', args: ['unsupported'] }), /do not accept positional/);
});

test('script closure and browser failures raise errors instead of fabricated output', async () => {
  await assert.rejects(runScript({ source: `${start}page.close();return page.evaluate('1');` }), /page is not navigated or has been closed/);
  await assert.rejects(runScript({ source: 'const p=new Page();return p.evaluate("1");' }), /FrameNotLoaded/);
  await assert.rejects(runScript({ source: `${start}return page.click('#missing');` }), /NodeNotFound/);
  await assert.rejects(runScript({ source: `${start}return page.evaluate('throw new Error("page failure")');` }), /page failure/);
});

test('literal LP_ strings in saved scripts are not expanded from environment values', async () => {
  const result = await runScript({ source: `${start}page.fill('#name','$LP_SCRIPT_TEST');return page.evaluate('document.querySelector("#name").value');`, env: { LP_SCRIPT_TEST: 'injected-dummy-value' } });
  assert.equal(result.value, '$LP_SCRIPT_TEST');
});

test('script deadline terminates busy loops and unresolved promises', async () => {
  await assert.rejects(runScript({ source: 'while(true){}', timeout: 200 }), error => error.phase === 'timeout');
  await assert.rejects(runScript({ source: 'await new Promise(()=>{});', timeout: 200 }), error => error.phase === 'timeout');
});

test('saved script download writes actual local fixture bytes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'red-panda-script-download-'));
  const server = createServer((request, response) => response.end('own fixture bytes'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    await runScript({ cwd, source: `${start}page.download('http://127.0.0.1:${server.address().port}/file','file.txt');` });
    assert.equal(await readFile(join(cwd, 'file.txt'), 'utf8'), 'own fixture bytes');
  } finally { server.closeAllConnections(); await new Promise(accept => server.close(accept)); await rm(cwd, { recursive: true, force: true }); }
});
