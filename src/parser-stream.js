// Feed actual parse5 input incrementally. This controller never constructs DOM
// nodes or MutationRecords; parser work and observer checkpoints remain real.
export function createParserStream(parser, markup, {
  chunkSize = 4096, threshold = 16384, active = () => true, signal,
  onComplete = () => {}, onError = () => {},
  schedule = callback => setImmediate(callback), cancel = handle => clearImmediate(handle),
} = {}) {
  if (typeof parser?.tokenizer?.write !== 'function' || typeof parser.tokenizer.resume !== 'function') throw new TypeError('A parse5 parser is required');
  if (typeof markup !== 'string') throw new TypeError('Parser input must be a string');
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new TypeError('Parser chunk size must be a positive safe integer');
  if (!Number.isSafeInteger(threshold) || threshold < 0) throw new TypeError('Parser streaming threshold must be a nonnegative safe integer');
  for (const callback of [active, onComplete, onError, schedule, cancel]) if (typeof callback !== 'function') throw new TypeError('Parser callbacks must be functions');
  const incremental = markup.length > threshold;
  let status = 'idle', offset = 0, chunks = 0, eofFed = false, pending = false, handle, writing = false;
  let resolve;
  const completion = new Promise(done => { resolve = done; });

  function cancelPending() {
    if (pending) { pending = false; cancel(handle); handle = undefined; }
  }
  function settle(value) { signal?.removeEventListener('abort', aborted); resolve(value); }
  function abort(reason = signal?.reason) {
    if (['complete', 'aborted', 'error'].includes(status)) return false;
    status = 'aborted'; cancelPending(); parser.tokenizer.pause();
    settle({ status, reason }); return true;
  }
  function aborted() { abort(signal.reason); }
  function fail(error) {
    if (['complete', 'aborted', 'error'].includes(status)) return;
    status = 'error'; cancelPending(); parser.tokenizer.pause();
    settle({ status, error }); onError(error);
  }
  function isActive() {
    if (status !== 'running') return false;
    try {
      if (signal?.aborted || !active()) { abort(); return false; }
      return true;
    } catch (error) { fail(error); return false; }
  }
  function finish() {
    if (!isActive() || parser.tokenizer.paused || !parser.stopped || !eofFed) return;
    status = 'complete'; cancelPending(); settle({ status, chunks, charsFed: offset }); onComplete();
  }
  function queueNext() {
    if (pending || !isActive() || parser.tokenizer.paused) return;
    pending = true;
    handle = schedule(() => {
      if (!pending) return;
      pending = false; handle = undefined;
      // Asynchronous failures are observable through onError/completion. They
      // must not escape a host task after navigation has returned to its caller.
      try { feed(); } catch { /* fail() already recorded and reported it. */ }
    });
  }
  function drained() {
    if (!isActive() || parser.tokenizer.paused) return;
    if (parser.stopped) {
      if (eofFed) finish(); else abort('Parser stopped before end of input');
      return;
    }
    if (offset < markup.length || !eofFed) queueNext();
  }
  function feed() {
    if (!isActive() || parser.tokenizer.paused || writing) return;
    const end = incremental ? Math.min(markup.length, offset + chunkSize) : markup.length;
    const input = markup.slice(offset, end);
    offset = end; eofFed = end === markup.length; chunks++;
    writing = true;
    try { parser.tokenizer.write(input, eofFed); }
    catch (error) { fail(error); throw error; }
    finally { writing = false; }
    drained();
  }
  function start() {
    if (status !== 'idle') return controller;
    status = 'running';
    signal?.addEventListener('abort', aborted, { once: true });
    feed(); return controller;
  }
  function resume() {
    if (!isActive()) return false;
    if (writing || parser.tokenizer.inLoop) return false;
    if (parser.tokenizer.paused) {
      writing = true;
      try { parser.tokenizer.resume(); }
      catch (error) { fail(error); throw error; }
      finally { writing = false; }
    }
    drained(); return true;
  }
  const controller = {
    start, resume, abort, completion,
    get state() { return { status, charsFed: offset, chunks, eofFed, pending, paused: parser.tokenizer.paused, incremental }; },
  };
  return controller;
}
