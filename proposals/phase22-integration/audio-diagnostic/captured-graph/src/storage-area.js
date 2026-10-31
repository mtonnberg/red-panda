// Independent UTF-8 hash storage. Iteration follows the actual open-addressed
// table, including capacity growth and deleted slots; it is not insertion order.
const mask=(1n<<64n)-1n,secrets=[0xa0761d6478bd642fn,0xe7037ed1a0b428dbn,0x8ebc6af09c88c6e3n,0x589965cc75374cc3n];
const mix=(a,b)=>{const product=a*b;return(product&mask)^(product>>64n)};
export function storageHash(key){
 const bytes=Buffer.from(key,'utf8'),length=bytes.length;let seed=mix(secrets[0],secrets[1]),a=0n,b=0n,offset=0,remaining=length;
 const read32=i=>BigInt(bytes.readUInt32LE(i)),read64=i=>bytes.readBigUInt64LE(i);
 if(remaining<=16){if(remaining>=4){const shift=(remaining>>3)<<2;a=(read32(0)<<32n)|read32(shift);b=(read32(remaining-4)<<32n)|read32(remaining-4-shift)}else if(remaining){a=BigInt((bytes[0]<<16)|(bytes[remaining>>1]<<8)|bytes[remaining-1])}}
 else{if(remaining>48){let s1=seed,s2=seed;do{seed=mix(read64(offset)^secrets[1],read64(offset+8)^seed);s1=mix(read64(offset+16)^secrets[2],read64(offset+24)^s1);s2=mix(read64(offset+32)^secrets[3],read64(offset+40)^s2);offset+=48;remaining-=48}while(remaining>48);seed^=s1^s2}
 while(remaining>16){seed=mix(read64(offset)^secrets[1],read64(offset+8)^seed);offset+=16;remaining-=16}a=read64(offset+remaining-16);b=read64(offset+remaining-8)}
 const product=(a^secrets[1])*(b^seed);return mix((product&mask)^secrets[0]^BigInt(length),(product>>64n)^secrets[1]);
}
const deleted=Symbol('deleted');
export class StorageArea{
 constructor(){this.items=new Map();this.slots=[];this.bytes=0}
 find(key){const capacity=this.slots.length;if(!capacity)return-1;let index=Number(storageHash(key)&BigInt(capacity-1));for(let n=0;n<capacity;n++,index=(index+1)&(capacity-1)){const item=this.slots[index];if(item===undefined)return-1;if(item===key)return index}return-1}
 place(key){const capacity=this.slots.length;let index=Number(storageHash(key)&BigInt(capacity-1));while(this.slots[index]!==undefined&&this.slots[index]!==deleted)index=(index+1)&(capacity-1);this.slots[index]=key}
 set(key,value){if(!this.items.has(key)){if(this.items.size+1>Math.floor(this.slots.length*0.8)){const previous=this.slots;this.slots=new Array(previous.length?previous.length*2:8);for(const item of previous)if(item!==undefined&&item!==deleted)this.place(item)}this.place(key)}this.items.set(key,value)}
 remove(key){const index=this.find(key);if(index<0)return;this.slots[index]=deleted;this.items.delete(key)}
 clear(){this.items.clear();this.slots.fill(undefined);this.bytes=0}
 keys(){return this.slots.filter(value=>value!==undefined&&value!==deleted)}
}
