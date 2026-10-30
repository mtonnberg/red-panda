// Opt-in loader overlay for the isolated CLI proposal. No source files change.
import {registerHooks} from 'node:module';
const helper=new URL('./cli-options-prototype.mjs',import.meta.url).href;
const cli=new URL('../../bin/red-panda.js',import.meta.url).href;
const browser=new URL('../../src/browser.js',import.meta.url).href;
export const modifications=new Map([
 [cli,{prefix:`import {prepareCLIArguments,readCLIWaitScript,parseCLIHTTPHeaders} from ${JSON.stringify(helper)};\n`,edits:[
  ["  --wait-script JS        Wait for a truthy JavaScript expression", "  --wait-script JS        Wait for a truthy JavaScript expression\n  --wait-script-file PATH Read a wait expression from a UTF-8 file (last script flag wins)\n  --http-header HEADER   Set a fixed Name: Value header on every HTTP request (repeatable)"],
  ["  --wait-until load|domcontentloaded|done          Readiness (default load)", "  --wait-until load|domcontentloaded|done          Readiness (default load; none with a wait predicate)"],
  ["                         structured_data, text, links, png or pdf (default no dump)", "                         structured_data, text, links, png or pdf (no flag: no dump; bare --dump: html)"],
  ["args: argv, allowPositionals", "args: prepareCLIArguments(argv, [...DUMP_FORMATS, 'png', 'pdf']), allowPositionals"],
  ["'wait-selector': { type: 'string' }, 'wait-script': { type: 'string' },", "'wait-selector': { type: 'string' }, 'wait-script': { type: 'string' }, 'wait-script-file': { type: 'string' },\n    'http-header': { type: 'string', multiple: true },"],
  ["const timeout = integer(values['wait-ms'], '--wait-ms');", "const timeout = integer(values['wait-ms'], '--wait-ms');\n  const cliHTTPHeaders = parseCLIHTTPHeaders(values['http-header']);"],
  ["const options = { timeout, javascript:","const options = { timeout, cliHTTPHeaders, javascript:"],
  ["  const browser = new Browser(options);", "  const waitScript = await readCLIWaitScript(tokens);\n  const waitUntil = tokens.some(token => token.kind === 'option' && token.name === 'wait-until') ? values['wait-until'] : (values['wait-selector'] !== undefined || waitScript !== undefined ? 'none' : 'load');\n  const browser = new Browser(options);"],
  ["waitUntil: values['wait-until'] === 'done' ? 'networkidle0' : values['wait-until'],", "waitUntil: waitUntil === 'done' ? 'networkidle0' : waitUntil,"],
  ["selector: values['wait-selector'], script: values['wait-script'],", "selector: values['wait-selector'], script: waitScript,"],
  ["else if (values.dump) console.log(results[0].content);", "else if (values.dump) process.stdout.write(results[0].content);"],
 ]}],
 [browser,{prefix:'',edits:[
  ["this.extraHTTPHeaders = new Headers();", "this.extraHTTPHeaders = new Headers();\n    this.cliHTTPHeaders = new Headers(browser.options.cliHTTPHeaders);"],
  ["      const id = this.requestStarted(url, type, method, Object.fromEntries(headers),", "      // CLI headers retain precedence over page headers and cookie defaults on every hop.\n      this.cliHTTPHeaders.forEach((value, name) => headers.set(name, value));\n      const id = this.requestStarted(url, type, method, Object.fromEntries(headers),"],
  ["const ready = waitUntil === 'domcontentloaded' ? documentReady : Promise.all([loaded, moduleReady]);", "const ready = waitUntil === 'none' ? Promise.resolve() : waitUntil === 'domcontentloaded' ? documentReady : Promise.all([loaded, moduleReady]);"],
 ]}],
]);
export const hook=registerHooks({load(url,context,nextLoad){const loaded=nextLoad(url,context),change=modifications.get(url);if(!change)return loaded;let source=typeof loaded.source==='string'?loaded.source:new TextDecoder().decode(loaded.source);const shebang=source.startsWith('#!')?source.slice(0,source.indexOf('\n')+1):'';source=source.slice(shebang.length);for(const[before,after]of change.edits){if(source.split(before).length!==2)throw new Error(`CLI proposal integration anchor changed: ${url}: ${before}`);source=source.replace(before,after);}return {...loaded,source:shebang+change.prefix+source};}});
