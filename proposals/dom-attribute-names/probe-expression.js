(()=>{
 const error=e=>({name:e.name,code:e.code,type:Object.prototype.toString.call(e),dom:e instanceof DOMException,typeError:e instanceof TypeError});
 const attr=a=>a?{name:a.name,localName:a.localName,prefix:a.prefix,namespaceURI:a.namespaceURI,value:a.value}:null;
 const run=fn=>{try{return{value:fn()}}catch(e){return{error:error(e)}}};
 const names=['0abc','123','-invalid','.foo','my@attr','attr!','~','<x','::x','a\vb','é','','my attr','a\tb','a\nb','a\fb','a\rb','a\0b','a=b','a/b','a>b','a"b',"a'b",'a`b','a\\b','a\u0001b','a\u0008b','a\u001fb','a\u007fb','a\u0085b','a\u00a0b','a\u2028b','a\u2029b','a\ud800b','a\uffffb','a\udbff\udfffb','ABC','xml:lang','xlink:href','xmlns','xmlns:p','p:a','a:b:c',':a','a:'];
 const docs=[['html',document],['xml',new DOMParser().parseFromString('<root/>','application/xml')]];
 const basic=[];
 for(const[kind,doc]of docs)for(const name of names){
  const element=doc.createElement('test');
  basic.push({kind,name,set:run(()=>{element.setAttribute(name,'v');return{attr:attr(element.getAttributeNode(name)),value:element.getAttribute(name),serialized:element.outerHTML}}),toggle:run(()=>{const e=doc.createElement('test');const result=e.toggleAttribute(name);return{result,attr:attr(e.attributes[0])}}),create:run(()=>attr(doc.createAttribute(name)))});
 }
 const namespaces=[null,'','urn:test','http://www.w3.org/1999/xlink','http://www.w3.org/XML/1998/namespace','http://www.w3.org/2000/xmlns/'];
 const qnames=['name','0abc','a b','a\0b','<x','a"b','a\vb','é','p:a','p:0abc','p:<x','p:a b','p:a\0b','p:a"b','xml:lang','XML:lang','xmlns','xmlns:p',':a','a:','a:b:c'];
 const qualified=[];
 for(const[kind,doc]of docs)for(const ns of namespaces)for(const name of qnames){const e=doc.createElement('test');qualified.push({kind,ns,name,set:run(()=>{e.setAttributeNS(ns,name,'v');return{attr:attr(e.attributes[0]),nullLookup:e.getAttributeNS(null,name),byNamespace:e.getAttributeNS(ns,name.split(':').at(-1)),serialized:e.outerHTML}}),create:run(()=>attr(doc.createAttributeNS(ns,name)))});}
 const lookups=[];
 for(const kind of ['html','xml']){const doc=docs.find(x=>x[0]===kind)[1];for(const name of ['xlink:href','xml:lang','xmlns:p','p:a','p:a:b']){const e=doc.createElement('test');e.setAttribute(name,'v');lookups.push({kind,name,attribute:attr(e.attributes[0]),byName:e.getAttribute(name),gets:namespaces.map(ns=>[ns,e.getAttributeNS(ns,name),e.getAttributeNS(ns,name.split(':').at(-1))]),has:namespaces.map(ns=>[ns,e.hasAttributeNS(ns,name.split(':').at(-1))]),remove:run(()=>{e.removeAttributeNS(name.startsWith('xlink:')?namespaces[3]:name.startsWith('xml:')?namespaces[4]:name.startsWith('xmlns:')?namespaces[5]:null,name.split(':').at(-1));return e.attributes.length})})}}
 const conversions=[];
 for(const[kind,doc]of docs)for(const op of ['setAttribute','toggleAttribute','createAttribute','setAttributeNS','createAttributeNS','removeAttributeNS','getAttributeNS']){
  for(const argsKind of ['missing','symbols','objects','invalid-and-value','throwing-name','throwing-value']){
   const trace=[],e=doc.createElement('test'),o=(label,value,fail=false)=>({toString(){trace.push(label);if(fail)throw new Error(label);return value}}),receiver=op.startsWith('create')?doc:e;
   let args=argsKind==='missing'?[]:argsKind==='symbols'?[Symbol('n'),Symbol('q'),Symbol('v')]:op.endsWith('NS')?[o('namespace','urn:test'),o('name',argsKind==='invalid-and-value'?'a b':'p:a',argsKind==='throwing-name'),o('value','v',argsKind==='throwing-value')]:[o('name',argsKind==='invalid-and-value'?'a b':'name',argsKind==='throwing-name'),o('value','v',argsKind==='throwing-value')];
   const result=run(()=>{const r=receiver[op](...args);return r&&r.nodeType===2?attr(r):r??null});conversions.push({kind,op,argsKind,trace,result});
  }
 }
 const mutations=run(()=>{const e=document.createElement('div'),a=document.createAttribute('data-a');a.value='first';e.setAttributeNode(a);e.setAttribute('data-a','second');const kept=a===e.getAttributeNode('data-a');e.removeAttribute('data-a');const detached=a.ownerElement===null&&a.value==='second';e.setAttributeNode(a);const b=document.createAttribute('data-a');b.value='third';const replaced=e.setAttributeNode(b);return{kept,detached,replaced:replaced===a,oldValue:a.value,newValue:b.value,oldDetached:a.ownerElement===null,newOwned:b.ownerElement===e}});
 return JSON.stringify({basic,qualified,lookups,conversions,mutations});
})()
