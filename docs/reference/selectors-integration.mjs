// Test-only opt-in source overlay. Production files and dependencies are unchanged.
import { registerHooks } from 'node:module';
const prototype=new URL('./selectors-prototype.mjs',import.meta.url).href;
const dialogs=new URL('./dialogs-prototype.mjs',import.meta.url).href;
const browser=new URL('../../src/browser.js',import.meta.url).href;
const styles=new URL('../../src/styles.js',import.meta.url).href;
export const integrations=new Map([
 [browser,{statement:`import { installSelectors } from ${JSON.stringify(prototype)};\nimport { isPopoverOpen, getDialogStateRevision } from ${JSON.stringify(dialogs)};\n`,edits:[['    installStyles(this, window);','    installSelectors(this, window, { isPopoverOpen, getStateRevision: getDialogStateRevision });\n    installStyles(this, window);']]}],
 [styles,{statement:`import { selectorForSpecificity, getSelectorStateRevision } from ${JSON.stringify(prototype)};\n`,edits:[
  ['function specificity(selector) {','function specificity(selector) {\n  selector = selectorForSpecificity(selector);'],
  ['const tokens = [record.stateRevision,','const tokens = [getSelectorStateRevision(record.window), record.stateRevision,'],
  ['const tokens = [window.innerWidth, window.innerHeight, record.stateRevision,','const tokens = [getSelectorStateRevision(window), window.innerWidth, window.innerHeight, record.stateRevision,'],
 ]}],
]);
export const hook=registerHooks({load(url,context,nextLoad){const loaded=nextLoad(url,context),patch=integrations.get(url);if(!patch)return loaded;
 let source=typeof loaded.source==='string'?loaded.source:new TextDecoder().decode(loaded.source);
 for(const[before,after]of patch.edits){if(!source.includes(before))throw new Error(`Selector integration anchor changed: ${url}: ${before}`);source=source.replace(before,after);}
 return {...loaded,source:patch.statement+source};
}});
