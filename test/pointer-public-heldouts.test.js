import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Browser} from '../src/browser.js';
for (const kind of ['pointer-heldout-values', 'pointer-heldout-realms']) {
  test('PointerEvent additional Native control ' + kind, async t => {
    const directory = new URL('./fixtures/pointer-public-native/', import.meta.url);
    const source = await readFile(new URL(kind + '-expression.js', directory), 'utf8');
    const native = JSON.parse(await readFile(new URL(kind + '-native.json', directory), 'utf8'));
    assert.equal(createHash('sha256').update(source).digest('hex'), native.sourceSHA256);
    assert.equal(native.binarySHA256, '9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f');
    assert.equal(native.response.exceptionDetails, undefined);
    const browser = new Browser();
    t.after(() => browser.close());
    const page = browser.createPage();
    page.dom.window.document.body.innerHTML = '<button id="hit">Pointer</button>';
    assert.deepEqual(JSON.parse(JSON.stringify(await page.evaluate(source))), native.response.result.value);
  });
}
