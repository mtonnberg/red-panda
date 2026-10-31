// Exact same normal authored DOM program for isolated r3 and r4 processes.
export const normalProgram=`(()=>{
 const rows=[],snap=e=>({phase:e.eventPhase,current:e.currentTarget?.id??null,target:e.target?.id??null,path:e.composedPath().map(n=>n.id??n.nodeName??'Window'),sameWindowEvent:window.event===e,cancel:e.cancelBubble,defaultPrevented:e.defaultPrevented});
 for(const mode of ['light','open','closed']){
  const host=document.createElement('section');host.id='host-'+mode;document.body.append(host);const root=mode==='light'?host:host.attachShadow({mode}),target=document.createElement('div');target.id='target-'+mode;root.append(target);const seen=[];
  const event=new Event('normal',{bubbles:true,cancelable:true,composed:true});
  target.addEventListener('normal',e=>{seen.push(['target',snap(e)]);e.preventDefault()});host.addEventListener('normal',e=>seen.push(['host',snap(e)]));
  const result=target.dispatchEvent(event);rows.push({mode,result,seen,after:snap(event),eventUndefined:window.event===undefined});host.remove();
 }
 const target=document.createElement('div');target.id='outer';document.body.append(target);const outer=new Event('outer',{bubbles:true}),inner=new Event('inner',{bubbles:true}),seen=[];
 target.addEventListener('outer',()=>{seen.push(['before',window.event===outer]);target.dispatchEvent(inner);seen.push(['after',window.event===outer])});target.addEventListener('inner',e=>seen.push(['inner',window.event===e]));target.dispatchEvent(outer);rows.push({nested:seen,outer:snap(outer),inner:snap(inner),eventUndefined:window.event===undefined});
 window.event='authored-shadow';const shadow=new Event('shadowed',{bubbles:true});target.addEventListener('shadowed',()=>seen.push(['replaceable',window.event]));target.dispatchEvent(shadow);rows.push({replaceableEvent:window.event,seen:seen.at(-1)});
 let gets=0,sets=0,held;Object.defineProperty(window,'_currentEvent',{get(){gets++;return held},set(v){sets++;held=v},configurable:true});const counted=new Event('counted');target.addEventListener('counted',()=>{});target.dispatchEvent(counted);rows.push({outsideCohortPrivateAccessor:{gets,sets,event:snap(counted)}});
 return rows;
})()`;
