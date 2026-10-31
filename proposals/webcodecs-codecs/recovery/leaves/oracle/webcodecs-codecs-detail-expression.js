(async()=>{
 const rows=[],run=async(name,fn)=>{try{rows.push({name,value:await fn()})}catch(e){rows.push({name,error:{name:e.name,message:e.message}})}};
 const base=name=>name.startsWith('Audio')?{codec:'opus',sampleRate:48000,numberOfChannels:2}:name==='VideoEncoder'?{codec:'vp8',width:16,height:16}:{codec:'vp09.00.10.08'};
 for(const name of['AudioDecoder','VideoDecoder','AudioEncoder','VideoEncoder']){const C=globalThis[name];
  await run(name+':proxy-lookup-order',async()=>{const log=[],p=new Proxy(base(name),{has(o,k){log.push('has:'+String(k));return k in o},get(o,k){log.push('get:'+String(k));return o[k]},ownKeys(o){log.push('ownKeys');return Reflect.ownKeys(o)},getOwnPropertyDescriptor(o,k){log.push('descriptor:'+String(k));return Object.getOwnPropertyDescriptor(o,k)}});await C.isConfigSupported(p);return log});
  await run(name+':inherited-config',()=>C.isConfigSupported(Object.create(base(name))));
  await run(name+':description-bytes',async()=>{const bytes=new Uint8Array([9,1,2,8]),data=bytes.subarray(1,3),p=C.isConfigSupported({...base(name),description:data});bytes.fill(7);const s=await p;return{present:'description'in s.config,tag:Object.prototype.toString.call(s.config.description),same:s.config.description===data,bytes:s.config.description?[...new Uint8Array(s.config.description)]:null}});
  if(name.startsWith('Audio'))for(const value of[1,2,8,9,16,32,255,256,8000,192000,384000,768000,2147483647])for(const field of['numberOfChannels','sampleRate'])await run(name+':audio-bound:'+field+':'+value,()=>C.isConfigSupported({...base(name),[field]:value}));
  if(name==='VideoDecoder')for(const config of[{codedWidth:16,codedHeight:8},{codedWidth:0,codedHeight:8},{displayAspectWidth:4,displayAspectHeight:3},{rotation:90},{rotation:45},{rotation:-90},{flip:true},{colorSpace:{matrix:'rgb'}},{hardwareAcceleration:'bad'}])await run(name+':video-option:'+JSON.stringify(config),()=>C.isConfigSupported({...base(name),...config}));
  await run(name+':configure-errors',()=>{const c=new C({output(){},error(){}}),e=[];for(const config of[undefined,null,{}, {codec:' '}, {...base(name),codec:' '}, {...base(name),bitrate:0}]){try{c.configure(config);e.push('ok');c.reset()}catch(x){e.push([x.name,x.message])}}c.close();return e});
 }
 return rows;
})()
