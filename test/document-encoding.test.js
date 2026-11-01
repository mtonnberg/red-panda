import{test}from'node:test';import assert from'node:assert/strict';import http from'node:http';import{Browser}from'../src/browser.js';
const ascii=value=>Buffer.from(value,'ascii'),utf8=value=>Buffer.from(value,'utf8'),plain=value=>JSON.parse(JSON.stringify(value));
const html=(meta,text)=>Buffer.concat([ascii('<!doctype html><meta '+meta+'><script>globalThis.beforeBodyEncoding=[document.characterSet,document.charset,document.inputEncoding]</script><p id="test">'),text,ascii('</p>')]);
async function fixture(t){
 let browser;const responses=new Map(),server=http.createServer((request,response)=>{const entry=responses.get(new URL(request.url,'http://localhost').pathname);response.setHeader('cache-control','no-store');if(!entry){response.statusCode=404;response.end();return;}response.setHeader('content-type',entry.mime);response.end(entry.bytes)});
 t.after(async()=>{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=new Browser();const page=browser.createPage(),origin='http://127.0.0.1:'+server.address().port;
 return{page,origin,async navigate(bytes,mime='text/html'){responses.set('/document',{bytes,mime});await page.navigate(origin+'/document');return page.dom.window}};
}
async function gbk(t){const f=await fixture(t),w=await f.navigate(html('charset="gbk"',Buffer.from('d6d0cec4','hex')));return{...f,w}}
function anchor(w,value){const a=w.document.createElement('a');a.href=value;return a}

test('HTML response decoding preserves actual declared metadata separately from BOM-selected byte decoding before scripts',{timeout:15000},async t=>{
 const f=await fixture(t);
 for(const[bytes,mime,text,label]of[
  [html('name="no-charset"',utf8('中😀 Café')),'text/html','中😀 Café','UTF-8'],
  [html('charset="gbk"',Buffer.from('d6d0cec4','hex')),'text/html','中文','GBK'],
  [html('charset="utf-8"',Buffer.from('d6d0cec4','hex')),'text/html; charset=GB2312','中文','GBK'],
  [Buffer.concat([Buffer.from('efbbbf','hex'),html('charset="gbk"',utf8('中😀'))]),'text/html; charset=gbk','中😀','GBK'],
  [html('charset="utf-8"',Buffer.from('436166e92080','hex')),'text/html; charset=ISO-8859-1','Café €','windows-1252'],
 ]){const w=await f.navigate(bytes,mime);assert.equal(w.document.getElementById('test').textContent,text);assert.deepEqual(plain(w.beforeBodyEncoding),[label,label,label]);assert.equal(w.document.characterSet,label)}
});
test('actual GBK anchor parser encodes mapped bytes and actual failures, preserving source percent escapes and literal NCR syntax',{timeout:15000},async t=>{
 const{w,origin}=await gbk(t);
 assert.equal(anchor(w,'/query?q=中').href,origin+'/query?q=%D6%D0');
 assert.equal(anchor(w,'/query?q=㴴').href,origin+'/query?q=%26%2315668%3B');
 assert.equal(anchor(w,'/query?q=😀').href,origin+'/query?q=%26%23128512%3B');
 assert.equal(anchor(w,'/query?q=?').href,origin+'/query?q=?');
 assert.equal(anchor(w,'/query?q=%E4%B8%AD').href,origin+'/query?q=%E4%B8%AD');
 assert.equal(anchor(w,'/query?q=&%2315668;').href,origin+'/query?q=&%2315668;');
 assert.equal(anchor(w,'/query?q=&#15668;').href,origin+'/query?q=&#15668;');
 assert.equal(anchor(w,'/query?q=%26%2315668%3B').href,origin+'/query?q=%26%2315668%3B');
 const literal=anchor(w,'/query');literal.search='?q=&#15668;';assert.equal(literal.search,'?q=&%2315668;');
 const unicode=anchor(w,'/query');unicode.search='?q=㴴';assert.equal(unicode.search,'?q=%E3%B4%B4');
});
test('document encoding affects special URL query only, preserving UTF8 path/fragment and standalone URL semantics',{timeout:15000},async t=>{
 const{w,origin}=await gbk(t);
 assert.equal(anchor(w,'/中?q=中#中').href,origin+'/%E4%B8%AD?q=%D6%D0#%E4%B8%AD');
 for(const prefix of['https://example.test/','ftp://example.test/','file:///actual'])assert.equal(anchor(w,prefix+'?q=中').href,prefix+'?q=%D6%D0');
 for(const prefix of['ws://example.test/','wss://example.test/','mailto:actual@example.test','custom:actual'])assert.equal(anchor(w,prefix+'?q=中').href,prefix+'?q=%E4%B8%AD');
 assert.equal(new w.URL('/query?q=中',origin).href,origin+'/query?q=%E4%B8%AD');
});
test('actual single-byte and Shift_JIS mappings preserve legitimate question marks and nonroundtrip aliases',{timeout:15000},async t=>{
 const f=await fixture(t);let w=await f.navigate(html('name="no-meta"',Buffer.from('436166e9','hex')),'text/html; charset=ISO-8859-1');
 assert.equal(anchor(w,'/query?q=é€?').search,'?q=%E9%80?');assert.equal(anchor(w,'/query?q=中').search,'?q=%26%2320013%3B');
 w=await f.navigate(html('charset="Shift_JIS"',Buffer.from('93fa967b8cea','hex')));assert.equal(w.document.getElementById('test').textContent,'日本語');
 assert.equal(anchor(w,'/query?q=¥‾?').search,'?q=\\~?');assert.equal(anchor(w,'/query?q=日').search,'?q=%93%FA');
});
test('real Unicode/meta aliases, malformed UTF8 fallback and data URL bytes retain truthful document encoding',{timeout:15000},async t=>{
 const f=await fixture(t);let w=await f.navigate(html('charset="unicode"',utf8('中😀')));assert.equal(w.document.characterSet,'UTF-8');assert.equal(w.document.getElementById('test').textContent,'中😀');
 w=await f.navigate(html('name="no-charset"',Buffer.from('d6d0cec4','hex')));assert.equal(w.document.characterSet,'UTF-8');assert.equal(w.document.getElementById('test').textContent,'����');
 await f.page.navigate('data:text/html,'+encodeURIComponent('<!doctype html><p id="test">中😀 Café</p>'));w=f.page.dom.window;assert.equal(w.document.characterSet,'UTF-8');assert.equal(w.document.getElementById('test').textContent,'中😀 Café');
});
test('genuine inactive documents keep their own encoding and adopted anchors use actual destination document metadata',{timeout:15000},async t=>{
 const{w,origin}=await gbk(t),inactive=w.document.implementation.createHTMLDocument('actual');
 const a=inactive.createElement('a');a.href=origin+'/query?q=中';assert.equal(a.href,origin+'/query?q=%E4%B8%AD');
 w.document.adoptNode(a);assert.equal(a.ownerDocument,w.document);assert.equal(a.href,origin+'/query?q=%D6%D0');
 const copied=w.document.cloneNode(true).createElement('a');copied.href=origin+'/query?q=中';assert.equal(copied.href,origin+'/query?q=%D6%D0');
});
test('existing selected-VM href brands, conversion order and authored exceptions remain actual frontend behavior',{timeout:15000},async t=>{
 const{w,origin}=await gbk(t),descriptor=Object.getOwnPropertyDescriptor(w.HTMLAnchorElement.prototype,'href'),a=w.document.createElement('a');let calls=0;
 descriptor.set.call(a,{toString(){calls++;return'/query?q=中'}});assert.equal(calls,1);assert.equal(a.href,origin+'/query?q=%D6%D0');
 const sentinel=new w.RangeError('actual conversion');assert.throws(()=>descriptor.set.call(a,{toString(){throw sentinel}}),error=>error===sentinel);
 const fake=Object.create(w.HTMLAnchorElement.prototype);assert.throws(()=>descriptor.set.call(fake,{toString(){calls++;return'/wrong'}}),error=>error instanceof w.TypeError);assert.equal(calls,1);
});
test('public TextDecoder streaming/fatal and BufferSource conversions remain untouched in the selected realm',{timeout:15000},async t=>{
 const{w}=await gbk(t);const result=w.eval(`(()=>{const stream=new TextDecoder('utf-8'),part=stream.decode(new Uint8Array([0xe4,0xb8]),{stream:true}),last=stream.decode(new Uint8Array([0xad]));let fatal;try{new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array([0xff]))}catch(error){fatal=error instanceof TypeError}const backing=new Uint8Array([0,0xd6,0xd0,0]);return{part,last,fatal,gbk:new TextDecoder('gbk').decode(new DataView(backing.buffer,1,2)),encoding:new TextDecoder('gb2312').encoding}})()`);
 assert.deepEqual(plain(result),{part:'',last:'中',fatal:true,gbk:'中',encoding:'gbk'});
});


test('BOM decoding and declared Document/query state remain independent for measured UTF8 and UTF16 inputs',{timeout:15000},async t=>{
 const f=await fixture(t),utf16=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('<!doctype html><meta charset="gbk"><script>globalThis.beforeBodyEncoding=[document.characterSet,document.charset,document.inputEncoding]</script><p id="test">中😀</p>','utf16le')]);
 for(const[bytes,mime,label,query]of[
  [Buffer.concat([Buffer.from('efbbbf','hex'),html('charset="gbk"',utf8('中😀'))]),'text/html','GBK','?q=%D6%D0'],
  [utf16,'text/html; charset=gbk','GBK','?q=%D6%D0'],
  [Buffer.concat([Buffer.from('efbbbf','hex'),html('charset="utf-8"',utf8('中😀'))]),'text/html; charset=UTF-16LE','UTF-16LE','?q=%E4%B8%AD'],
 ]){const w=await f.navigate(bytes,mime);assert.equal(w.document.getElementById('test').textContent,'中😀');assert.equal(w.document.characterSet,label);assert.deepEqual(plain(w.beforeBodyEncoding),[label,label,label]);assert.equal(anchor(w,'/query?q=中').search,query)}
});
test('invalid explicit transport encoding suppresses a conflicting meta declaration without fabricating fallback bytes',{timeout:15000},async t=>{
 const f=await fixture(t),w=await f.navigate(html('charset="gbk"',Buffer.from('d6d0cec4','hex')),'text/html; charset=x-actual-invalid-encoding');
 assert.equal(w.document.characterSet,'UTF-8');assert.deepEqual(plain(w.beforeBodyEncoding),['UTF-8','UTF-8','UTF-8']);assert.equal(w.document.getElementById('test').textContent,'����');assert.equal(anchor(w,'/query?q=中').search,'?q=%E4%B8%AD');
});
test('UTF16 BOM with UTF8-default HTML preserves the measured unsupported decoding path and does not execute source bytes',{timeout:15000},async t=>{
 const f=await fixture(t),bytes=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('<!doctype html><meta name="no-encoding"><script>globalThis.actualUnexpectedExecution=true</script><p id="test">中😀</p>','utf16le')]),w=await f.navigate(bytes);
 assert.equal(w.document.characterSet,'UTF-8');assert.equal(w.document.getElementById('test'),null);assert.equal(w.actualUnexpectedExecution,undefined);assert.ok(w.document.body.textContent.startsWith('��'));assert.ok(w.document.body.textContent.includes('<p id="test">'));assert.equal(anchor(w,'/query?q=中').search,'?q=%E4%B8%AD');
});
test('XHTML transport/default encoding ignores HTML meta while preserving current actual parser and MIME ownership',{timeout:15000},async t=>{
 const f=await fixture(t),bytes=Buffer.concat([ascii('<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="gbk" /></head><body><p id="test">'),Buffer.from('d6d0cec4','hex'),ascii('</p></body></html>')]),w=await f.navigate(bytes,'application/xhtml+xml');
 assert.equal(w.document.contentType,'application/xhtml+xml');assert.equal(w.document.characterSet,'UTF-8');assert.equal(w.document.getElementById('test').textContent,'����');assert.equal(anchor(w,'/query?q=中').search,'?q=%E4%B8%AD');
});
