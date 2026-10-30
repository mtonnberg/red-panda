// Test-only source overlays: no src/ file is modified. The exact changes below
// are the proposed parent integration and are shared by the isolated tests.
import { registerHooks } from 'node:module';

const prototype = new URL('./dialogs-prototype.mjs', import.meta.url).href;
const browser = new URL('../../src/browser.js', import.meta.url).href;
const forms = new URL('../../src/forms.js', import.meta.url).href;
const input = new URL('../../src/input.js', import.meta.url).href;
export const integrations = new Map([
  [browser, { statement:`import { installDialogs } from ${JSON.stringify(prototype)};\n`, before:'    installForms(this, window);', after:'    installDialogs(this, window);\n    installForms(this, window);' }],
  [forms, { statement:`import { submitDialogForm } from ${JSON.stringify(prototype)};\n`, before:"  if (rawMethod === 'dialog') throw new window.DOMException('Dialog form submission is not implemented', 'NotSupportedError');", after:'  if (submitDialogForm(form, submitter)) return;' }],
  [input, { statement:`import { requestDialogClose } from ${JSON.stringify(prototype)};\n`, before:"  if (params.type !== 'char' && params.key === 'Tab') {", after:"  if (params.type !== 'char' && params.key === 'Escape') { requestDialogClose(window); return; }\n  if (params.type !== 'char' && params.key === 'Tab') {" }],
]);
export const hook = registerHooks({ load(url, context, nextLoad) {
  const loaded=nextLoad(url,context), patch=integrations.get(url);
  if (!patch) return loaded;
  const source=typeof loaded.source==='string'?loaded.source:new TextDecoder().decode(loaded.source);
  if (!source.includes(patch.before)) throw new Error(`Dialog proposal integration anchor changed: ${url}`);
  return { ...loaded,source:patch.statement+source.replace(patch.before,patch.after) };
} });
