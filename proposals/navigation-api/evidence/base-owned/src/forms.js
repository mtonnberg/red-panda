import {implementationForWrapper as implForWrapper} from './dom-event-state.js';
import {appendFormAssociatedValue} from './element-internals.js';
import { submitDialogForm } from './dialogs.js';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { installNavigation, requestTargetNavigation } from './navigation.js';
import {resolveFormTarget,createFormPopup} from './popup-pages.js';
import { installFormControls } from './form-controls.js';

const require = createRequire(import.meta.url);
const FormImpl = require('jsdom/lib/jsdom/living/nodes/HTMLFormElement-impl.js').implementation;
const DataImpl = require('jsdom/lib/jsdom/living/xhr/FormData-impl.js').implementation;
const HTMLElement = require('jsdom/lib/jsdom/living/generated/HTMLElement.js');
const FormDataIDL = require('jsdom/lib/jsdom/living/generated/FormData.js');
const {wrapperForImpl}=require('jsdom/lib/jsdom/living/generated/utils.js');
const { isDisabled, isSubmitButton } = require('jsdom/lib/jsdom/living/helpers/form-controls.js');
const DOCUMENTS = new WeakMap();
const DATA_WINDOWS = new WeakSet();
let patched = false;
const encodings = new Set(['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']);
const crlf = value => String(value).replace(/\r\n|\r|\n/g, '\r\n');

function dispatchTrusted(target, event) {
  const implementation = implForWrapper(event);
  implementation.isTrusted = true;
  return implForWrapper(target)._dispatch(implementation);
}

function registered(form) {
  return documentRecord(form._ownerDocument);
}

function documentRecord(document) {
  const record = DOCUMENTS.get(document);
  return record && !record.disposed && !record.page.closed && !record.signal?.aborted &&
    record.window.document === record.document ? record : null;
}

function setting(form, submitter, name) {
  const override = submitter?.getAttribute(`form${name}`);
  return override === null || override === undefined ? form.getAttribute(name) : override;
}

function installSubmitterProperties(window) {
  for (const Constructor of [window.HTMLButtonElement, window.HTMLInputElement]) {
    const properties = {
      formAction: { attribute: 'formaction', read(value, control) {
        if (!value) return control.ownerDocument.URL;
        try { return new URL(value, control.ownerDocument.baseURI).href; } catch { return value; }
      } },
      formMethod: { attribute: 'formmethod', read(value) {
        if (value === null) return '';
        value = value.toLowerCase();
        return ['get', 'post', 'dialog'].includes(value) ? value : 'get';
      } },
      formEnctype: { attribute: 'formenctype', read(value) {
        if (value === null) return '';
        value = value.toLowerCase();
        return encodings.has(value) ? value : 'application/x-www-form-urlencoded';
      } },
    };
    for (const [name, { attribute, read }] of Object.entries(properties)) {
      if (name in Constructor.prototype) continue;
      Object.defineProperty(Constructor.prototype, name, {
        configurable: true, enumerable: true,
        get() { return read(this.getAttribute(attribute), this); },
        set(value) { this.setAttribute(attribute, value); },
      });
    }
  }
}

function direction(control) {
  for (let element = control; element; element = element.parentElement) {
    const value = element.getAttribute('dir')?.toLowerCase();
    if (value === 'ltr' || value === 'rtl') return value;
    if (value === 'auto') {
      for (const character of control.value) {
        if (/[\p{Script=Hebrew}\p{Script=Arabic}]/u.test(character)) return 'rtl';
        if (/\p{Letter}/u.test(character)) return 'ltr';
      }
      return 'ltr';
    }
  }
  return 'ltr';
}

function entryList(record, formImpl, submitterImpl, data = new record.window.FormData()) {
  const { window } = record;
  for (const implementation of formImpl._getSubmittableElementNodes()) {
    const control = wrapperForImpl(implementation);
    if (appendFormAssociatedValue(implementation, data)) continue;
    if (isDisabled(implementation) || control.closest('datalist')) continue;
    const tag = control.localName;
    const type = control.type;
    if (tag === 'object') continue;
    if ((tag === 'button' || (tag === 'input' && ['submit', 'image', 'reset', 'button'].includes(type))) && implementation !== submitterImpl) continue;
    if (tag === 'input' && ['checkbox', 'radio'].includes(type) && !control.checked) continue;
    const name = control.getAttribute('name');
    if (tag === 'input' && type === 'image') {
      const prefix = name ? `${name}.` : '';
      const point = implementation._selectedCoordinate ?? { x: 0, y: 0 };
      data.append(`${prefix}x`, String(Math.max(0, Math.trunc(point.x))));
      data.append(`${prefix}y`, String(Math.max(0, Math.trunc(point.y))));
      continue;
    }
    if (!name) continue;
    if (tag === 'select') {
      for (const option of control.options) {
        if (option.selected && !option.disabled && !(option.parentElement?.localName === 'optgroup' && option.parentElement.disabled)) {
          data.append(name, option.value);
        }
      }
    } else if (tag === 'input' && type === 'file') {
      if (control.files.length) for (const file of control.files) data.append(name, file);
      else data.append(name, new window.File([], '', { type: 'application/octet-stream' }));
    } else {
      data.append(name, tag === 'input' && type === 'hidden' && name === '_charset_' ? 'UTF-8' : control.value);
    }
    if ((tag === 'textarea' || (tag === 'input' && ['text', 'search', 'url', 'tel', 'email'].includes(type))) && control.getAttribute('dirname')) {
      data.append(control.getAttribute('dirname'), direction(control));
    }
  }
  return data;
}

