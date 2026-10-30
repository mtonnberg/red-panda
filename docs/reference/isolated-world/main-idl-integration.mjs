import {registerHooks} from 'node:module';
const browser=new URL('../src/browser.js',import.meta.url).href;
const helper=new URL('./main-idl-prototypes.mjs',import.meta.url).href;
export const hook=registerHooks({load(url,context,nextLoad){const loaded=nextLoad(url,context);if(url!==browser)return loaded;let source=typeof loaded.source==='string'?loaded.source:new TextDecoder().decode(loaded.source);const anchor='    const listenerOwnership = installListenerOwnership(window);';if(source.split(anchor).length!==2)throw new Error('main-IDL hook anchor changed');return {...loaded,source:`import {alignMainIDLPrototypes} from ${JSON.stringify(helper)};\n`+source.replace(anchor,'    alignMainIDLPrototypes(window);\n'+anchor)};}});
