(async()=>{
 const rows=[],capture=(name,value)=>rows.push([name,value]);
 const view=i=>({src:i.getAttribute('src'),currentSrc:i.currentSrc,complete:i.complete,naturalWidth:i.naturalWidth,naturalHeight:i.naturalHeight,width:i.width,height:i.height});
 const settle=i=>new Promise(resolve=>{i.addEventListener('load',e=>resolve({type:e.type,trusted:e.isTrusted,state:view(i)}),{once:true});i.addEventListener('error',e=>resolve({type:e.type,trusted:e.isTrusted,state:view(i)}),{once:true})});
 const delay=ms=>new Promise(r=>setTimeout(r,ms));
 const i=new Image();capture('initial',view(i));let p=settle(i);i.src='/red-panda-image.png';capture('during',view(i));capture('settled',await p);capture('decode',await i.decode().then(()=>['resolved'],e=>[e.name,e.message]));
 p=settle(i);i.src='/red-panda-image.png?again';capture('replacement-during',view(i));capture('replacement-settled',await p);
 p=settle(i);i.src='/missing.png';capture('failed-replacement-during',view(i));capture('failed-replacement',await p);
 const no=new Image();capture('decode-no-source',await no.decode().then(()=>['resolved'],e=>[e.name,e.message]));
 p=settle(no);no.src='';capture('empty-during',view(no));capture('empty-settled',await p);
 const multi=new Image(),events=[];multi.addEventListener('load',()=>events.push(['load',multi.currentSrc]));multi.addEventListener('error',()=>events.push(['error',multi.currentSrc]));multi.src='/first.png';multi.src='/last.png';multi.removeAttribute('src');multi.src='/red-panda-image.png?multi';capture('superseded-during',view(multi));await delay(80);capture('superseded-events',events);
 const data=new Image();p=settle(data);data.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';const decode=data.decode().then(()=>['resolved'],e=>[e.name,e.message]);capture('data-settled',await p);capture('data-decode',await decode);capture('data-dimensions',view(data));
 const remove=new Image();remove.src='/red-panda-image.png?remove';const reject=remove.decode().then(()=>['resolved'],e=>[e.name,e.message]);remove.removeAttribute('src');capture('remove-decode',await reject);capture('remove-state',view(remove));
 const select=new Image();select.src='/base.png';select.srcset='/half.png 0.5x, /double.png 2x';capture('srcset-during',view(select));await settle(select);capture('srcset-after',view(select));
 const inert=document.implementation.createHTMLDocument('inert'),adopt=inert.createElement('img');let seen=0;adopt.onload=()=>seen++;adopt.onerror=()=>seen++;adopt.src='/red-panda-image.png?adopt';await delay(40);capture('inert-before',[seen,view(adopt)]);document.body.append(adopt);await delay(80);capture('inert-after',[seen,view(adopt)]);
 capture('extra-properties',Object.fromEntries(['loading','decoding','fetchPriority','referrerPolicy'].map(k=>[k,[typeof new Image()[k],new Image()[k]??null]])));
 return JSON.stringify(rows)
})()