function installFormData(window) {
  if (DATA_WINDOWS.has(window)) return;
  DATA_WINDOWS.add(window);
  const Original = window.FormData;
  const Constructor = new Proxy(Original, { construct(target, args, newTarget) {
    const form = implForWrapper(args[0]);
    const record = form instanceof FormImpl && registered(form);
    // Let the generated constructor perform ordinary Web IDL conversion for
    // empty, invalid and unregistered forms. The observed native second argument
    // accepts any HTMLElement, including a non-button or unrelated control.
    if (!record) return Reflect.construct(target, args, newTarget);
    const submitter = args[1] == null ? null : HTMLElement.convert(window, args[1], { context: 'FormData submitter' });
    if (record.constructing.has(form)) throw new window.DOMException('The form entry list is being constructed', 'InvalidStateError');
    const data = Reflect.construct(target, [], newTarget);
    record.constructing.add(form);
    try {
      entryList(record, form, submitter, data);
      dispatchTrusted(wrapperForImpl(form), new record.window.FormDataEvent('formdata', { bubbles: true, formData: data }));
    } finally { record.constructing.delete(form); }
    return data;
  } });
  Object.defineProperty(Original.prototype, 'constructor', { configurable: true, writable: true, value: Constructor });
  window.FormData = Constructor;
}

function serializedPairs(data) {
  return [...data].map(([name, value]) => [crlf(name), crlf(typeof value === 'string' ? value : value.name)]);
}

