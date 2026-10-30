// Isolated design prototype: the caller supplies a real parse5 parser using the
// existing Document tree adapter. This file is not installed by production.
export function createWriteParser(parser, {
  active = () => true, signal, onComplete = () => {}, onError = () => {},
} = {}) {
  if (typeof parser?.tokenizer?.write !== 'function' || typeof parser.tokenizer.insertHtmlAtCurrentPos !== 'function') throw new TypeError('A parse5 parser is required');
  let status = 'open', feeding = 0, scripts = 0, pending = '', closeRequested = false, eofFed = false;
  let charsWritten = 0, writes = 0, resolve;
  const completion = new Promise(done => { resolve = done; });
  const terminal = () => ['complete', 'aborted', 'error'].includes(status);
  function settle(result) { signal?.removeEventListener('abort', aborted); resolve(result); }
  function abort(reason = signal?.reason) {
    if (terminal()) return false;
    status = 'aborted'; pending = ''; parser.tokenizer.pause(); settle({ status, reason }); return true;
  }
  function aborted() { abort(signal.reason); }
  function check() {
    if (terminal()) return false;
    if (signal?.aborted || !active()) { abort(); return false; }
    return true;
  }
  function failed(error) {
    if (terminal()) return;
    status = 'error'; pending = ''; parser.tokenizer.pause(); settle({ status, error }); onError(error);
  }
  function run(operation) {
    feeding++;
    try { operation(); }
    catch (error) { failed(error); throw error; }
    finally { feeding--; }
    drained();
  }
  function flushScriptWrites() {
    if (!check() || scripts || !pending) return;
    const input = pending; pending = '';
    // During a parser callback parse5's real inLoop guard queues these bytes
    // without reentering its tree builder. Concatenation preserves call order.
    run(() => parser.tokenizer.insertHtmlAtCurrentPos(input));
  }
  function drained() {
    if (!check() || feeding || scripts || parser.tokenizer.inLoop || parser.tokenizer.paused) return;
    if (pending) { flushScriptWrites(); return; }
    if (closeRequested && !eofFed) {
      eofFed = true; run(() => parser.tokenizer.write('', true)); return;
    }
    if (eofFed && parser.stopped) {
      status = 'complete'; settle({ status, charsWritten, writes }); onComplete();
    }
  }
  function write(text) {
    if (typeof text !== 'string') throw new TypeError('Written parser input must be a string');
    if (!check() || eofFed) return false;
    charsWritten += text.length; writes++;
    if (scripts || parser.tokenizer.inLoop) pending += text;
    else run(() => parser.tokenizer.write(text, false));
    return true;
  }
  function close() {
    if (!check()) return false;
    closeRequested = true; drained(); return true;
  }
  function resume() {
    if (!check() || feeding || parser.tokenizer.inLoop) return false;
    if (parser.tokenizer.paused) run(() => parser.tokenizer.resume());
    else drained();
    return true;
  }
  function enterScript() { if (!check()) return false; scripts++; return true; }
  function leaveScript() {
    if (!scripts) return false;
    scripts--;
    if (check()) { flushScriptWrites(); drained(); }
    return true;
  }
  signal?.addEventListener('abort', aborted, { once: true });
  if (signal?.aborted) aborted();
  return { kind: 'write', write, close, resume, abort, enterScript, leaveScript, completion,
    get state() { return { status, feeding, scripts, pendingChars: pending.length, closeRequested, eofFed, charsWritten, writes, paused: parser.tokenizer.paused }; } };
}
