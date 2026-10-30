// Test-only integration around the immutable copied Browser. Shared production
// and frozen core files are not modified; root will place the real beforeParse hook.
import { Page } from '../../src/browser.js';
import { installInputControls } from '../../src/input-controls.js';
const original = Page.prototype.prepareWindow;
Page.prototype.prepareWindow = function (window, ...args) {
  const result = original.call(this, window, ...args);
  installInputControls(this, window);
  return result;
};
