import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { startReference } from '../../scripts/reference-server.mjs';
import { connect } from '../../test/cdp-client.js';
import { until } from '../../src/browser.js';

const binary = process.argv[2];
if (!binary) throw new Error('Supply the verified reference browser path');
const referenceSHA256 = createHash('sha256').update(await readFile(binary)).digest('hex');
const fixture = `<!doctype html><style>
  #sized {position:absolute;left:100px;top:150px;width:240px;height:80px;margin:20px;padding:5px;border:2px solid}
  #hidden {display:none} #nested {width:10px;height:12px}
</style><button id="sized">Sized</button><button id="plain">Plain</button>
<button id="hidden">Hidden</button><div id="container"><button id="nested">Nested</button></div>
<script>globalThis.observedEvents=[];
for(const type of ['pointerdown','pointerup','mousedown','mouseup','click','mousemove']) document.addEventListener(type,event=>observedEvents.push({
  type:event.type,target:event.target.id||event.target.nodeName,x:event.clientX,y:event.clientY,
  button:event.button,buttons:event.buttons,detail:event.detail,isTrusted:event.isTrusted}));</script>`;
const browser = await startReference(binary);
let client, browserContextId;
try {
  client = await connect(browser.endpoint);
  const version = await client.send('Browser.getVersion');
  ({ browserContextId } = await client.send('Target.createBrowserContext'));
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}) => client.send(method, params, sessionId);
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) return { evaluationError: result.exceptionDetails };
    return result.result.value;
  };
  const attempt = async (method, params) => {
    try { return { result: await send(method, params) }; }
    catch (error) { return { error: { code: error.code, message: error.message } }; }
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');
  await send('Page.navigate', { url: `data:text/html,${encodeURIComponent(fixture)}` });
  await until(async () => await evaluate('document.readyState') === 'complete');
  const { root } = await send('DOM.getDocument', { depth: -1 });
  const nodes = {};
  const geometry = {};
  for (const selector of ['#sized', '#plain', '#hidden', '#nested', '#container', 'body']) {
    const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector }); nodes[selector] = nodeId;
    const expression = `JSON.stringify((()=>{const node=document.querySelector(${JSON.stringify(selector)});
      const rect = value=>({x:value.x,y:value.y,left:value.left,top:value.top,right:value.right,bottom:value.bottom,width:value.width,height:value.height});
      return {bounding:rect(node.getBoundingClientRect()),clientRects:Array.from(node.getClientRects(),rect),
        styleWidth:node.style.width,styleHeight:node.style.height,computedWidth:getComputedStyle(node).width,
        computedHeight:getComputedStyle(node).height,computedDisplay:getComputedStyle(node).display,
        offsetWidth:node.offsetWidth,offsetHeight:node.offsetHeight,clientWidth:node.clientWidth,clientHeight:node.clientHeight};})())`;
    const web = await evaluate(expression);
    geometry[selector] = { nodeId, web: typeof web === 'string' ? JSON.parse(web) : web,
      quads: await attempt('DOM.getContentQuads', { nodeId }),
      box: await attempt('DOM.getBoxModel', { nodeId }),
      scroll: await attempt('DOM.scrollIntoViewIfNeeded', { nodeId }) };
  }
  const mouse = [];
  const click = async (label, x, y, prepare) => {
    if (prepare) await prepare();
    await evaluate('observedEvents.length=0');
    const moved = await attempt('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    const pressed = await attempt('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    const released = await attempt('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    const events = await evaluate('JSON.stringify({events:observedEvents,active:document.activeElement?.id||document.activeElement?.nodeName})');
    mouse.push({ label, x, y, moved, pressed, released, observations: typeof events === 'string' ? JSON.parse(events) : events });
  };
  await click('unprepared origin', 0.5, 0.5);
  await click('sized quad then origin', 0.5, 0.5, () => send('DOM.getContentQuads', { nodeId: nodes['#sized'] }));
  await click('plain quad then origin', 0.5, 0.5, () => send('DOM.getContentQuads', { nodeId: nodes['#plain'] }));
  await click('styled coordinates', 120, 190);
  await click('far coordinates', 500, 500);
  await click('negative coordinates', -5, -5);
  await click('focused nested then origin', 0.5, 0.5, () => send('DOM.focus', { nodeId: nodes['#nested'] }));
  if (['centers', 'flow'].includes(process.argv[3])) {
    for (const selector of ['#sized', '#plain', '#nested', '#container', '#hidden']) {
      const quad = geometry[selector].quads.result?.quads?.[0];
      if (quad) await click(`${selector} returned center`, (quad[0] + quad[2] + quad[4] + quad[6]) / 4,
        (quad[1] + quad[3] + quad[5] + quad[7]) / 4,
        () => send('DOM.getContentQuads', { nodeId: nodes[selector] }));
    }
    const hitTests = await evaluate(`JSON.stringify([[120,75],[242.5,47.5],[250,81],[0,0],[-5,-5]].map(([x,y])=>({x,y,
      one:document.elementFromPoint(x,y)?.id||document.elementFromPoint(x,y)?.nodeName,
      all:Array.from(document.elementsFromPoint(x,y),node=>node.id||node.nodeName)})))`);
    const mutations = [];
    if (process.argv[3] === 'flow') {
      const tree = () => evaluate(`JSON.stringify((()=>{const rows=[];let index=0;
        const walk=node=>{const row={index:index++,type:node.nodeType,name:node.nodeName,id:node.id||null,text:node.nodeType===3?node.data.slice(0,30):null};
          if(node.getBoundingClientRect){const r=node.getBoundingClientRect();row.rect={x:r.x,y:r.y,width:r.width,height:r.height}}rows.push(row);for(const child of node.childNodes)walk(child)};
        walk(document);return rows})())`);
      mutations.push({ label: 'original preorder', tree: JSON.parse(await tree()) });
      await evaluate(`(()=>{const button=document.createElement('button');button.id='inserted';button.textContent='XYZ';document.body.prepend(button)})()`);
      mutations.push({ label: 'prepended button', tree: JSON.parse(await tree()) });
      await evaluate(`document.body.insertBefore(document.createTextNode('   '),document.querySelector('#sized'))`);
      mutations.push({ label: 'whitespace before sized', tree: JSON.parse(await tree()) });
      await evaluate(`document.querySelector('#plain').style.width='12.5px';document.querySelector('#plain').style.height='9.5px'`);
      mutations.push({ label: 'fractional explicit dimensions', tree: JSON.parse(await tree()), box: await attempt('DOM.getBoxModel',{nodeId:nodes['#plain']}) });
      await evaluate(`document.querySelector('#inserted').textContent='A much longer button label than five characters'`);
      mutations.push({ label: 'long control text with same node count', tree: JSON.parse(await tree()) });
      await evaluate(`document.querySelector('#container').style.display='none'`);
      mutations.push({ label: 'hidden ancestor', tree: JSON.parse(await tree()) });
      await evaluate(`(()=>{for(let i=0;i<250;i++)document.body.append(document.createElement('div'));
        const button=document.createElement('button');button.id='offscreen';button.textContent='Offscreen';document.body.append(button)})()`);
      const scrollSnapshot = () => evaluate(`JSON.stringify((()=>{const node=document.querySelector('#offscreen'),r=node.getBoundingClientRect();return{
        rect:{x:r.x,y:r.y,width:r.width,height:r.height},scrollX,scrollY,innerWidth,innerHeight,
        documentScrollTop:document.documentElement.scrollTop,documentScrollHeight:document.documentElement.scrollHeight,
        documentScrollWidth:document.documentElement.scrollWidth,bodyScrollHeight:document.body.scrollHeight,
        clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight}})())`);
      const before = JSON.parse(await scrollSnapshot());
      const { nodeId: offscreenId } = await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#offscreen'});
      const scrollResult = await attempt('DOM.scrollIntoViewIfNeeded',{nodeId:offscreenId});
      const after = JSON.parse(await scrollSnapshot());
      mutations.push({label:'offscreen scroll',before,scrollResult,after});
      if (process.argv[4] === 'extended') {
        await evaluate(`(()=>{for(let i=0;i<500;i++)document.body.append(document.createElement('div'));scrollTo(0,0)})()`);
        const middleBefore = JSON.parse(await scrollSnapshot());
        const middleResult = await attempt('DOM.scrollIntoViewIfNeeded',{nodeId:offscreenId});
        mutations.push({label:'middle document scroll alignment',before:middleBefore,scrollResult:middleResult,after:JSON.parse(await scrollSnapshot())});
        const shapeCases = await evaluate(`JSON.stringify((()=>{const rows=[];
          for(const [id,html,css] of [['text-div','<div>long text label</div>',''],['nested-span','<span><b>label</b></span>',''],
            ['wrapped-button','<button><b>label</b></button>',''],['empty-div','<div></div>',''],
            ['inline-parent','<div><b>label</b></div>','display:inline']]){
            const holder=document.createElement('div');holder.innerHTML=html;const node=holder.firstElementChild;node.id=id;node.style.cssText=css;document.body.append(node);
            const r=node.getBoundingClientRect();rows.push({id,rect:{x:r.x,y:r.y,width:r.width,height:r.height},display:getComputedStyle(node).display});
          }return rows})())`);
        mutations.push({label:'default element shapes',cases:JSON.parse(shapeCases)});
      }
    }
    console.log(JSON.stringify({ referenceSHA256, version, geometry, mouse, hitTests: typeof hitTests === 'string' ? JSON.parse(hitTests) : hitTests, ...(mutations.length?{mutations}:{}) }));
  } else console.log(JSON.stringify({ referenceSHA256, version, geometry, mouse }));
} finally {
  if (browserContextId) await client.send('Target.disposeBrowserContext', { browserContextId });
  await client?.close(); await browser.close();
}
