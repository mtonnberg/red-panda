(()=>{const rows=[],cap=(n,f)=>{try{rows.push([n,{value:f()}])}catch(e){rows.push([n,{error:e.name,message:e.message,realm:e instanceof TypeError}])}};const norm=v=>v===undefined?'__undefined__':v;
for(const value of [undefined,null,17,true,'hi',Symbol('x'),{},Object.create({x:'inherited'}),{x:null},{x:17},{x:Symbol('str')}])cap('groups-'+String(value),()=>new URLPattern({pathname:'/:x'}).generate('pathname',value));
cap('group-order',()=>{let log=[];const groups=new Proxy({z:'z',a:'a'}, {get(t,k){log.push(String(k));return t[k]},ownKeys(){throw Error('ownKeys')}});const value=new URLPattern({pathname:'/:z/:a/:z2?'}).generate('pathname',groups);return{log,value}});
for(const component of[undefined,null,Symbol('pathname'),'invalid'])cap('component-'+String(component),()=>new URLPattern({pathname:'/:x'}).generate(component,{x:'a'}));
for(const second of[17,true,null,undefined,Symbol('https://example.com'),new String('https://example.com')])cap('ctor-second-'+String(second),()=>new URLPattern('/a',second).pathname);
return JSON.stringify(rows)})()
