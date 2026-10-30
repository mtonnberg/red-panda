const escapeScript = source => source.replaceAll('</script', '<\\/script');
const replacement = '<script type="module" src="/counter.mjs"></script><script type="module">window.probeResult={evaluations,sameWindow:window===savedWindow,sameArray:Array===savedArray};</script>';
const dynamicReplacement = '<p id="fresh">fresh</p><script type="module">window.newFinished=true;</script>';
export const parserResetCases = [
  {
    name:'module-map-after-postload-reset',
    html:`<!doctype html><script>window.evaluations=0;window.savedWindow=window;window.savedArray=Array;
      addEventListener('load',()=>{if(window.resetStarted)return;window.resetStarted=true;document.open();document.write(${escapeScript(JSON.stringify(replacement))});document.close();});</script><script type="module" src="/counter.mjs"></script>`,
    routes:{'/counter.mjs':{body:'window.evaluations++;export const value=1;'}},
  },
  {
    name:'running-dynamic-module-after-postload-reset',
    html:`<!doctype html><script>window.savedWindow=window;window.savedArray=Array;window.savedDocument=document;
      window.triggerReset=()=>{document.open();document.write(${escapeScript(JSON.stringify(dynamicReplacement))});document.close();};
      addEventListener('load',()=>{if(window.dynamicStarted)return;window.dynamicStarted=true;const script=document.createElement('script');script.type='module';
        script.textContent='window.oldStarted=true;triggerReset();await new Promise(resolve=>setTimeout(resolve,50));window.oldFinished=true;window.probeResult={oldStarted,oldFinished,newFinished:window.newFinished===true,sameWindow:window===savedWindow,sameArray:Array===savedArray,sameDocument:document===savedDocument};';document.body.append(script);});</script>`,
    routes:{},
  },
];
