(async()=>{const out=[],row=(name,fn)=>{try{out.push([name,fn()])}catch(e){out.push([name,{error:e.name,message:e.message}])}},shape=value=>({tag:Object.prototype.toString.call(value),keys:Reflect.ownKeys(value).map(String),constructor:value?.constructor?.name,target:value instanceof EventTarget});
for(const n of ['VisualViewport','Screen','ScreenOrientation'])row('exposure:'+n,()=>[typeof globalThis[n],typeof globalThis[n]==='function'?globalThis[n].length:null]);
row('viewport',()=>{const v=visualViewport;return {...shape(v),same:v===visualViewport,values:['offsetLeft','offsetTop','pageLeft','pageTop','width','height','scale'].map(k=>v[k]),proto:Reflect.ownKeys(Object.getPrototypeOf(v)).map(String),handlers:[v.onresize,v.onscroll,v.onscrollend]}});
row('screen',()=>({...shape(screen),values:['width','height','availWidth','availHeight','colorDepth','pixelDepth','isExtended'].map(k=>[k,screen[k]]),proto:Reflect.ownKeys(Object.getPrototypeOf(screen)).map(String)}));
row('orientation',()=>({...shape(screen.orientation),values:[screen.orientation.type,screen.orientation.angle,screen.orientation.onchange],proto:Reflect.ownKeys(Object.getPrototypeOf(screen.orientation)).map(String)}));
row('window',()=>['innerWidth','innerHeight','outerWidth','outerHeight','screenX','screenY','screenLeft','screenTop','devicePixelRatio','scrollX','scrollY','pageXOffset','pageYOffset'].map(k=>[k,globalThis[k]]));
for(const n of ['VisualViewport','Screen','ScreenOrientation'])row('construct:'+n,()=>new globalThis[n]());
for(const n of ['scroll','scrollTo','scrollBy'])row('scrollShape:'+n,()=>({length:globalThis[n].length,name:globalThis[n].name,keys:Reflect.ownKeys(globalThis[n]).map(String)}));
row('orientationUnlock',()=>screen.orientation.unlock());row('orientationLock',()=>typeof screen.orientation.lock);
return out})()
