(async()=>{
 const rows=[],run=async(name,fn)=>{try{rows.push({name,value:await fn()})}catch(e){rows.push({name,error:{name:e.name,message:e.message}})}};
 const types=['AudioDecoder','VideoDecoder','AudioEncoder','VideoEncoder'];
 const base=name=>name.startsWith('Audio')?{codec:'opus',sampleRate:48000,numberOfChannels:2}:name==='VideoEncoder'?{codec:'vp8',width:16,height:16}:{codec:'vp09.00.10.08'};
 for(const name of types){const C=globalThis[name];
  await run(name+':shape',()=>({length:C.length,inherits:Object.getPrototypeOf(C)===EventTarget,prototype:Reflect.ownKeys(C.prototype).map(String),staticLength:C.isConfigSupported.length}));
  for(const [label,init]of[['missing',undefined],['null',null],['number',1],['missing-error',{output(){}}],['missing-output',{error(){}}],['bad-error',{output(){},error:1}]])await run(name+':constructor:'+label,()=>{const c=new C(init);const result=[c.state,c[name.endsWith('Decoder')?'decodeQueueSize':'encodeQueueSize'],c.ondequeue,c instanceof EventTarget];c.close();return result});
  await run(name+':constructor-order',()=>{const order=[],c=new C(new Proxy({output(){},error(){}},{get(o,k){order.push(String(k));return o[k]}}));c.close();return order});
  await run(name+':normal-config',()=>C.isConfigSupported(base(name)));
  await run(name+':unknown-properties',()=>C.isConfigSupported({...base(name),unknown:42}));
  await run(name+':all-properties',()=>C.isConfigSupported({...base(name),description:new Uint8Array([1,2]),bitrate:12000,bitrateMode:'variable',hardwareAcceleration:'prefer-software',optimizeForLatency:true,latencyMode:'realtime',alpha:'keep',displayWidth:32,displayHeight:24,displayAspectWidth:4,displayAspectHeight:3,framerate:30,scalabilityMode:'L1T2',contentHint:'motion',avc:{format:'avc',unknown:1},opus:{complexity:5,frameDuration:20000,format:'opus',packetlossperc:3,signal:'music',usedtx:true,useinbandfec:true,unknown:1},aac:{format:'adts',unknown:1}}));
  await run(name+':config-order',async()=>{const order=[],config=new Proxy(base(name),{get(o,k){order.push(String(k));return o[k]}});const result=await C.isConfigSupported(config);return{order,result}});
  for(const value of[undefined,null,1,'wrong',{},''])await run(name+':config-input:'+String(value),()=>C.isConfigSupported(value));
  for(const codec of['',' ',' opus ','OPUS','unsupported.fake','vp8','avc1.42001E',null,3,Symbol('opus')])await run(name+':codec:'+String(codec),()=>C.isConfigSupported({...base(name),codec}));
  const fields=name.startsWith('Audio')?['sampleRate','numberOfChannels','bitrate']:name==='VideoEncoder'?['width','height','bitrate','framerate']:['codedWidth','codedHeight','displayAspectWidth'];
  for(const field of fields)for(const value of[0,-1,0.5,NaN,Infinity,2**32,'16',null,1n])await run(name+':field:'+field+':'+String(value),()=>C.isConfigSupported({...base(name),[field]:value}));
  if(name==='AudioEncoder')for(const [field,values]of Object.entries({complexity:[0,10,11,-1,0.5],frameDuration:[2500,5000,20000,120000,2501],format:['opus','ogg','bad'],packetlossperc:[0,100,101,-1],signal:['auto','music','voice','bad'],usedtx:[false,true,1],useinbandfec:[false,true]}))for(const value of values)await run(name+':opus:'+field+':'+String(value),()=>C.isConfigSupported({...base(name),opus:{[field]:value}}));
  if(name==='VideoEncoder')for(const [field,values]of Object.entries({hardwareAcceleration:['no-preference','prefer-hardware','bad'],latencyMode:['quality','realtime','bad'],alpha:['keep','discard','bad'],bitrateMode:['constant','variable','quantizer','bad']}))for(const value of values)await run(name+':enum:'+field+':'+value,()=>C.isConfigSupported({...base(name),[field]:value}));
  await run(name+':configure-invalid-state',()=>{const errors=[],c=new C({output(){},error(){}});c.close();for(const config of[{},base(name)])try{c.configure(config)}catch(e){errors.push([e.name,e.message])}return errors});
 }
 return rows;
})()
