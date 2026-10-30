import { JSDOM } from 'jsdom';
import { EventEmitter } from 'node:events';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import './selectors-integration.mjs';
const { installStyles }=await import('../../src/styles.js');
import { installSelectors } from './selectors-prototype.mjs';
const html=`<!doctype html><form id="form" method="POST"><input id="box" type="Checkbox"></form><a id="tel" href="tel:1" data-v="a:b"></a><a id="empty" href=""></a><a id="missing"></a><a id="case" target="_Blank" rel="NoFollow" hreflang="EN-us"></a><p id="slash" data-v="abc\\def"></p><p id="quote" data-v='it"s ok'></p><p id="digit" x="1"></p><p id="replacement" x="a&#xfffd;b"></p><svg><g id="foreign" type="Matrix"></g></svg><div id="target" class="x"><span id="span"></span></div>`;
const page=Object.assign(new EventEmitter(),{documentAbort:new AbortController()});const dom=new JSDOM(html,{beforeParse(w){installSelectors(page,w);installStyles(page,w);}});
const native=JSON.parse(await readFile(new URL('./selectors-native-observation.json',import.meta.url),'utf8'));const observations=[],mismatches=[];
try{const d=dom.window.document,element=d.getElementById('target');for(const expected of native.observations.selectors){const selector=expected.selector,row={selector};for(const[method,read]of[['all',()=>Array.from(d.querySelectorAll(selector),e=>e.id||e.localName)],['matches',()=>element.matches(selector)],['closest',()=>element.closest(selector)?.id??null]])try{row[method]=read()}catch(error){row[method+'Error']=error.name;}observations.push(row);if(JSON.stringify(row)!==JSON.stringify(expected))mismatches.push({native:expected,candidate:row});}}
finally{page.documentAbort.abort();dom.window.close();}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');const result={scope:'Direct installer comparison of real DOM selector results against the bounded native public probe; Browser acceptance is recorded separately',htmlSHA256:digest(html),nativeHTMLSHA256:native.htmlSHA256,prototypeSHA256:digest(await readFile(new URL('./selectors-prototype.mjs',import.meta.url))),selected:observations.length,matched:observations.length-mismatches.length,observations,mismatches};console.log(JSON.stringify({selected:result.selected,matched:result.matched,mismatches},null,2));await writeFile(process.argv[2]??new URL('./selectors-public-comparison.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});if(mismatches.length)process.exitCode=1;
