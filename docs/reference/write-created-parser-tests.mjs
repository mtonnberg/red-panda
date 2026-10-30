// Prepared isolated controller tests; not part of the production default glob.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Parser, parse, serialize } from 'parse5';
import { createWriteParser } from './write-created-parser.mjs';

test('one actual parser preserves its open-element stack across separate writes', async () => {
  const parser = new Parser(), controller = createWriteParser(parser);
  const pieces = ['<html><body><section id="new">', '<b id="first">first</b>', '<b id="second">second</b>', '</section></body></html>'];
  for (const piece of pieces) assert.equal(controller.write(piece), true);
  assert.equal(parser.stopped, false); assert.equal(controller.state.eofFed, false);
  controller.close(); assert.equal((await controller.completion).status, 'complete');
  assert.equal(serialize(parser.document), serialize(parse(pieces.join(''))));
});

test('split tags, entities and Unicode are consumed by the same real tokenizer', async () => {
  const parser = new Parser(), controller = createWriteParser(parser);
  const pieces = ['<p id="spl', 'it">&#x1', 'F600; &am', 'p; 🦊</p>'];
  for (const piece of pieces) controller.write(piece);
  controller.close(); await controller.completion;
  assert.equal(serialize(parser.document), serialize(parse(pieces.join(''))));
});

test('reentrant script writes queue real bytes in call order without reentering the tree builder', async () => {
  let controller, calls = 0;
  const parser = new Parser({}, undefined, null, () => {
    if (++calls !== 1) return;
    assert.equal(parser.tokenizer.inLoop, true); controller.enterScript();
    controller.write('<b id="first">first</b>'); controller.write('<b id="second">second</b>');
    assert.equal(serialize(parser.document).includes('id="first"'), false);
    controller.leaveScript();
  });
  controller = createWriteParser(parser);
  controller.write('<script></script><p id="tail">tail</p>'); controller.close(); await controller.completion;
  assert.equal(serialize(parser.document), serialize(parse('<script></script><b id="first">first</b><b id="second">second</b><p id="tail">tail</p>')));
});

test('reentrant close waits until script writes and the real parser loop have drained', async () => {
  let controller, completions = 0;
  const parser = new Parser({}, undefined, null, () => {
    controller.enterScript(); controller.write('<p id="nested">nested</p>'); controller.close();
    assert.equal(controller.state.eofFed, false); assert.equal(parser.stopped, false);
    controller.leaveScript();
  });
  controller = createWriteParser(parser, { onComplete: () => completions++ });
  controller.write('<script></script>');
  assert.equal((await controller.completion).status, 'complete'); assert.equal(completions, 1);
  assert.equal(serialize(parser.document), serialize(parse('<script></script><p id="nested">nested</p>')));
  controller.close(); assert.equal(completions, 1);
});

test('an actual tokenizer blocker holds requested EOF until resume', async () => {
  let paused = false;
  const parser = new Parser({}, undefined, null, () => { if (!paused) { paused = true; parser.tokenizer.pause(); } });
  const controller = createWriteParser(parser);
  controller.write('<script></script><p>buffered</p>'); controller.write('<b>later write</b>'); controller.close();
  assert.equal(controller.state.eofFed, false); assert.equal(parser.stopped, false);
  controller.resume(); assert.equal((await controller.completion).status, 'complete');
  assert.equal(serialize(parser.document), serialize(parse('<script></script><p>buffered</p><b>later write</b>')));
});

test('superseding a parse cycle aborts its controller without inventing EOF', async () => {
  let current = true, completed = false;
  const parser = new Parser(), controller = createWriteParser(parser, { active: () => current, onComplete: () => { completed = true; } });
  controller.write('<p>first'); current = false; assert.equal(controller.write('stale'), false);
  assert.equal((await controller.completion).status, 'aborted'); assert.equal(completed, false);
  assert.equal(parser.stopped, false); assert.equal(controller.state.eofFed, false);
});
