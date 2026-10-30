import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
import { Browser } from '../../src/browser.js';

const binary = '/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const expression = `(() => {
  const out = {}, form = document.createElement('form');
  form.innerHTML = '<input name="q" value="initial"><button name="go" value="yes">Go</button>';
  document.body.append(form);
  let event;
  const edit = value => { event = value; value.formData.set('q', 'changed'); value.formData.append('added', 'yes'); };
  form.addEventListener('formdata', edit);
  const data = new FormData(form, form.querySelector('button'));
  out.constructor = { entries: [...data], event: event ? {
    trusted: event.isTrusted, bubbles: event.bubbles, cancelable: event.cancelable,
    target: event.target === form, sameData: event.formData === data,
  } : null, brand: data instanceof FormData, constructor: data.constructor === FormData,
    tag: Object.prototype.toString.call(data) };
  form.removeEventListener('formdata', edit);
  const detached = document.createElement('form'); detached.innerHTML = '<input name="x" value="1">';
  let count = 0, caught = null;
  detached.addEventListener('formdata', () => {
    count++;
    if (count < 4) try { new FormData(detached); } catch (error) { caught = error.name; }
  });
  out.detached = { entries: [...new FormData(detached)], count, caught };
  const other = document.createElement('form'); other.innerHTML = '<input name="other" value="2">';
  let otherEvents = 0;
  other.addEventListener('formdata', () => otherEvents++);
  form.addEventListener('formdata', () => { out.otherEntries = [...new FormData(other)]; }, { once: true });
  new FormData(form); out.otherEvents = otherEvents;
  class Derived extends FormData {}
  const derived = new Derived(form);
  out.subclass = { base: derived instanceof FormData, derived: derived instanceof Derived,
    constructor: derived.constructor === Derived, entries: [...derived] };
  out.invalid = [];
  for (const args of [[{}], [form, form.querySelector('input')], [form, document.createElement('button')]]) {
    try { new FormData(...args); out.invalid.push('accepted'); } catch (error) { out.invalid.push(error.name); }
  }
  out.submitters = [];
  for (const submitter of [form.querySelector('button'), form.querySelector('input'), document.createElement('button'), null, undefined, {}, 1, 'go']) {
    try { out.submitters.push({ entries: [...new FormData(form, submitter)] }); }
    catch (error) { out.submitters.push({ error: error.name }); }
  }
  const order = new FormData(); order.append('a', '1'); order.append('b', '2'); order.append('a', '3');
  order.set('a', '4'); out.setOrder = [...order];
  let resets = 0;
  form.querySelector('input').value = 'dirty';
  const reset = value => {
    resets++;
    out.resetEvent = { trusted: value.isTrusted, bubbles: value.bubbles, cancelable: value.cancelable };
    if (resets < 4) form.reset();
  };
  form.addEventListener('reset', reset); form.reset(); form.removeEventListener('reset', reset);
  out.reset = { count: resets, value: form.querySelector('input').value };
  form.querySelector('input').value = 'cancelled';
  form.addEventListener('reset', value => value.preventDefault(), { once: true }); form.reset();
  out.cancelledReset = form.querySelector('input').value;
  return out;
})()`;

const reference = await startReference(binary);
let client, browser;
try {
  client = await connect(reference.endpoint);
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  await client.send('Page.navigate', { url: 'data:text/html,<body></body>' }, sessionId);
  const native = await client.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId);
  if (native.exceptionDetails) throw new Error(JSON.stringify(native.exceptionDetails));
  browser = new Browser();
  const page = browser.createPage();
  await page.navigate('data:text/html,<body></body>');
  const candidate = JSON.parse(JSON.stringify(page.evaluate(expression)));
  const result = { schemaVersion: 1, scope: 'Bounded public form constructor and reset observations; not complete form conformance.',
    binarySHA256: createHash('sha256').update(await readFile(binary)).digest('hex'),
    node: process.version, expression, native: native.result.value, candidate };
  const json = JSON.stringify(result, null, 2) + '\n';
  if (process.argv[2]) await writeFile(process.argv[2], json, { flag: 'wx' });
  console.log(json);
} finally { await client?.close(); await reference.close(); await browser?.close(); }
