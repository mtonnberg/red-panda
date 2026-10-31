(async()=>{const rows=[],run=async(name,fn)=>{try{const value=await fn();rows.push({name,value:value===undefined?'undefined':value})}catch(e){rows.push({name,error:{name:e.name,message:e.message}})}};
for(const d of[4294967296,4294967297,-4294967296])await run('delay-'+d,async()=>{const c=new AbortController(),p=scheduler.postTask(()=>7,{signal:c.signal,delay:d});const v=await Promise.race([p.then(value=>({value}),e=>({error:e.name})),new Promise(r=>setTimeout(()=>r({pending:true}),20))]);c.abort();return v});
await run('yieldOutsideOrder',async()=>{const order=[];const p=scheduler.yield().then(()=>order.push('yield'));Promise.resolve().then(()=>order.push('microtask'));await p;return order});
await run('priorityInvalidGetterOrder',async()=>{const trace=[];try{await scheduler.postTask(()=>1,{get priority(){trace.push('priority');return'bad'},get signal(){trace.push('signal');return null}})}catch(e){return{trace,error:e.message}}});
await run('controllerPriorityNull',()=>new TaskController({priority:null}).signal.priority);
await run('eventInitPrimitive',()=>new TaskPriorityChangeEvent('x',3));
await run('signalAbortBrand',()=>{const c=new TaskController();let fake;try{Object.getOwnPropertyDescriptor(TaskSignal.prototype,'priority').get.call(new AbortController().signal)}catch(e){fake={name:e.name,message:e.message}}return{fake,signalCtor:Object.getOwnPropertyDescriptor(TaskSignal.prototype,'priority').get.name}});
await run('worker',()=>new Promise(resolve=>{const w=new Worker(URL.createObjectURL(new Blob(["postMessage({scheduler:typeof scheduler,controller:typeof TaskController,signal:typeof TaskSignal,event:typeof TaskPriorityChangeEvent})"],{type:'text/javascript'})));w.onmessage=e=>{resolve(e.data);w.terminate()}}));
return rows})()
