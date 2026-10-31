(async()=>{const rows=[],run=async(name,fn)=>{try{const v=await fn();rows.push({name,value:v===undefined?'undefined':v})}catch(e){rows.push({name,error:{name:e.name,message:e.message}})}};
for(const [name,args]of[['normal',[3,2]],['zero',[0,2]]])await run(name,()=>{const c=new OffscreenCanvas(...args),b=c.transferToImageBitmap(),result={brand:b instanceof ImageBitmap,width:b.width,height:b.height,tag:Object.prototype.toString.call(b),canvasWidth:c.width,canvasHeight:c.height,props:Reflect.ownKeys(ImageBitmap.prototype).map(String)};b.close();return{...result,closedWidth:b.width,closedHeight:b.height}});
await run('construct',()=>new ImageBitmap());await run('clone',()=>structuredClone(new OffscreenCanvas(3,2).transferToImageBitmap()));
await run('transfer',()=>{const b=new OffscreenCanvas(3,2).transferToImageBitmap(),c=structuredClone(b,{transfer:[b]});return{old:b.width,new:c.width}});
await run('crossContexts',()=>{const main=document.createElement('canvas').getContext('2d'),off=new OffscreenCanvas(2,2).getContext('2d');let a,b;try{CanvasRenderingContext2D.prototype.measureText.call(off,'a');a='ok'}catch(e){a=e.name}try{OffscreenCanvasRenderingContext2D.prototype.measureText.call(main,'a');b='ok'}catch(e){b=e.name}return{a,b}});
await run('numericConstructor',()=>new OffscreenCanvas(Symbol('2'),2));
return rows})()
