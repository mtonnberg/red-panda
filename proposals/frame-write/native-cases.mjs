const script = source => `<script>${source.replaceAll('</script','<\\/script')}</script>`;
export const parserResetCases = [
 {name:'fresh-blank-text-script-and-realm',html:'<!doctype html><body>'+script(`
   const frame=document.createElement('iframe');document.body.append(frame);const child=frame.contentWindow,doc=frame.contentDocument;
   const initial=doc.readyState;doc.write('WRITE HAPPENED');const first=doc.body.innerHTML;doc.write(' AGAIN');
   doc.write('<script>window.ranHere=true;window.parentSelf=parent===self;</scr'+'ipt>');
   const beforeClose={state:doc.readyState,ran:child.ranHere===true,text:doc.body.textContent};doc.close();
   setTimeout(()=>window.probeResult={initial,first,beforeClose,after:{state:doc.readyState,ran:child.ranHere===true,parentSelf:child.parentSelf,
     sameWindow:frame.contentWindow===child,sameDocument:frame.contentDocument===doc,parentRan:window.ranHere===true}},20);
 `),routes:{}},
 {name:'fresh-blank-lifecycle-after-write',html:'<!doctype html><body>'+script(`
   const frame=document.createElement('iframe');window.frameLoads=0;frame.onload=()=>frameLoads++;document.body.append(frame);const child=frame.contentWindow,doc=frame.contentDocument;
   window.events=[];doc.write('<p>fresh</p>');child.addEventListener('load',event=>events.push({type:'load',trusted:event.isTrusted,state:doc.readyState}));
   doc.addEventListener('DOMContentLoaded',event=>events.push({type:event.type,trusted:event.isTrusted,state:doc.readyState}));
   const beforeClose=doc.readyState;doc.close();setTimeout(()=>window.probeResult={beforeClose,state:doc.readyState,frameLoads,events},20);
 `),routes:{}},
 {name:'fresh-blank-module-close',html:'<!doctype html><body>'+script(`
   const frame=document.createElement('iframe');document.body.append(frame);const child=frame.contentWindow,doc=frame.contentDocument;
   doc.write('<script type="module">window.moduleRan=parent!==window;</scr'+'ipt>');const beforeClose={state:doc.readyState,ran:child.moduleRan===true};
   doc.close();setTimeout(()=>window.probeResult={beforeClose,after:{state:doc.readyState,ran:child.moduleRan===true,sameWindow:frame.contentWindow===child,sameDocument:frame.contentDocument===doc}},20);
 `),routes:{}},
];
