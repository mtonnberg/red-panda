import http from 'node:http';
import { once } from 'node:events';
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
const binary=process.argv[2]??'/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const html=`<!doctype html><form id="form" method="POST"><input id="box" type="Checkbox"></form><a id="tel" href="tel:1" data-v="a:b"></a><a id="empty" href=""></a><a id="missing"></a><a id="case" target="_Blank" rel="NoFollow" hreflang="EN-us"></a><p id="slash" data-v="abc\\def"></p><p id="quote" data-v='it"s ok'></p><p id="digit" x="1"></p><p id="replacement" x="a&#xfffd;b"></p><svg><g id="foreign" type="Matrix"></g></svg><div id="target" class="x"><span id="span"></span></div>`;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});server.listen(0,'127.0.0.1');await once(server,'listening');
let reference,client;const observations={};
const selectors=[
 '[href^=""]','[href$=""]','[href*=""]','[href~=""]','[class~="a b"]','a:not([href^=""])','a:is([href^=""], *)','[href^=""], a',
 'form[method=post]','form[method=post s]','form[method=post S]','[type=checkbox]','#foreign[type=matrix]','#foreign[type=matrix i]','a[target=_blank][rel~=nofollow][hreflang|=en]',
 '[x=null]','[x=""]','[x=1]','[x=-1]','[x=\\31]','[data-v=a:b]','[data-v=a\\:b]','[href^=tel\\:]','[href=tel\\3a 1]','[data-v="abc\\\\def"]','[data-v="abc\\5C def"]','[data-v="it\\"s ok"]',
 '[data-v="a\\\n:b"]','[data-v="a\nb"]','[x=a\\\nb]','[x=a\0b]',':has()',':not()',':lang()',':nth-child(foo)',':nth-child(-)',':nth-child(+)',
 '::before','::marker','::-webkit-unknown','::part(x)','::slotted(span)','::cue(b)','::highlight(h)','::picker(select)','::before::marker','::part(x)::before','::before:is(.a)',
 '::-webkit-scrollbar-thumb:hover','::-webkit-scrollbar-button:horizontal:decrement','input::file-selector-button:hover','::selection:window-inactive','::part(x):hover','::part(x):state(open)','::column::scroll-marker:target-current',
 '::foo','::-moz-selection','::-webkit-autofill','::before()','::part()','::picker(x)','::before::after','::before.x','::before div','::before > p','::before[a]','::before:hover','::marker::before',
 ':not(::before)',':has(::before)','div:has(> p::before)','::placeholder:hover','::part(x):first-child','::part(x):not(.a)','::part(x)::part(y)','::before::marker:hover',
 'div::before, .x',':is(::before,.x)',':where(::after)',':is(#target::before,.x)',':is(:unknown,.x)',':is(,.x)',':where()',':is()',':not(:is(::before,.x))',
];
try{
 reference=await startReference(binary);client=await connect(reference.endpoint,{timeout:5000});const{browserContextId}=await client.send('Target.createBrowserContext');const{targetId}=await client.send('Target.createTarget',{url:'about:blank',browserContextId});const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});await client.send('Runtime.enable',{},sessionId);await client.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/probe`},sessionId);
 const evaluate=async body=>{const result=await client.send('Runtime.evaluate',{expression:`JSON.stringify((()=>{${body}})())`,returnByValue:true},sessionId);if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return JSON.parse(result.result.value);};
 observations.selectors=await evaluate(`const selectors=${JSON.stringify(selectors)};const element=document.getElementById('target');return selectors.map(selector=>{const row={selector};for(const [method,read]of [['all',()=>Array.from(document.querySelectorAll(selector),e=>e.id||e.localName)],['matches',()=>element.matches(selector)],['closest',()=>element.closest(selector)?.id??null]])try{row[method]=read()}catch(error){row[method+'Error']=error.name}return row});`);
 observations.cssom=await evaluate(`const out=[];for(const text of [':is(#target::before,.x){display:none}',':is(::before,.x){color:red}','::foo{color:blue}','div::before,.x{color:green}',':where(::after){color:blue}']){const sheet=new CSSStyleSheet();sheet.replaceSync(text);out.push({source:text,rules:Array.from(sheet.cssRules,r=>({selectorText:r.selectorText,cssText:r.cssText}))});}return out;`);
 observations.ids=await evaluate(`const root=document.createElement('section');document.body.append(root);root.innerHTML='<div id="first"><i id="duplicate">A</i></div><div id="second"><i id="duplicate">B</i></div>';const first=root.firstElementChild.firstElementChild,second=root.lastElementChild.firstElementChild;const out=[];const snap=()=>({get:document.getElementById('duplicate')?.textContent??null,all:Array.from(root.querySelectorAll('#duplicate'),e=>e.textContent),firstScope:root.firstElementChild.querySelector('#duplicate')?.textContent??null,lastScope:root.lastElementChild.querySelector('#duplicate')?.textContent??null});out.push(snap());first.id='other';first.id='duplicate';out.push(snap());root.append(root.firstElementChild);out.push(snap());root.prepend(root.lastElementChild);out.push(snap());root.remove();return out;`);
 observations.heartbeat=await evaluate('return 6*7;');await client.send('Target.disposeBrowserContext',{browserContextId});
}finally{if(client)await client.close();if(reference)await reference.close();await new Promise(resolve=>server.close(resolve));}
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');const result={scope:'Independent bounded public selector/ID native probe with owned port0 fixture and browser; no native engine source imported',binary:{path:binary,sha256:digest(await readFile(binary))},driverSHA256:digest(await readFile(new URL(import.meta.url))),htmlSHA256:digest(html),observations};
await writeFile(process.argv[3]??new URL('./selectors-native-observation.json',import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
