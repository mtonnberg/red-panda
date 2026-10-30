import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const binary=process.argv[2]??'/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux';
const browser=await startReference(binary);let client;
try {
  client=await connect(browser.endpoint);const {targetId}=await client.send('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await client.send('Target.attachToTarget',{targetId,flatten:true});
  await client.send('Page.navigate',{url:'data:text/html,<body></body>'},sessionId);
  const result=await client.send('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression:`(()=>{
    const out={},capture=fn=>{try{return fn()}catch(e){return{error:e.name,message:e.message}}};
    const range=(attrs,value)=>{const x=document.createElement('input');x.type='range';for(const[k,v]of Object.entries(attrs))x.setAttribute(k,v);if(value!==undefined)x.value=value;return x};
    out.rangeValues=[];for(const[attrs,value]of[[{min:'.5',max:'1.5'},'1'],[{min:'0',max:'10',step:'4'},'10'],[{min:'-10',max:'10',step:'5'},'-2.5'],[{max:'10',value:'3.5'},'5.3'],[{min:'0',max:'100',step:'7'},'garbage'],[{min:'0',max:'10'},'4.0'],[{min:'0',max:'10'},'1e1'],[{min:'0',max:'10',step:'ANY'},'3.7'],[{min:'8',max:'2'},'0']])out.rangeValues.push({attrs,value,result:range(attrs,value).value});
    out.parsedRanges=[];for(const markup of ['<input type=range min=0 max=11>','<input max=11 min=0 type=range>','<input type=range min=0 max=10 step=3>','<input type=range min=20 max=40>']){const box=document.createElement('div');box.innerHTML=markup;out.parsedRanges.push([markup,box.firstChild.value])}
    {const x=range({});out.bounds=[x.value];x.max='20';out.bounds.push(x.value);x.min='10';out.bounds.push(x.value);x.step='7';out.bounds.push(x.value);}
    out.steps=[];for(const method of ['stepUp','stepDown'])for(const n of [-2,0,1,3,5])for(const value of ['2.5','2.7']){const x=document.createElement('input');x.type='number';x.step='.5';x.value=value;out.steps.push({method,n,value,result:capture(()=>{x[method](n);return x.value})})}
    out.serial=[];for(const type of ['time','datetime-local'])for(const millis of [5000,5010,5100,5250,5500]){const x=document.createElement('input');x.type=type;x.valueAsNumber=(type==='time'?0:Date.UTC(2024,2,10,13,45))+millis;out.serial.push({type,millis,value:x.value});}
    out.authoredTimes=[];for(const type of ['time','datetime-local'])for(const suffix of ['05.000','05.0','05.010','05.100','05.250']){const x=document.createElement('input');x.type=type;x.value=(type==='time'?'': '2024-03-10T')+'13:45:'+suffix;out.authoredTimes.push([type,suffix,x.value]);}
    {const box=document.createElement('div');box.innerHTML='<input id=a type=radio name=g checked><input id=b type=radio name=g>';document.body.append(box);const[a,b]=box.children,log=[];b.onclick=e=>{log.push([a.checked,b.checked]);e.preventDefault()};b.click();out.cancelRadio={during:log,after:[a.checked,b.checked]};box.remove();}
    {const box=document.createElement('div');box.innerHTML='<label for=x id=l>X</label><input id=x>';const[label,input]=box.children,held=input.labels;out.labels={detached:Array.from(held,l=>l.id),detachedControl:label.control?.id??null,sameList:held===input.labels};document.body.append(box);out.labels.attachedHeld=Array.from(held,l=>l.id);out.labels.attachedFresh=Array.from(input.labels,l=>l.id);box.remove();out.labels.removedHeld=Array.from(held,l=>l.id);}
    {const box=document.createElement('div');box.innerHTML='<label for=y id=first>Y</label><input id=y>';document.body.append(box);const[label,input]=box.children,held=input.labels,second=document.createElement('label');second.htmlFor='y';second.id='second';box.append(second);out.attachedLabels={nodeList:held instanceof NodeList,array:Array.isArray(held),arrayRealm:held instanceof Array,constructor:held.constructor?.name,tag:Object.prototype.toString.call(held),item:typeof held.item,sameList:held===input.labels,heldAfterInsert:Array.from(held,l=>l.id),freshAfterInsert:Array.from(input.labels,l=>l.id)};label.remove();out.attachedLabels.heldAfterRemove=Array.from(held,l=>l.id);out.attachedLabels.freshAfterRemove=Array.from(input.labels,l=>l.id);box.remove();}
    out.dirtyValues=[];for(const kind of ['number','date','step']){const x=document.createElement('input');x.type=kind==='date'?'date':'number';x.setAttribute('value',kind==='date'?'2024-01-01':'1');if(kind==='step')x.stepUp();else x.valueAsNumber=kind==='date'?Date.UTC(2024,1,1):2;x.setAttribute('value',kind==='date'?'2024-03-01':'4');out.dirtyValues.push([kind,x.value]);}
    out.option={name:Option.name,length:Option.length,call:capture(()=>Option().localName),proto:Object.getOwnPropertyDescriptor(Option,'prototype').writable};
    return out;
  })()`},sessionId);
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
  const report={binary,sha256:createHash('sha256').update(await readFile(binary)).digest('hex'),observations:result.result.value};
  const json=JSON.stringify(report,null,2)+'\n';if(process.argv[3])await writeFile(process.argv[3],json,{flag:'wx'});console.log(json);
}finally{await client?.close();await browser.close();}
