// Preserve R2's supported no-runScripts installer and its known hook hazard.
// Closing this actual Host JSDOM does not disable its birth-time observer.
import {JSDOM,VirtualConsole} from 'jsdom';
import {installErrors} from '../src/errors.js';
import {writeSync} from 'node:fs';
const page={closed:false,documentAbort:new AbortController()};
const dom=new JSDOM('',{virtualConsole:new VirtualConsole(),beforeParse(window){installErrors(page,window)}});
writeSync(1,JSON.stringify({marker:'actual-legacy-host-installer-enabled',runScriptsOmitted:true,observerNotDisabled:true})+'\n');
process.on('exit',()=>{page.closed=true;page.documentAbort.abort();dom.window.close()});
