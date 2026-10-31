(()=>{const rows=[],run=(name,fn)=>{try{rows.push({name,value:fn()})}catch(e){rows.push({name,error:{name:e.name,message:e.message}})}};
for(const C of[EncodedAudioChunk,EncodedVideoChunk]){
 const name=C.name,make=data=>new C({data,timestamp:0,type:'key'});
 run(name+':data-shared',()=>{const b=new SharedArrayBuffer(2),c=make(b);new Uint8Array(b)[0]=9;const d=new Uint8Array(2);c.copyTo(d);return [...d]});
 run(name+':copy-shared',()=>{const d=new SharedArrayBuffer(2);make(new Uint8Array([3,4])).copyTo(d);return [...new Uint8Array(d)]});
 run(name+':copy-missing',()=>make(new Uint8Array(1)).copyTo());
 run(name+':copy-null',()=>make(new Uint8Array(1)).copyTo(null));
 run(name+':copy-zero-detached',()=>{const b=new ArrayBuffer(1);b.transfer(0);return make(new ArrayBuffer(0)).copyTo(b)??'undefined'});
 run(name+':data-detached-view',()=>{const b=new ArrayBuffer(2),v=new DataView(b);b.transfer(0);return make(v).byteLength});
 run(name+':copy-detached-view',()=>{const b=new ArrayBuffer(2),v=new DataView(b);b.transfer(0);return make(new Uint8Array(1)).copyTo(v)});
 run(name+':copy-zero-detached-view',()=>{const b=new ArrayBuffer(2),v=new DataView(b);b.transfer(0);return make(new Uint8Array()).copyTo(v)??'undefined'});
 run(name+':receiver-other',()=>{const other=new (C===EncodedAudioChunk?EncodedVideoChunk:EncodedAudioChunk)({data:new Uint8Array([3]),timestamp:0,type:'key'});const dest=new Uint8Array(1);C.prototype.copyTo.call(other,dest);return [...dest]});
 run(name+':receiver-getter-other',()=>Object.getOwnPropertyDescriptor(C.prototype,'type').get.call(new (C===EncodedAudioChunk?EncodedVideoChunk:EncodedAudioChunk)({data:new Uint8Array([3]),timestamp:0,type:'key'})));
 run(name+':clone-forgery',()=>{const c=make(new Uint8Array([2]));const fake=Object.create(Object.getPrototypeOf(c));const copy=structuredClone(fake);return {tag:Object.prototype.toString.call(copy),keys:Object.keys(copy)}});
 run(name+':type-symbol',()=>new C({data:new Uint8Array(),timestamp:0,type:Symbol('key')}));
 run(name+':transfer-null',()=>new C({data:new Uint8Array(),timestamp:0,type:'key',transfer:null}));
 run(name+':transfer-invalid-order',()=>{const order=[];try{new C({data:new Uint8Array(),timestamp:0,get transfer(){order.push('transfer');return[new Uint8Array()]},get type(){order.push('type');return'key'}})}catch(e){return {order,error:e.name,message:e.message}}});
 run(name+':type-after-transfer-throw',()=>{const b=new ArrayBuffer(2);try{new C({data:b,timestamp:0,transfer:[b],get type(){throw Error('author')}})}catch(e){return {error:e.name,message:e.message,detached:b.detached}}});
 run(name+':safe-max',()=>{const c=new C({data:new Uint8Array(),timestamp:Number.MAX_SAFE_INTEGER,duration:Number.MAX_SAFE_INTEGER,type:'key'});return[c.timestamp,c.duration]});
}
run('color-symbol',()=>new VideoColorSpace({matrix:Symbol('rgb')}));
run('color-conversion-order',()=>{const order=[];try{new VideoColorSpace({get matrix(){order.push('matrix');return'bad'},get primaries(){order.push('primaries');return'bt709'}})}catch(e){return{order,error:e.name,message:e.message}}});
return rows})()
