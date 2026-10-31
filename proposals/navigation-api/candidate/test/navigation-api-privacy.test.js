import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser.js';
import {queryHeapObjects} from '../src/heap-query.js';

test('Navigation factories retain only Host-private records while genuine public and authored identities remain queryable',async t=>{
 const browser=new Browser(),page=browser.createPage();t.after(()=>browser.close());
 await page.navigate('data:text/html,actual-navigation-privacy');const w=page.dom.window;
 page.evaluate(`globalThis.ordinaryNavigationObject={marker:17};globalThis.authoredNavigationInterfaces={Navigation,NavigationHistoryEntry,NavigationDestination,NavigationActivation,NavigateEvent,NavigationCurrentEntryChangeEvent};globalThis.authoredNavigationRecord={api:authoredNavigationInterfaces,window,construct(){return'authored'}};globalThis.actualDestination=null;navigation.addEventListener('navigate',e=>actualDestination=e.destination,{once:true});history.pushState(null,'','#owned');globalThis.actualActivation=navigation.activation;globalThis.actualEntry=navigation.currentEntry;true`);
 const result=queryHeapObjects(w.Object.prototype,page.dom.getInternalVMContext()).objects;
 for(const expected of[w.ordinaryNavigationObject,w.authoredNavigationInterfaces,w.authoredNavigationRecord,w.navigation,w.actualEntry,w.actualDestination,w.actualActivation])assert.equal(result.includes(expected),true);
 const own=(object,key)=>Object.getOwnPropertyDescriptor(object,key)?.value;
 const dictionaries=result.filter(object=>Object.getPrototypeOf(object)===w.Object.prototype&&['Navigation','NavigationHistoryEntry','NavigationDestination','NavigationActivation','NavigateEvent','NavigationCurrentEntryChangeEvent'].every(key=>own(object,key)===w[key]));
 assert.equal(dictionaries.length,1);assert.equal(dictionaries[0],w.authoredNavigationInterfaces);
 assert.equal(w.authoredNavigationRecord.construct(),'authored');assert.equal(w.actualDestination.url,'data:text/html,actual-navigation-privacy#owned');assert.equal(w.actualActivation instanceof w.NavigationActivation,true);
});
