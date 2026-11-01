const script=source=>`<script>${source.replaceAll('</script','<\\/script')}</script>`;
export const parserResetCases=[
 {name:'inactive-document-markup-operations',html:'<!doctype html><body>'+script(`
  const frame=document.createElement('iframe');let oldDoc,innerDoc,oldBody,innerBody,oldIframe,before,innerBefore;
  frame.onload=()=>{const doc=frame.contentDocument;if(doc.URL.endsWith('/old.html')){
    oldDoc=doc;innerDoc=doc.querySelector('iframe').contentDocument;oldBody=doc.body;innerBody=innerDoc.body;oldIframe=doc.querySelector('iframe');before=oldBody.innerHTML;innerBefore=innerBody.innerHTML;frame.src='/new.html';
  }else if(doc.URL.endsWith('/new.html')){
    const result={beforeWrite:{body:oldDoc.body.innerHTML,inner:innerDoc.body.innerHTML,sameBody:oldDoc.body===oldBody,sameIframe:oldDoc.body.lastChild===oldIframe}};
    oldDoc.write('<p id="bad">bad</p>');innerDoc.write('<p>bad inner</p>');
    result.afterWrite={bodyEqual:oldDoc.body.innerHTML===before,innerEqual:innerDoc.body.innerHTML===innerBefore,sameBody:oldDoc.body===oldBody,sameIframe:oldDoc.body.lastChild===oldIframe};
    try{result.openSame=oldDoc.open()===oldDoc;}catch(error){result.openError=error.name;}
    result.afterOpen={bodyEqual:oldDoc.body?.innerHTML===before,sameBody:oldDoc.body===oldBody};
    try{oldDoc.close();result.closeState=oldDoc.readyState;}catch(error){result.closeError=error.name;}
    result.liveText=doc.getElementById('live').textContent;window.probeResult=result;
  }};frame.src='/old.html';document.body.append(frame);
 `),routes:{'/old.html':{type:'text/html',body:'<!doctype html><body><p id="old">old</p><iframe></iframe>'},'/new.html':{type:'text/html',body:'<!doctype html><body><p id="live">live</p>'}}},
 {name:'network-write-declarative-shadow',html:'<!doctype html><body>'+script(`
  customElements.define('written-ce',class extends HTMLElement{connectedCallback(){this.innerHTML='<template shadowrootmode="open"><p>inert</p></template>';}});
  document.write('<div id="host"><template shadowrootmode="open" shadowrootserializable><p id="inside">shadow</p></template><b>light</b></div><written-ce id="ce"></written-ce>');
  const host=document.getElementById('host'),ce=document.getElementById('ce');
  window.probeResult={shadow:host.shadowRoot!==null,text:host.shadowRoot?.textContent??null,serializable:host.shadowRoot?.serializable??null,
    template:!!host.querySelector('template'),shadowIdInDocument:!!document.getElementById('inside'),ceShadow:ce.shadowRoot!==null,ceTemplate:!!ce.querySelector('template')};
 `),routes:{}},
 {name:'network-written-shadow-script-order',html:'<!doctype html><body>'+script(`
  window.order=[];document.write('<div id="host"><template shadowrootmode="open"><script>order.push({at:"shadow",host:!!document.getElementById("host")});</scr'+'ipt></template></div><script>order.push({at:"following",host:!!document.getElementById("host")});</scr'+'ipt>');
  window.probeResult={order,shadow:!!document.getElementById('host').shadowRoot};
 `),routes:{}},
 {name:'network-nested-write-visibility',html:'<!doctype html><body>'+script(`
  window.order=[];document.write('<script id="nested">order.push({at:"before",inner:!!document.getElementById("inner")});document.write("<b id=inner>inner</b>");order.push({at:"after",inner:!!document.getElementById("inner")});</scr'+'ipt>');
  order.push({at:'outer',inner:!!document.getElementById('inner')});window.probeResult={order};
 `),routes:{}},
];
