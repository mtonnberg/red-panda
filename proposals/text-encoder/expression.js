(() => {
 const encoder=new TextEncoder(),method=TextEncoder.prototype.encodeInto,rows=[];
 const trial=(name,receiver,args)=>{try{const value=Reflect.apply(method,receiver,args);rows.push({name,result:{read:value.read,written:value.written,realm:Object.getPrototypeOf(value)===Object.prototype}})}catch(error){rows.push({name,error:error.name,message:error.message,realm:error instanceof TypeError})}};
 let conversions=0;const source={toString(){conversions++;return '€'}};
 trial('missing',encoder,[]);trial('oneArgument',encoder,[source]);
 const missingConversions=conversions;
 trial('invalidDestinationAfterConversion',encoder,[source,new Int8Array(4)]);
 const invalidConversions=conversions;
 trial('invalidReceiverBeforeConversion',{},[source,new Uint8Array(4)]);
 const receiverConversions=conversions;
 const destination=new Uint8Array(5).fill(255);trial('actualBytes',encoder,['a€',destination]);
 const buffer=new ArrayBuffer(4),view=new Uint8Array(buffer);trial('detachDuringConversion',encoder,[{toString(){buffer.transfer();return 'abc'}},view]);
 trial('symbolBeforeDestination',encoder,[Symbol('source'),new Int8Array(1)]);
 return {name:method.name,length:method.length,ownPrototype:Object.hasOwn(method,'prototype'),rows,missingConversions,invalidConversions,receiverConversions,bytes:Array.from(destination)};
})()
