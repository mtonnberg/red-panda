// Owned public-behavior probes; no target production engine source is used.
const shell = (script, tail = '') => `<!doctype html><script>${script}</script>${tail}`;
export const parserResetCases = [
  {
    name: 'external-write-order-context-and-split-token',
    html: shell(`window.steps=[];window.errors=[];addEventListener('error',e=>errors.push(e.message));
      addEventListener('load',()=>{window.probeResult={steps,errors,ids:[...document.querySelectorAll('[id]')].map(x=>x.id),
        sectionChildren:[...document.querySelector('#written')?.children??[]].map(x=>x.id),
        splitText:document.getElementById('split')?.textContent??null,tail:!!document.getElementById('tail')};});`,
      '<script id="outer" src="/outer.js"></script><p id="tail">tail</p>'),
    routes: { '/outer.js': {
      body: `steps.push({at:'before',tail:!!document.getElementById('tail'),current:document.currentScript?.id});
        document.write('<section id="written">');
        document.write('<b id="one">1</b>');document.write('<b id="two">2</b>');document.write('</section>');
        steps.push({at:'section',children:[...document.getElementById('written').children].map(x=>x.id)});
        document.write('<p id="spl');steps.push({at:'split',exists:!!document.getElementById('split')});
        document.write('it">text</p>');
        document.write('<script id="nested">steps.push({at:"nested",current:document.currentScript.id});document.write("<em id=inner>inner</em>");steps.push({at:"nested-after-write",inner:!!document.getElementById("inner")});</script>');
        steps.push({at:'after',tail:!!document.getElementById('tail'),inner:!!document.getElementById('inner'),current:document.currentScript?.id});`,
    } },
  },
  {
    name: 'inline-open-while-parser-script-running',
    html: shell(`window.steps=[];const old=document;const result=document.open();
      steps.push({sameResult:result===old,sameDocument:document===old,state:document.readyState,current:document.currentScript?.tagName??null});
      document.write('<p id="written">written</p>');
      steps.push({written:!!document.getElementById('written')});
      addEventListener('load',()=>{window.probeResult={steps,written:!!document.getElementById('written'),tail:!!document.getElementById('tail'),state:document.readyState};});`,
      '<p id="tail">tail</p>'), routes: {},
  },
  {
    name: 'post-load-open-persistent-write-and-listeners',
    html: shell(`window.runs=0;window.listenerRuns=[];window.probeSteps=[];
      addEventListener('load',()=>{if(runs++)return;const old=document;
        document.addEventListener('reset-probe',()=>listenerRuns.push('document'));
        addEventListener('reset-probe',()=>listenerRuns.push('window'));
        const returned=document.open();probeSteps.push({at:'open',same:returned===old,state:document.readyState,empty:document.documentElement===null});
        document.dispatchEvent(new Event('reset-probe'));dispatchEvent(new Event('reset-probe'));
        document.write('<html><body><section id="new">');
        document.write('<b id="first">first</b>');document.write('<b id="second">second</b>');document.write('</section></body></html>');
        probeSteps.push({at:'before-close',state:document.readyState,children:[...document.querySelector('#new')?.children??[]].map(x=>x.id)});
        document.close();setTimeout(()=>window.probeResult={steps:probeSteps,listenerRuns,same:document===old,state:document.readyState,
          old:!!document.getElementById('old'),children:[...document.querySelector('#new')?.children??[]].map(x=>x.id)},30);
      });`, '<p id="old">old</p>'), routes: {},
  },
  {
    name: 'task-open-abandons-blocked-old-parser',
    html: shell(`window.oldScriptRan=false;window.errors=[];addEventListener('error',e=>errors.push(e.message));
      setTimeout(()=>{const old=document;const before=document.readyState;
        document.open();document.write('<p id="fresh">fresh</p>');document.close();
        setTimeout(()=>window.probeResult={same:document===old,before,state:document.readyState,
          fresh:!!document.getElementById('fresh'),stale:!!document.getElementById('stale'),oldScriptRan,errors},350);
      },10);`, '<script src="/held.js"></script>' + '<i></i>'.repeat(4000) + '<p id="stale">stale</p>'),
    routes: { '/held.js': { delay: 200, body: 'window.oldScriptRan=true;' } },
  },
  {
    name: 'external-write-nested-blocking-external',
    html: shell(`window.order=[];addEventListener('load',()=>window.probeResult={order,
      ids:[...document.querySelectorAll('[id]')].map(x=>x.id)});`,
      '<script id="outer" src="/outer.js"></script><p id="tail">tail</p>'),
    routes: {
      '/outer.js': { body: `order.push('outer-start');
        document.write('<script id="inner" src="/inner.js"></script><p id="after-inner">after</p>');
        order.push({at:'outer-after',inner:window.innerRan===true,after:!!document.getElementById('after-inner'),tail:!!document.getElementById('tail')});` },
      '/inner.js': { delay: 40, body: `window.innerRan=true;order.push({at:'inner',current:document.currentScript?.id,after:!!document.getElementById('after-inner'),tail:!!document.getElementById('tail')});document.write('<b id="inner-written">written</b>');` },
    },
  },
];
