// Public DOM/CDP and CLI observations; no browser engine production source.
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const binary=process.argv[2]??'/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const owned=await startReference(binary);let client,server;
try {
  client=await connect(owned.endpoint);const{targetId}=await client.send('Target.createTarget',{url:'about:blank'});
  const{sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
  await client.send('Page.navigate',{url:'data:text/html,<!doctype html><body></body>'},sessionId);
  const result=await client.send('Runtime.evaluate',{returnByValue:true,expression:`(()=>{
    const capture=fn=>{try{return{value:fn()}}catch(error){return{error:error.name,message:error.message}}};
    const out={cases:[]};
    for(const value of ['<tag>','"&<>\u00a0','line1\\nline2\\r\\t',"it\u0027s \\u0060code\\u0060",'a&copy;&lt;&amp;','🚀é漢字','\\0\\x01\\x1f']){
      const parent=document.createElement('div'),child=document.createElement('span');child.setAttribute('data-value',value);child.textContent=value;parent.append(child);
      const template=document.createElement('template');template.content.append(child.cloneNode(true));
      const observer=new MutationObserver(()=>{});observer.observe(parent,{subtree:true,childList:true,attributes:true});
      const row={value,attribute:child.getAttribute('data-value'),inner:parent.innerHTML,outer:child.outerHTML,getHTML:typeof parent.getHTML==='function'?capture(()=>parent.getHTML()):null,template:template.innerHTML};
      row.xml=typeof XMLSerializer==='function'?capture(()=>new XMLSerializer().serializeToString(child)):null;
      row.mutations=observer.takeRecords().length;observer.disconnect();out.cases.push(row);
    }
    {const element=document.createElement('div');element.setAttribute('data-angle','<tag>');element.textContent='<text>&';document.body.append(element);out.document={element:document.documentElement.outerHTML,body:document.body.innerHTML,XML:typeof XMLSerializer==='function'?capture(()=>new XMLSerializer().serializeToString(document)):null};element.remove();}
    out.raw=[];for(const tag of ['script','style','textarea','title','noscript']){const e=document.createElement(tag);e.setAttribute('data-angle','<tag>');e.textContent='<text>&"\u00a0';out.raw.push({tag,outer:e.outerHTML,inner:e.innerHTML});}
    {const e=document.createElementNS('http://www.w3.org/2000/svg','svg');e.setAttribute('data-angle','<tag>');out.svg=e.outerHTML;out.namespaced=capture(()=>{e.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href','<tag>&');return e.outerHTML});}
    out.shadow=capture(()=>{const host=document.createElement('div'),root=host.attachShadow({mode:'closed',serializable:true});host.innerHTML='<b data-light="&lt;tag&gt;">light &amp;</b>';root.innerHTML='<i data-shadow="&lt;tag&gt;">shadow</i>';return{hostInner:host.innerHTML,rootInner:root.innerHTML,getHTML:host.getHTML({shadowRoots:[root]}),rootGetHTML:root.getHTML()}});
    out.xmlDocument=capture(()=>{const doc=new DOMParser().parseFromString('<doc a="&lt;tag&gt;&amp;">&lt;text&gt;</doc>','application/xml');return{inner:doc.documentElement.innerHTML,outer:doc.documentElement.outerHTML,serialized:new XMLSerializer().serializeToString(doc)}});
    out.boolean=[];for(const markup of ['<input disabled>','<option selected></option>','<div title=""></div>']){const box=document.createElement('div');box.innerHTML=markup;out.boolean.push({markup,html:box.innerHTML,xml:new XMLSerializer().serializeToString(box.firstChild)});}
    out.xmlControls=[];for(const markup of ['<Root xmlns="urn:test" a="&lt;x&gt;"/>','<Root xmlns="urn:test"><child/></Root>','<p:root xmlns:p="urn:p" p:a="&lt;tag&gt;"/>','<doc xmlns=""><x/></doc>','<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'])out.xmlControls.push({markup,result:capture(()=>{const doc=new DOMParser().parseFromString(markup,'application/xml');return{type:doc.contentType,html:doc.documentElement.outerHTML,xml:new XMLSerializer().serializeToString(doc)}})});
    out.foreignXML=capture(()=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('title','<tag>');return new XMLSerializer().serializeToString(svg)});
    out.doctypes=[];for(const markup of ['<!DOCTYPE html><p>x</p>','<!DOCTYPE html PUBLIC "pub" "sys"><p>x</p>'])out.doctypes.push(capture(()=>{const doc=new DOMParser().parseFromString(markup,'text/html');return{xml:new XMLSerializer().serializeToString(doc),html:doc.documentElement.outerHTML}}));
    out.serializedNodes=[];for(const node of [document.createTextNode('<x>&'),document.createComment('<x>&'),document.createDocumentFragment()])out.serializedNodes.push(capture(()=>new XMLSerializer().serializeToString(node)));
    out.booleanNames=[];for(const name of ['allowfullscreen','async','autofocus','autoplay','checked','controls','default','defer','disabled','formnovalidate','hidden','ismap','loop','multiple','muted','nomodule','novalidate','open','playsinline','readonly','required','reversed','selected','inert','itemscope','download','contenteditable','shadowrootserializable','shadowrootdelegatesfocus']){const e=document.createElement('div');e.setAttribute(name,'');out.booleanNames.push([name,e.outerHTML]);}
    out.booleanValues=[];for(const value of ['','false','disabled']){const e=document.createElement('input');e.setAttribute('disabled',value);out.booleanValues.push([value,e.outerHTML]);}
    out.doctypeNodes=[];for(const markup of ['<!DOCTYPE html>','<!DOCTYPE html PUBLIC "pub" "sys">'])out.doctypeNodes.push(capture(()=>{const d=new DOMParser().parseFromString(markup,'text/html');return new XMLSerializer().serializeToString(d.doctype)}));
    out.xmlNamespaceData=capture(()=>{const d=new DOMParser().parseFromString('<p:root xmlns:p="urn:p" p:a="x"/>','application/xml'),e=d.documentElement;return{namespace:e.namespaceURI,prefix:e.prefix,tag:e.tagName,attributes:Array.from(e.attributes,a=>({name:a.name,value:a.value,namespace:a.namespaceURI,prefix:a.prefix}))}});
    out.foreignRaw=capture(()=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),script=document.createElementNS('http://www.w3.org/2000/svg','script');svg.setAttribute('disabled','');script.textContent='<x>&';svg.append(script);return{html:svg.outerHTML,xml:new XMLSerializer().serializeToString(svg)}});
    return out;
  })()`},sessionId);
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
  server=createServer((_request,response)=>{response.setHeader('content-type','text/html');response.end('<!doctype html><input disabled><a title="&lt;tag&gt;&quot;&amp;&nbsp;">x &amp;</a>')});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`http://127.0.0.1:${server.address().port}/`;
  let cli;
  try{const r=await promisify(execFile)(binary,['fetch','--dump','html',url],{timeout:8000,maxBuffer:1024*1024});cli={stdout:r.stdout,stderr:r.stderr};}
  catch(error){cli={error:error.message,code:error.code,stdout:error.stdout,stderr:error.stderr};}
  const report={binary,sha256:createHash('sha256').update(await readFile(binary)).digest('hex'),observations:result.result.value,cli};
  const json=JSON.stringify(report,null,2)+'\n';if(process.argv[3])await writeFile(process.argv[3],json,{flag:'wx'});console.log(json);
}finally{await client?.close();await owned.close();if(server)await new Promise(resolve=>server.close(resolve));}