function encodeBody(data, encoding) {
  if (encoding === 'application/x-www-form-urlencoded') {
    return { body: new URLSearchParams(serializedPairs(data)).toString(), contentType: encoding };
  }
  if (encoding === 'text/plain') {
    return { body: serializedPairs(data).map(([name, value]) => `${name}=${value}\r\n`).join(''), contentType: encoding };
  }
  const boundary = `----red-panda-${randomBytes(18).toString('hex')}`;
  const parts = [];
  const quote = value => String(value).replace(/[\r\n"]/g, character => ({ '\r': '%0D', '\n': '%0A', '"': '%22' })[character]);
  for (const [name, value] of data) {
    let header = `--${boundary}\r\nContent-Disposition: form-data; name="${quote(crlf(name))}"`;
    if (typeof value === 'string') {
      parts.push(Buffer.from(`${header}\r\n\r\n${crlf(value)}\r\n`));
    } else {
      header += `; filename="${quote(value.name)}"\r\nContent-Type: ${value.type || 'application/octet-stream'}`;
      parts.push(Buffer.from(`${header}\r\n\r\n`), Buffer.from(implForWrapper(value)._buffer), Buffer.from('\r\n'));
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

function submit(record, formImpl, submitterImpl, bypass) {
  const { window } = record;
  if ((!bypass && !formImpl.isConnected) || record.constructing.has(formImpl)) return;
  const form = wrapperForImpl(formImpl);
  const submitter = submitterImpl ? wrapperForImpl(submitterImpl) : null;
  const targetName = setting(form, submitter, 'target') ?? '';
  let targetPage = resolveFormTarget(record.page, targetName);
  if (!bypass) {
    if (record.submitting.has(formImpl)) return;
    record.submitting.add(formImpl);
    try {
      if (!form.noValidate && !submitter?.hasAttribute('formnovalidate') && !formImpl.reportValidity()) return;
      if (!dispatchTrusted(form, new window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter }))) return;
    } finally { record.submitting.delete(formImpl); }
  }
  if (record.disposed || record.signal?.aborted) return;
  record.constructing.add(formImpl);
  let data;
  try {
    data = entryList(record, formImpl, submitterImpl);
    dispatchTrusted(form, new window.FormDataEvent('formdata', { bubbles: true, formData: data }));
  } finally { record.constructing.delete(formImpl); }
  if (record.disposed || record.signal?.aborted) return;
  const rawMethod = setting(form, submitter, 'method')?.toLowerCase();
  if (submitDialogForm(form, submitter)) return;
  const method = rawMethod === 'post' ? 'POST' : 'GET';
  const action = setting(form, submitter, 'action');
  const destination = new URL(action || window.location.href, record.document.baseURI);
  if (!['http:', 'https:'].includes(destination.protocol)) {
    throw new window.DOMException(`Form submission protocol ${destination.protocol} is not implemented`, 'NotSupportedError');
  }
  const noReferrer = /(?:^|[\t\n\f\r ])noreferrer(?:$|[\t\n\f\r ])/i.test(form.getAttribute('rel') || '');
  const options = { method, historyMode: 'push', referrer: noReferrer ? '' : window.location.href };
  if (method === 'GET') {
    destination.search = `?${new URLSearchParams(serializedPairs(data))}`;
  } else {
    const requested = setting(form, submitter, 'enctype')?.toLowerCase();
    const encoding = encodings.has(requested) ? requested : 'application/x-www-form-urlencoded';
    const { body, contentType } = encodeBody(data, encoding);
    options.body = body;
    options.headers = { 'content-type': contentType, origin: formImpl._ownerDocument._origin ?? window.location.origin };
  }
  if (targetPage === null) {
    targetPage = createFormPopup(record.page,window,{opener:/(?:^|[\t\n\f\r ])opener(?:$|[\t\n\f\r ])/i.test(form.getAttribute('rel') || '')});
    if (!targetPage) throw new window.DOMException(`Form target ${targetName} is not implemented`, 'NotSupportedError');
  }
  requestTargetNavigation(record.page, window, targetPage, destination.href, options);
}

function patchHost() {
  if (patched) return;
  patched = true;
  const originalSubmit = FormImpl.prototype.submit;
  const originalRequest = FormImpl.prototype.requestSubmit;
  const originalActivation = FormImpl.prototype._doRequestSubmit;
  const originalReset = FormImpl.prototype.reset;
  const originalSet = DataImpl.prototype.set;
  DataImpl.prototype.set = function (...args) {
    const document = implForWrapper(this._globalObject.document);
    if (!documentRecord(document)) return originalSet.apply(this, args);
    const previous = new Set(this._entries);
    const result = originalSet.apply(this, args);
    // Native removes all matching entries and appends the replacement. Retain
    // the generated conversion path without coercing authored arguments twice.
    const index = this._entries.findIndex(entry => !previous.has(entry));
    if (index >= 0 && index < this._entries.length - 1) this._entries.push(...this._entries.splice(index, 1));
    return result;
  };
  FormImpl.prototype.reset = function () {
    const record = registered(this);
    if (!record) return originalReset.call(this);
    if (record.resetting.has(this)) return;
    record.resetting.add(this);
    try { return originalReset.call(this); }
    finally { record.resetting.delete(this); }
  };
  FormImpl.prototype.submit = function () {
    const record = registered(this);
    return record ? submit(record, this, null, true) : originalSubmit.call(this);
  };
  FormImpl.prototype.requestSubmit = function (submitter = null) {
    const record = registered(this);
    if (!record) return originalRequest.call(this, submitter);
    if (submitter !== null) {
      if (!isSubmitButton(submitter)) throw new record.window.TypeError('The specified element is not a submit button');
      if (submitter.form !== this) throw new record.window.DOMException('The specified submitter is not owned by this form', 'NotFoundError');
    }
    return submit(record, this, submitter, false);
  };
  FormImpl.prototype._doRequestSubmit = function (submitter) {
    if (!registered(this)) return originalActivation.call(this, submitter);
    try { return originalActivation.call(this, submitter); }
    catch (error) {
      if (submitter) submitter._clickInProgress = false;
      throw error;
    }
  };
}

export function installForms(page, window) {
  if (!page || typeof page.navigate !== 'function' || !window?.document) throw new TypeError('Forms require a Page and document window');
  installNavigation(page, window);
  patchHost();
  installSubmitterProperties(window);
  const document = window.document;
  const implementation = implForWrapper(document);
  const previous = DOCUMENTS.get(implementation);
  if (previous?.page === page && !previous.disposed) return previous.controller;
  previous?.controller.dispose();
  // jsdom lacks FormDataEvent; retain normal Event dispatch semantics and a
  // readonly FormData payload rather than installing page-visible host state.
  if (typeof window.FormDataEvent !== 'function') {
    const payloads = new WeakMap();
    const Event = window.Event;
    window.FormDataEvent = class FormDataEvent extends Event {
      constructor(type, init = {}) {
        if (!FormDataIDL.is(init.formData)) throw new window.TypeError('FormDataEvent requires formData');
        super(type, init);
        payloads.set(this, init.formData);
      }
      get formData() {
        if (!payloads.has(this)) throw new window.TypeError('Illegal invocation');
        return payloads.get(this);
      }
    };
  }
  const record = { page, window, document, signal: page.documentAbort?.signal, disposed: false, originalClose: window.close,
    constructing: new WeakSet(), submitting: new WeakSet(), resetting: new WeakSet() };
  const dispose = () => {
    if (record.disposed) return;
    record.disposed = true;
    DOCUMENTS.delete(implementation);
    record.signal?.removeEventListener('abort', dispose);
    page.off?.('close', dispose);
    window.removeEventListener('unload', dispose);
    if (window.close === record.close) window.close = record.originalClose;
  };
  record.controller = { dispose };
  if (record.signal?.aborted || page.closed) { record.disposed = true; return record.controller; }
  DOCUMENTS.set(implementation, record);
  installFormControls(window, () => !!documentRecord(implementation));
  installFormData(window);
  record.close = function () { dispose(); return record.originalClose.call(window); };
  window.close = record.close;
  record.signal?.addEventListener('abort', dispose, { once: true });
  page.once?.('close', dispose);
  window.addEventListener('unload', dispose, { once: true });
  return record.controller;
}
