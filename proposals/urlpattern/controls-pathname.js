(()=>{const rows=[],cap=(n,f)=>{try{rows.push([n,{value:f()}])}catch(e){rows.push([n,{error:e.name,message:e.message,realm:e instanceof TypeError}])}};const norm=v=>v===undefined?'__undefined__':v;
for(const component of['pathname'])for(const protocol of ['https','original-scheme'])for(const v of ['','a b','a/b','a.b','a?b','a#b','a:b','a\\b','a*b','🍅','a\nb','a\0b','%2f'])cap('generate-'+component+'-'+protocol+'-'+JSON.stringify(v),()=>new URLPattern({protocol,[component]:':x'}).generate(component,{x:v}));
return JSON.stringify(rows)})()
