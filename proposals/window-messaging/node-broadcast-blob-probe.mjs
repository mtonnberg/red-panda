import {BroadcastChannel} from 'node:worker_threads';
import {Blob,File} from 'node:buffer';
import {setTimeout as delay} from 'node:timers/promises';
import {writeFile} from 'node:fs/promises';
const results=[];
for(const recipients of[0,1,2])for(const kind of['Blob','File']){
 const channels=Array.from({length:recipients+1},()=>new BroadcastChannel(`red-panda-native-blob-${process.pid}-${recipients}-${kind}`)),received=[];
 for(const channel of channels.slice(1))channel.onmessage=async event=>received.push({blob:event.data instanceof Blob,file:event.data instanceof File,name:event.data.name,size:event.data.size,text:await event.data.text()});
 const value=kind==='File'?new File(['actual bytes'],'actual.txt'):new Blob(['actual bytes']);let post;
 try{channels[0].postMessage(value);post={success:true}}catch(error){post={success:false,name:error.name,message:error.message}}
 await delay(20);for(const channel of channels)channel.close();results.push({recipients,kind,post,received});
}
const report={scope:'Actual built-in Node BroadcastChannel Blob/File multi-recipient behavior; not an assertion that future Node versions retain this limitation',node:process.version,v8:process.versions.v8,results};
const json=JSON.stringify(report,null,2)+'\n';if(process.argv[2])await writeFile(process.argv[2],json,{flag:'wx'});console.log(json);
