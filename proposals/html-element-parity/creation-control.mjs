// Direct V8 SameRealm metadata only: no heap enumeration or GC.
import{readFile,writeFile}from'node:fs/promises';import{pathToFileURL}from'node:url';import{join}from'node:path';import{createHash}from'node:crypto';
const[scratch,output]=process.argv.slice(2),load=name=>import(pathToFileURL(join(scratch,'src',name+'.js'))),{Browser}=await load('browser'),{createIsolatedWorld}=await load('isolated-world'),{installHTMLReflections}=await load('html-reflections'),{getHeapBinding}=await load('native-heap'),sha=x=>createHash('sha256').update(x).digest('hex');
const browser=new Browser(),page=browser.createPage();let world;
try{await page.navigate('data:text/html,<body>');const main=page.dom.window;world=createIsolatedWorld(main,{name:'html-reflection-creation',signal:page.documentAbort.signal});installHTMLReflections(world.global,{context:world.context});const binding=getHeapBinding(),rows=[];
 for(const[name,g,anchor]of[['main',main,main.eval('[]')],['utility',world.global,world.evaluate('[]')]]){
  const descriptor=Object.getOwnPropertyDescriptor(g.HTMLSourceElement.prototype,'width'),proto=Object.getPrototypeOf(descriptor.get),TypeError=g.TypeError;
  const same=value=>({selected:binding.sameRealm(value,anchor),host:binding.sameRealm(value,[])});const getter={before:same(descriptor.get)};try{Object.setPrototypeOf(descriptor.get,null);getter.afterNull=same(descriptor.get)}finally{Object.setPrototypeOf(descriptor.get,proto)}
  let receiverError,bigintError;try{Reflect.apply(descriptor.get,{},[])}catch(e){receiverError={type:e instanceof TypeError,realm:same(e)}}const source=g.document.createElement('source');try{Reflect.apply(descriptor.set,source,[-1n])}catch(e){bigintError={type:e instanceof TypeError,realm:same(e)}}rows.push({name,getter,setter:same(descriptor.set),receiverError,bigintError});
 }
 await writeFile(output,JSON.stringify({driverSHA256:sha(await readFile(new URL(import.meta.url))),operation:'constant-time SameRealm metadata; no enumeration/GC',rows},null,2)+'\n',{flag:'wx'});
}finally{world?.dispose();browser.close()}
