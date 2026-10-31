import {installOptionAlias} from './option-alias.js';
// Independent input state adaptation over pinned jsdom DOM/IDL primitives.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const InputImpl = require('jsdom/lib/jsdom/living/nodes/HTMLInputElement-impl.js').implementation;
const LabelImpl = require('jsdom/lib/jsdom/living/nodes/HTMLLabelElement-impl.js').implementation;
const { domSymbolTree } = require('jsdom/lib/jsdom/living/helpers/internal-constants.js');
const { isLabelable } = require('jsdom/lib/jsdom/living/helpers/form-controls.js');
const { implForWrapper, wrapperForImpl } = require('jsdom/lib/jsdom/living/generated/utils.js');
const jsdomRequire = createRequire(require.resolve('jsdom/lib/jsdom/browser/parser/html.js'));
const parse5 = jsdomRequire('parse5');
const Decimal = jsdomRequire('decimal.js');
const documents = new WeakMap(), activations = new WeakMap(), adapters = new WeakSet();
let patched = false;

function recordFor(document) {
  const record = documents.get(document);
  return record && !record.disposed && !record.signal?.aborted && !record.page.closed && record.window.document === record.document ? record : null;
}

function rangeValue(input, raw) {
  const min = input._minimum, max = input._maximum;
  // Preserve the measured native max-wins behavior for an inverted range.
  if (max < min) return String(max);
  let value = input._convertStringToNumber(raw);
  if (value === null || !Number.isFinite(value)) value = (min + max) / 2;
  value = Math.max(min, Math.min(max, value));
  const step = input._allowedValueStep;
  if (step !== null) {
    const amount = new Decimal(step), base = new Decimal(input._stepBase);
    const rung = new Decimal(value).minus(base).dividedBy(amount);
    let snapped = rung.toDecimalPlaces(0, Decimal.ROUND_HALF_CEIL).times(amount).plus(base);
    if (snapped.gt(max)) snapped = new Decimal(max).minus(base).dividedBy(amount).floor().times(amount).plus(base);
    if (snapped.lt(min)) snapped = new Decimal(min).minus(base).dividedBy(amount).ceil().times(amount).plus(base);
    value = snapped.toNumber();
  }
  return input._convertStringToNumber(raw) === value ? raw : String(value);
}

function normalize(input, converted = false) {
  if (input.type === 'range') input._value = rangeValue(input, input._value);
  else if (input.type === 'time' && converted) input._value = input._value.replace(/\.000$/, '');
  else if (input.type === 'datetime-local') input._value = input._value.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}

function radioGroup(input) {
  const name = input.getAttributeNS(null, 'name');
  if (input.type !== 'radio' || !name) return [];
  const root = input.getRootNode({}), form = input.form, result = [];
  for (const candidate of domSymbolTree.treeIterator(root)) {
    if (candidate !== input && candidate.namespaceURI === 'http://www.w3.org/1999/xhtml' && candidate.localName === 'input' &&
        candidate.type === 'radio' && candidate.getAttributeNS(null, 'name') === name && candidate.form === form) result.push(candidate);
  }
  return result;
}

function treeWithLabels(root) { return root.nodeType === 9 || root.nodeType === 11 && root.host; }

export function prepareInputParserAdapter(adapter) {
  if (!adapter || adapters.has(adapter)) return;
  adapters.add(adapter);
  const create = adapter.createElement;
  adapter.createElement = function (...args) {
    const element = create.apply(this, args);
    if (element.localName === 'input' && recordFor(element._ownerDocument)) {
      // Parser attributes are adopted as a complete set. Empty range defaults
      // therefore use the final bounds, independently of authored attr order.
      if (element.type === 'range') element._value = rangeValue(element, element.getAttributeNS(null, 'value') ?? '');
      else normalize(element);
    }
    return element;
  };
}

