// Independent observation of the synthetic layout; no paint or CSS renderer.
import { createInternalMutationObserver } from './mutations.js';
export function installIntersection(page, window, layout) {
  const observers = new Set();
  let queued = false, timer, stopped = false;
  const rect = value => window.DOMRectReadOnly.fromRect(value);
  function margins(input = '0px') {
    const parts = String(input).replace(/\/\*[\s\S]*?\*\//g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) parts.push('0px');
    if (parts.length > 4 || parts.some(value => !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?(?:px|%)$/i.test(value))) {
      throw new window.DOMException('Margins must use pixels or percentages', 'SyntaxError');
    }
    const values = parts.map(value => ({ value: Number.parseFloat(value), unit: value.endsWith('%') ? '%' : 'px' }));
    const [a, b = a, c = a, d = b] = values;
    return [a, b, c, d];
  }
  const marginText = values => values.map(part => `${part.value}${part.unit}`).join(' ');
  function measure(observer, target) {
    const bounds = layout.rect(target);
    let root = observer.root?.nodeType === 1 ? layout.rect(observer.root) : { x: 0, y: 0, ...layout.viewport };
    const offsets = observer._margin.map(part => part.unit === '%' ? part.value * root.width / 100 : part.value);
    root = { x: root.x - offsets[3], y: root.y - offsets[0], width: root.width + offsets[3] + offsets[1], height: root.height + offsets[0] + offsets[2] };
    const left = Math.max(bounds.left, root.x), top = Math.max(bounds.top, root.y);
    const right = Math.min(bounds.right, root.x + root.width), bottom = Math.min(bounds.bottom, root.y + root.height);
    const validRoot = !observer.root || observer.root === window.document || observer.root.contains(target);
    const isIntersecting = validRoot && layout.rects(target).length > 0 && right >= left && bottom >= top;
    const area = bounds.width * bounds.height;
    const intersection = { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    const intersectionRatio = isIntersecting ? (area ? intersection.width * intersection.height / area : 1) : 0;
    return new window.IntersectionObserverEntry({ time: window.performance.now(), target, rootBounds: rect(root),
      boundingClientRect: rect(bounds), intersectionRect: rect(isIntersecting ? intersection : { x: 0, y: 0, width: 0, height: 0 }),
      isIntersecting, intersectionRatio, isVisible: isIntersecting && window.getComputedStyle(target).visibility !== 'hidden' });
  }
  function deliver() {
    queued = false;
    if (stopped) return;
    for (const observer of [...observers]) {
      for (const [target, previous] of observer._targets) {
        if (!target.isConnected || target.ownerDocument !== window.document) continue;
        const entry = measure(observer, target);
        const index = observer.thresholds.filter(value => value <= entry.intersectionRatio).length;
        if (!previous || previous.index !== index || previous.intersecting !== entry.isIntersecting) {
          observer._records.push(entry);
          observer._targets.set(target, { index, intersecting: entry.isIntersecting });
        }
      }
    }
    for (const observer of [...observers]) {
      const records = observer.takeRecords();
      if (!records.length) continue;
      try { observer._callback.call(observer, records, observer); }
      catch (error) {
        const reported = new window.ErrorEvent('error', { error, message: String(error?.message ?? error), cancelable: true });
        if (window.dispatchEvent(reported)) page.emit('pageError', error);
      }
    }
    if (observers.size && !timer) timer = window.setTimeout(() => { timer = undefined; schedule(); }, 16);
  }
  function schedule() {
    if (!queued && !stopped) { queued = true; window.queueMicrotask(deliver); }
  }
  class IntersectionObserverEntry {
    constructor(init) { Object.assign(this, init); }
    get [Symbol.toStringTag]() { return 'IntersectionObserverEntry'; }
  }
  class IntersectionObserver {
    constructor(callback, options = {}) {
      if (typeof callback !== 'function') throw new window.TypeError('Observer callback must be a function');
      const root = options.root ?? null;
      if (root !== null && !(root instanceof window.Element) && !(root instanceof window.Document)) throw new window.TypeError('Invalid root');
      let thresholds = Array.isArray(options.threshold) ? options.threshold.map(Number) : [Number(options.threshold ?? 0)];
      if (thresholds.some(value => !Number.isFinite(value))) throw new window.TypeError('Threshold must be finite');
      const margin = margins(options.rootMargin), scrollMargin = margins(options.scrollMargin);
      if (thresholds.some(value => value < 0 || value > 1)) throw new window.RangeError('Threshold must be between zero and one');
      if (!thresholds.length) thresholds = [0];
      const trackVisibility = Boolean(options.trackVisibility);
      const delay = Math.max(trackVisibility ? 100 : 0, Math.trunc(Number(options.delay) || 0));
      for (const [key, value] of Object.entries({ root, rootMargin: marginText(margin), scrollMargin: marginText(scrollMargin),
        thresholds: Object.freeze(thresholds.sort((a, b) => a - b)), delay, trackVisibility })) Object.defineProperty(this, key, { value, enumerable: true });
      this._margin = margin; this._callback = callback; this._targets = new Map(); this._records = [];
    }
    observe(target) {
      if (!(target instanceof window.Element)) throw new window.TypeError('Target must be an Element');
      if (!this._targets.has(target)) this._targets.set(target, null);
      observers.add(this); schedule();
    }
    unobserve(target) {
      if (!(target instanceof window.Element)) throw new window.TypeError('Target must be an Element');
      this._targets.delete(target);
      if (!this._targets.size) observers.delete(this);
    }
    disconnect() { this._targets.clear(); this._records = []; observers.delete(this); }
    takeRecords() { return this._records.splice(0); }
    get [Symbol.toStringTag]() { return 'IntersectionObserver'; }
  }
  window.IntersectionObserver = IntersectionObserver;
  window.IntersectionObserverEntry = IntersectionObserverEntry;
  const mutations = createInternalMutationObserver(window, schedule);
  mutations.observe(window.document, { childList: true, subtree: true, attributes: true, characterData: true });
  window.addEventListener('scroll', schedule);
  page.documentAbort.signal.addEventListener('abort', () => {
    stopped = true; mutations.disconnect(); observers.clear(); window.clearTimeout(timer);
  }, { once: true });
}
