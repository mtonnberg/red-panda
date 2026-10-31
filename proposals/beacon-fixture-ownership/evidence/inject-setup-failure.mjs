// Negative lifetime control ONLY: deliberately throw before the original
// fixture enters its try/finally. This does not reproduce Root's unknown error.
import {Browser} from '../src/browser.js';
import {appendFileSync} from 'node:fs';
const path=process.env.BEACON_DIAG_FILE;
Browser.prototype.createPage=function(){appendFileSync(path,JSON.stringify({pid:process.pid,type:'injected-createPage-error',active:process.getActiveResourcesInfo(),handles:process._getActiveHandles().map(h=>({kind:h.constructor?.name,listening:h.listening,address:h.address?.()}))})+'\n');throw new Error('OWNED_INJECTED_SETUP_FAILURE')};
setInterval(()=>appendFileSync(path,JSON.stringify({pid:process.pid,type:'active-after-setup-failure',active:process.getActiveResourcesInfo(),handles:process._getActiveHandles().map(h=>({kind:h.constructor?.name,listening:h.listening,address:h.address?.()}))})+'\n'),500).unref();
