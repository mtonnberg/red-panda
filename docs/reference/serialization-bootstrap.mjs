// Test-only composition around the copied current Browser. No original runtime edits.
import { Page } from '../../src/browser.js';
import { installSerialization } from '../../src/serialization.js';
const prepare = Page.prototype.prepareWindow;
Page.prototype.prepareWindow = function (window, ...args) {
  const result = prepare.call(this, window, ...args);
  installSerialization(this, window);
  return result;
};
