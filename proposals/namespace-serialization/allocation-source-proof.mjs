import'jsdom';import{createRequire}from'node:module';import{readFile,readdir,writeFile}from'node:fs/promises';import{dirname,join,basename}from'node:path';import{createHash}from'node:crypto';import assert from'node:assert/strict';
const require=createRequire(import.meta.url),interfaces=require('jsdom/lib/jsdom/living/interfaces.js'),Node=require('jsdom/lib/jsdom/living/nodes/Node-impl.js').implementation,Event=require('jsdom/lib/jsdom/living/events/Event-impl.js').implementation,EventTarget=require('jsdom/lib/jsdom/living/events/EventTarget-impl.js').implementation,dir=dirname(require.resolve('jsdom/lib/jsdom/living/generated/utils.js')),sha=s=>createHash('sha256').update(s).digest('hex'),entries=[];
for(const file of(await readdir(dir)).sort()){
 if(!file.endsWith('.js')||file==='utils.js')continue;const full=join(dir,file),factory=require(full),kind=basename(file,'.js');if(typeof factory.setup!=='function'||interfaces.getInterfaceWrapper(kind)!==factory)continue;
 let implementation;for(const folder of['Attr','NamedNodeMap'].includes(kind)?['attributes']:['nodes','events']){try{implementation=require('jsdom/lib/jsdom/living/'+folder+'/'+kind+'-impl.js').implementation;break}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e}}if(!implementation)continue;
 const node=implementation===Node||implementation.prototype instanceof Node,event=implementation===Event||implementation.prototype instanceof Event;
 if(!['HTMLOptionsCollection','HTMLFormControlsCollection','NamedNodeMap'].includes(kind)&&!node&&!event&&implementation!==EventTarget)continue;entries.push({kind,sourceSHA256:sha(await readFile(full))});
}
const fingerprint=values=>sha(values.map(x=>x.kind+'\0'+x.sourceSHA256).join('\n')),oldFingerprint=fingerprint(entries.filter(x=>x.kind!=='NamedNodeMap')),newFingerprint=fingerprint(entries);
assert.equal(oldFingerprint,'868d8b79e5309539b7018606ffa46ffd40b56f6295878521854592092211fc1c');assert.equal(newFingerprint,'f199523c2fb0570868c2e3aa84c9fd7b380687298db9b52f1d5531a3f561ae8f');
await writeFile(process.argv[2],JSON.stringify({oldFingerprint,newFingerprint,addedKinds:['NamedNodeMap'],entries},null,2)+'\n',{flag:'wx'});
