(() => {
  const rows=[];
  const run=(name,fn)=>{try{rows.push({name,value:fn()})}catch(e){rows.push({name,error:{name:e.name,message:e.message}})}};
  const types=['EncodedAudioChunk','EncodedVideoChunk'];
  run('availability',()=>Object.fromEntries(['VideoColorSpace',...types,'SharedArrayBuffer'].map(k=>[k,typeof globalThis[k]])));
  run('colors',()=>({length:VideoColorSpace.length,keys:Reflect.ownKeys(VideoColorSpace.prototype).map(String),value:new VideoColorSpace().toJSON(),realm:Object.getPrototypeOf(new VideoColorSpace().toJSON())===Object.prototype}));
  for(const init of [null,undefined,1,true,'value',{primaries:null,transfer:undefined,matrix:null,fullRange:null},{fullRange:0},{fullRange:'false'}])run('color-init:'+String(init),()=>new VideoColorSpace(init).toJSON());
  for(const [member,values]of Object.entries({primaries:['bt709','bt470m','bt470bg','smpte170m','smpte240m','film','bt2020','smpte428','smpte431','smpte432','jedec-p22','ebu3213'],transfer:['bt709','smpte170m','iec61966-2-1','linear','pq','hlg','bt2020-10','bt2020-12','smpte240m','log','log-sqrt','iec61966-2-4','bt1361','smpte428'],matrix:['rgb','bt709','bt470bg','smpte170m','bt2020-ncl','bt2020-cl','smpte240m','fcc','ycgco','ictcp']}))for(const value of values)run('color:'+member+':'+value,()=>new VideoColorSpace({[member]:value})[member]);
  run('color-order',()=>{const order=[];new VideoColorSpace(new Proxy({fullRange:true,matrix:'rgb',primaries:'bt709',transfer:'linear'},{get(t,k){order.push(String(k));return t[k]}}));return order});
  run('color-brand',()=>VideoColorSpace.prototype.toJSON.call({}));
  run('color-clone',()=>{const copy=structuredClone(new VideoColorSpace({matrix:'rgb'}));return{instance:copy instanceof VideoColorSpace,json:JSON.stringify(copy),keys:Object.keys(copy)}});
  for(const name of types){const C=globalThis[name];
    run(name+':shape',()=>({length:C.length,keys:Reflect.ownKeys(C.prototype).map(String),copyToLength:C.prototype.copyTo.length,tag:Object.prototype.toString.call(new C({data:new Uint8Array([1]),timestamp:0,type:'key'}))}));
    for(const [label,init]of [['missing',undefined],['null',null],['primitive',1],['data-missing',{timestamp:0,type:'key'}],['ts-missing',{data:new Uint8Array(1),type:'key'}],['type-missing',{data:new Uint8Array(1),timestamp:0}],['data-string',{data:'abc',timestamp:0,type:'key'}],['duration-null',{data:new Uint8Array(1),duration:null,timestamp:0,type:'key'}]])run(name+':'+label,()=>{const c=new C(init);return[c.type,c.timestamp,c.duration,c.byteLength]});
    for(const value of [-1,-0.5,0.5,NaN,Infinity,-Infinity,2**53,2**63,2**64,'17',null,1n,Symbol('x')])for(const field of['timestamp','duration'])run(name+':'+field+':'+String(value),()=>new C({data:new Uint8Array(1),timestamp:0,type:'key',[field]:value})[field]);
    run(name+':order',()=>{const order=[];new C(new Proxy({data:new Uint8Array([1]),duration:2,timestamp:3,transfer:[],type:'key'},{get(t,k){order.push(String(k));return t[k]}}));return order});
    run(name+':immutable-bytes',()=>{const source=new Uint8Array([0,7,8,0]);const c=new C({data:source.subarray(1,3),timestamp:0,type:'delta'});source.fill(9);const dest=new Uint8Array([0,0,0,0]);c.copyTo(new DataView(dest.buffer,1,2));return [...dest]});
    run(name+':detached-getter',()=>{const data=new Uint8Array([1,2,3]);const c=new C({data,get timestamp(){data.buffer.transfer(0);return 0},type:'key'});return c.byteLength});
    run(name+':detached-input',()=>{const data=new ArrayBuffer(3);data.transfer(0);return new C({data,timestamp:0,type:'key'}).byteLength});
    for(const transfer of ['duplicate','detached','foreign','not-buffer','shared'])run(name+':transfer:'+transfer,()=>{const data=new Uint8Array([1,2]).buffer;const other=new ArrayBuffer(2);let list;if(transfer==='duplicate')list=[data,data];if(transfer==='detached'){other.transfer(0);list=[other]}if(transfer==='foreign')list=[other];if(transfer==='not-buffer')list=[new Uint8Array(1)];if(transfer==='shared')list=[new SharedArrayBuffer(2)];try{const c=new C({data,timestamp:0,type:'key',transfer:list});return{length:c.byteLength,dataDetached:data.detached,otherDetached:other.detached}}catch(e){return{error:e.name,message:e.message,dataDetached:data.detached,otherDetached:other.detached}}});
    run(name+':brand',()=>C.prototype.copyTo.call({},new Uint8Array(1)));
    run(name+':destination-small',()=>new C({data:new Uint8Array(2),timestamp:0,type:'key'}).copyTo(new Uint8Array(1)));
    run(name+':destination-detached',()=>{const b=new ArrayBuffer(2);b.transfer(0);return new C({data:new Uint8Array(1),timestamp:0,type:'key'}).copyTo(b)});
    run(name+':clone',()=>{const c=new C({data:new Uint8Array([4,5]),timestamp:-10,duration:5,type:'delta'});const copy=structuredClone({first:c,again:c});const bytes=new Uint8Array(2);copy.first.copyTo(bytes);return{same:copy.first===copy.again,instance:copy.first instanceof C,bytes:[...bytes],type:copy.first.type,timestamp:copy.first.timestamp,duration:copy.first.duration}});
  }
  return rows;
})()