function patch() {
  if (patched) return;
  patched = true;
  const value = Object.getOwnPropertyDescriptor(InputImpl.prototype, 'value');
  Object.defineProperty(InputImpl.prototype, 'value', { ...value, set(text) {
    value.set.call(this, text);
    if (recordFor(this._ownerDocument)) normalize(this);
  } });
  const modify = InputImpl.prototype._attrModified;
  InputImpl.prototype._attrModified = function (name, ...args) {
    const result = modify.call(this, name, ...args);
    if (recordFor(this._ownerDocument) && ['type', 'value', 'min', 'max', 'step'].includes(name)) normalize(this);
    return result;
  };
  const reset = InputImpl.prototype._formReset;
  InputImpl.prototype._formReset = function (...args) {
    const result = reset.apply(this, args);
    if (recordFor(this._ownerDocument)) normalize(this);
    return result;
  };
  for (const property of ['valueAsNumber', 'valueAsDate']) {
    const descriptor = Object.getOwnPropertyDescriptor(InputImpl.prototype, property);
    Object.defineProperty(InputImpl.prototype, property, { ...descriptor, set(value) {
      const result = descriptor.set.call(this, value);
      if (recordFor(this._ownerDocument)) { this._dirtyValue = true; normalize(this, true); }
      return result;
    } });
  }
  const stepUpdate = InputImpl.prototype._stepUpdate;
  InputImpl.prototype._stepUpdate = function (count, isUp) {
    if (!recordFor(this._ownerDocument)) return stepUpdate.call(this, count, isUp);
    if (!this._idlMemberApplies(isUp ? 'stepUp' : 'stepDown') || this._allowedValueStep === null) return stepUpdate.call(this, count, isUp);
    if (count === 0) return;
    if (count < 0) { isUp = !isUp; count = -count; }
    const min = this._minimum, max = this._maximum;
    if (min !== null && max !== null && min > max) return;
    const step = new Decimal(this._allowedValueStep), base = new Decimal(this._stepBase);
    const number = this.valueAsNumber, before = new Decimal(Number.isNaN(number) ? 0 : number);
    const quotient = before.minus(base).dividedBy(step);
    let rung;
    if (quotient.isInteger()) rung = quotient.plus(isUp ? count : -count);
    else rung = (isUp ? quotient.ceil() : quotient.floor()).plus(isUp ? count - 1 : -(count - 1));
    let next = rung.times(step).plus(base);
    if (min !== null && next.lt(min)) next = new Decimal(min).minus(base).dividedBy(step).ceil().times(step).plus(base);
    if (max !== null && next.gt(max)) next = new Decimal(max).minus(base).dividedBy(step).floor().times(step).plus(base);
    if (min !== null && next.lt(min) || max !== null && next.gt(max) || (isUp ? next.lt(before) : next.gt(before))) return;
    // Use the real value setter, retaining dirty state and style-state invalidation.
    this.value = this._convertNumberToString(next.toNumber());
    normalize(this, true);
  };

  const others = Object.getOwnPropertyDescriptor(InputImpl.prototype, '_otherRadioGroupElements');
  Object.defineProperty(InputImpl.prototype, '_otherRadioGroupElements', { ...others, get() {
    return recordFor(this._ownerDocument) ? radioGroup(this) : others.get.call(this);
  } });
  const pre = InputImpl.prototype._legacyPreActivationBehavior;
  InputImpl.prototype._legacyPreActivationBehavior = function (...args) {
    if (recordFor(this._ownerDocument) && this.type === 'radio') activations.set(this, radioGroup(this).find(other => other.checked) ?? null);
    return pre.apply(this, args);
  };
  const canceled = InputImpl.prototype._legacyCanceledActivationBehavior;
  InputImpl.prototype._legacyCanceledActivationBehavior = function (...args) {
    const previous = activations.get(this); activations.delete(this);
    const result = canceled.apply(this, args);
    if (previous && recordFor(this._ownerDocument) && radioGroup(this).includes(previous)) previous.checked = true;
    return result;
  };
  const activate = InputImpl.prototype._activationBehavior;
  InputImpl.prototype._activationBehavior = function (...args) {
    try { return activate.apply(this, args); } finally { activations.delete(this); }
  };

  const control = Object.getOwnPropertyDescriptor(LabelImpl.prototype, 'control');
  Object.defineProperty(LabelImpl.prototype, 'control', { ...control, get() {
    if (recordFor(this._ownerDocument) && this.hasAttributeNS(null, 'for') && !treeWithLabels(this.getRootNode({}))) return null;
    return control.get.call(this);
  } });
  for (const name of ['Input', 'Button', 'Select', 'TextArea', 'Meter', 'Progress', 'Output']) {
    const prototype = require(`jsdom/lib/jsdom/living/nodes/HTML${name}Element-impl.js`).implementation.prototype;
    const labels = Object.getOwnPropertyDescriptor(prototype, 'labels');
    Object.defineProperty(prototype, 'labels', { ...labels, get() {
      const record = recordFor(this._ownerDocument);
      if (!record) return labels.get.call(this);
      if (!isLabelable(this)) return null;
      const root = this.getRootNode({}), nodes = [];
      if (treeWithLabels(root)) for (const candidate of domSymbolTree.treeIterator(root)) {
        if (candidate.localName === 'label' && candidate.control === this) nodes.push(wrapperForImpl(candidate));
      }
      // Measured native API returns fresh realm Array snapshots, not NodeLists.
      return record.arrayFrom(nodes);
    } });
  }
  for (const name of ['parse', 'parseFragment']) {
    const original = parse5[name];
    parse5[name] = function (...args) { prepareInputParserAdapter(args.at(-1)?.treeAdapter); return original.apply(this, args); };
  }
}

export function installInputControls(page, window) {
  const document = implForWrapper(window.document);
  if (recordFor(document)) return documents.get(document).controller;
  patch();
  const record = { page, window, document: window.document, signal: page.documentAbort?.signal, disposed: false,
    arrayFrom: window.Array.from.bind(window.Array) };
  documents.set(document, record);
  installOptionAlias(window);
  const previousClose = window.close;
  const dispose = () => {
    if (record.disposed) return;
    record.disposed = true; documents.delete(document);
    record.signal?.removeEventListener('abort', dispose);
    if (window.close === close) window.close = previousClose;
  };
  function close(...args) { dispose(); return Reflect.apply(previousClose, this, args); }
  window.close = close;
  record.controller = Object.freeze({ dispose });
  record.signal?.addEventListener('abort', dispose, { once: true });
  return record.controller;
}
