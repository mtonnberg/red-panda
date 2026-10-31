module Test.Main where

import Prelude

import Data.Foldable (elem)
import Data.Either (Either(..))
import Effect (Effect)
import Effect.Aff (Aff, bracket, launchAff_, throwError, attempt)
import Effect.Class.Console (log)
import Effect.Exception (error)
import RedPanda.Puppeteer as Browser

foreign import data Fixture :: Type
foreign import startImpl :: Browser.Async Fixture
foreign import stopImpl :: Fixture -> Browser.Async Unit
foreign import fixtureUrl :: Fixture -> String
foreign import fixtureEndpoint :: Fixture -> String
foreign import fixtureStreamUrl :: Fixture -> String
foreign import fixtureSocketUrl :: Fixture -> String

assert :: String -> Boolean -> Aff Unit
assert label ok = if ok then log $ "PASS " <> label else throwError $ error $ "FAIL " <> label

main :: Effect Unit
main = launchAff_ $
  bracket (Browser.fromAsync startImpl) (Browser.fromAsync <<< stopImpl) \fixture ->
    bracket (Browser.connect $ fixtureEndpoint fixture) Browser.disconnect \browser ->
      bracket (Browser.createContext browser) Browser.closeContext \context -> do
        page <- Browser.newPage context
        let url = fixtureUrl fixture
        preload <- Browser.evaluateOnNewDocument page "globalThis.fixturePreload = 'purescript';"
        status <- Browser.goto page url
        assert "Puppeteer navigation returns HTTP 200" $ status == 200
        title <- Browser.evaluateString page "document.title"
        assert "title comes from the loaded document" $ title == "Red Panda fixture"
        heading <- Browser.textContent page "h1"
        assert "inline and external scripts execute" $ heading == "external script ran"
        preloaded <- Browser.evaluateString page "globalThis.observedPreload"
        assert "preload executes before the document's own scripts" $ preloaded == "purescript"
        Browser.waitForSelector page "#async:not(:empty)"
        asynchronous <- Browser.textContent page "#async"
        assert "Puppeteer selector waits for an asynchronous DOM mutation" $ asynchronous == "async data"
        -- Exercise awaitPromise through a real Puppeteer function evaluation.
        fetched <- Browser.evaluateString page "fetch('/api').then(r => r.json()).then(x => x.message)"
        assert "relative fetch resolves JSON" $ fetched == "async data"
        Browser.dispatchClick page "button"
        clicked <- Browser.textContent page "h1"
        assert "DOM click dispatches the listener" $ clicked == "clicked"
        links <- Browser.evaluateString page "JSON.stringify(Array.from(document.links, a => a.href))"
        assert "links resolve against the navigation URL" $ links == "[" <> Browser.quote (url <> "next") <> "]"
        Browser.setCookie context url "automation" "purescript"
        names <- Browser.cookieNames context
        assert "Puppeteer cookies persist in their context" $ elem "automation" names
        bracket (Browser.createContext browser) Browser.closeContext \isolated -> do
          isolatedNames <- Browser.cookieNames isolated
          assert "another browser context has an independent cookie jar" $ not $ elem "automation" isolatedNames
        document <- Browser.content page
        serialized <- Browser.evaluateString page "document.documentElement.outerHTML"
        assert "page.content serializes the mutated DOM and doctype" $ document == "<!DOCTYPE html>" <> serialized
        status404 <- Browser.goto page $ url <> "missing"
        assert "HTTP 404 remains a valid navigation response" $ status404 == 404
        redirectedStatus <- Browser.goto page $ url <> "redirect"
        redirectedTitle <- Browser.evaluateString page "document.title"
        assert "redirects commit the final document and HTTP response" $ redirectedStatus == 200 && redirectedTitle == "Next page"
        retainedPreload <- Browser.evaluateString page "globalThis.fixturePreload"
        assert "preload persists across navigations" $ retainedPreload == "purescript"
        Browser.removePreload page preload
        response <- Browser.gotoResponse page $ url <> "response"
        body <- Browser.responseText response
        assert "Puppeteer reads the original HTTP response body" $
          Browser.responseStatus response == 200 && body == "<h1>source</h1><script>document.querySelector(\"h1\").textContent=\"mutated\"</script>"
        mutated <- Browser.textContent page "h1"
        assert "response bytes remain distinct from the executed DOM" $ mutated == "mutated"
        removedPreload <- Browser.evaluateString page "typeof globalThis.fixturePreload"
        assert "removed preload is absent in the next document" $ removedPreload == "undefined"
        Browser.setExtraHTTPHeaders page
          [ { name: "X-Client", value: "purescript" }, { name: "X-Shared", value: "extra" } ]
        Browser.setUserAgent page "RedPandaPureScript/1"
        void $ Browser.goto page $ url <> "request-headers"
        Browser.waitForSelector page "#fetch:not(:empty)"
        sent <- Browser.evaluateString page "JSON.stringify(['navigation','resource','fetch'].map(id => JSON.parse(document.getElementById(id).textContent)['x-client']))"
        assert "extra headers reach navigation, external scripts and fetch" $ sent == "[\"purescript\",\"purescript\",\"purescript\"]"
        overridden <- Browser.evaluateString page "JSON.parse(document.getElementById('fetch').textContent)['x-shared']"
        assert "CDP headers override a conflicting page fetch header" $ overridden == "extra"
        agents <- Browser.evaluateString page "JSON.stringify([navigator.userAgent,...['navigation','resource','fetch'].map(id => JSON.parse(document.getElementById(id).textContent)['user-agent'])])"
        assert "user agent matches both navigator and outgoing requests" $ agents == "[\"RedPandaPureScript/1\",\"RedPandaPureScript/1\",\"RedPandaPureScript/1\",\"RedPandaPureScript/1\"]"
        Browser.setExtraHTTPHeaders page []
        void $ Browser.goto page $ url <> "request-headers"
        Browser.waitForSelector page "#fetch:not(:empty)"
        cleared <- Browser.evaluateString page "JSON.stringify(['navigation','resource','fetch'].map(id => JSON.parse(document.getElementById(id).textContent)['x-client']))"
        assert "clearing headers removes them from subsequent requests" $ cleared == "[null,null,null]"
        bracket (Browser.newPage context) Browser.closePage \otherPage -> do
          void $ Browser.goto otherPage $ url <> "request-headers"
          Browser.waitForSelector otherPage "#fetch:not(:empty)"
          independent <- Browser.evaluateString otherPage "String(navigator.userAgent !== 'RedPandaPureScript/1' && JSON.parse(document.getElementById('navigation').textContent)['x-client'] === null)"
          assert "another page has independent request configuration" $ independent == "true"
        void $ Browser.goto page $ url <> "history"
        void $ Browser.evaluateString page "documentToken='purescript';globalThis.initialHistoryLength=history.length; 'prepared'"
        pushed <- Browser.withNavigation page $ Browser.evaluateString page "history.pushState({step:1},'','/history?step=1'); 'pushed'"
        assert "Puppeteer observes history.pushState navigation" $ pushed == url <> "history?step=1"
        retained <- Browser.evaluateString page "documentToken"
        assert "same-document navigation retains JavaScript state" $ retained == "purescript"
        replaced <- Browser.withNavigation page $ Browser.evaluateString page "history.replaceState({step:2},'','/history?step=2'); 'replaced'"
        replacedCorrectly <- Browser.evaluateString page "String(history.state.step===2 && history.length===initialHistoryLength+1)"
        assert "replaceState updates URL/state without adding an entry" $ replaced == url <> "history?step=2" && replacedCorrectly == "true"
        fragment <- Browser.withNavigation page $ Browser.evaluateString page "location.hash='route'; 'fragment'"
        assert "Puppeteer observes fragment navigation" $ fragment == url <> "history?step=2#route"
        backWithin <- Browser.withNavigation page $ Browser.evaluateString page "history.back(); 'back'"
        stateAfterBack <- Browser.evaluateString page "String(history.state.step===2 && documentToken==='purescript')"
        assert "scripted back restores history state without replacing the document" $ backWithin == url <> "history?step=2" && stateAfterBack == "true"
        lengthBeforeReload <- Browser.evaluateString page "String(history.length)"
        reloaded <- Browser.reload page
        lengthAfterReload <- Browser.evaluateString page "String(history.length)"
        reloadState <- Browser.evaluateString page "String(documentToken==='original' && history.state.step===2)"
        assert "reload preserves history entry/state while loading a new document" $ reloaded == url <> "history?step=2" && lengthBeforeReload == lengthAfterReload && reloadState == "true"
        forwarded <- Browser.goForward page
        assert "Puppeteer goForward uses the saved entry" $ forwarded == url <> "history?step=2#route"
        backed <- Browser.goBack page
        assert "Puppeteer goBack uses the saved entry" $ backed == url <> "history?step=2"
        failed <- attempt $ Browser.withNavigation page $ Browser.evaluateString page "history.pushState({},'', 'https://other.test/'); 'unexpected'"
        assert "failed navigation action cancels its watcher" $ case failed of
          Left _ -> true
          Right _ -> false
        recovered <- Browser.withNavigation page $ Browser.evaluateString page "history.pushState({step:3},'','/history?step=3'); 'recovered'"
        reportedUrl <- Browser.pageUrl page
        assert "navigation remains usable after a canceled watcher" $ recovered == url <> "history?step=3" && reportedUrl == recovered
        void $ Browser.goto page $ url <> "forms"
        Browser.typeText page "#text" "Panda"
        typed <- Browser.evaluateString page "document.querySelector('#text').value"
        assert "Puppeteer types text into the focused input" $ typed == "Panda"
        Browser.pressKey page "ArrowLeft"
        Browser.pressKey page "Backspace"
        Browser.insertText page "🦊"
        edited <- Browser.evaluateString page "document.querySelector('#text').value"
        assert "keyboard selection and Unicode text insertion edit the input" $ edited == "Pan🦊a"
        Browser.typeText page "#readonly" "ignored"
        readonly <- Browser.evaluateString page "document.querySelector('#readonly').value"
        assert "readonly fields reject keyboard text" $ readonly == "locked"
        Browser.typeText page "#notes" "one"
        Browser.pressKey page "Enter"
        Browser.typeText page "#notes" "two"
        notes <- Browser.evaluateString page "document.querySelector('#notes').value"
        assert "textarea keyboard input preserves newlines" $ notes == "one\ntwo"
        void $ Browser.evaluateString page "globalThis.driverEvents=[];document.querySelector('#text').addEventListener('input',e=>driverEvents.push(e.isTrusted));document.querySelector('#text').addEventListener('beforeinput',e=>e.preventDefault()); 'listening'"
        Browser.focus page "#text"
        Browser.insertText page "blocked"
        unchanged <- Browser.evaluateString page "document.querySelector('#text').value"
        assert "canceled beforeinput prevents text edits" $ unchanged == edited
        void $ Browser.evaluateString page "document.querySelector('#notes').addEventListener('input',e=>driverEvents.push(e.isTrusted)); 'listening'"
        Browser.focus page "#notes"
        Browser.insertText page "!"
        trusted <- Browser.evaluateString page "JSON.stringify(driverEvents)"
        assert "driver input events are trusted" $ trusted == "[true]"
        void $ Browser.evaluateString page "document.body.innerHTML='<button id=first>First</button><button id=second>Second</button><button id=hidden style=display:none>Hidden</button>';globalThis.clicks=[];document.addEventListener('click',e=>clicks.push([e.target.id,e.isTrusted])); 'ready'"
        Browser.click page "#second"
        coordinateClicked <- Browser.evaluateString page "JSON.stringify(clicks)"
        assert "Puppeteer coordinate click hits the requested button and emits a trusted event" $ coordinateClicked == "[[\"second\",true]]"
        Browser.click page "#first"
        firstClicked <- Browser.evaluateString page "JSON.stringify(clicks)"
        assert "hit testing distinguishes adjacent buttons" $ firstClicked == "[[\"second\",true],[\"first\",true]]"
        hiddenClick <- attempt $ Browser.click page "#hidden"
        assert "hidden elements reject Puppeteer coordinate clicks" $ case hiddenClick of
          Left _ -> true
          Right _ -> false
        void $ Browser.goto page $ url <> "modules"
        moduleResult <- Browser.textContent page "h1"
        assert "Puppeteer load waits for module imports and top-level await" $ moduleResult == "42"
        void $ Browser.goto page $ url <> "navigation-source"
        scriptDestination <- Browser.pageUrl page
        assert "Puppeteer goto follows scripted document replacement" $ scriptDestination == url <> "next"
        void $ Browser.goto page $ url <> "click-navigation"
        clickedDestination <- Browser.withNavigation page $ Browser.click page "#next"
        assert "PureScript owns coordinate click and full-document navigation together" $ clickedDestination == url <> "next"
        void $ Browser.goto page $ url <> "frames"
        frame <- Browser.childFrame page 0
        frameTitle <- Browser.evaluateFrameString frame "document.title"
        assert "Puppeteer child frame evaluation uses its actual document" $ frameTitle == "Child frame"
        frameOnly <- Browser.evaluateFrameString frame "frameOnly"
        parentOnly <- Browser.evaluateString page "typeof frameOnly"
        assert "child globals remain isolated from the parent" $ frameOnly == "child realm" && parentOnly == "undefined"
        frameStatus <- Browser.gotoFrame frame $ url <> "frame-next"
        navigatedFrameTitle <- Browser.evaluateFrameString frame "document.title"
        parentTitle <- Browser.evaluateString page "document.title"
        assert "frame navigation preserves the parent document" $ frameStatus == 200 && navigatedFrameTitle == "Next frame" && parentTitle == "Parent frames"
        void $ Browser.evaluateFrameString frame "document.body.insertAdjacentHTML('beforeend','<input id=frame-edit>'); 'ready'"
        Browser.focusFrame frame "#frame-edit"
        Browser.insertText page "Child edit"
        editedFrame <- Browser.evaluateFrameString frame "document.querySelector('#frame-edit').value"
        assert "PureScript keyboard input follows focus into the actual child frame" $ editedFrame == "Child edit"
        void $ Browser.goto page $ "data:text/html,<button id=anchor>Anchor</button><dialog id=prompt><form method=dialog><button id=confirm value=yes>Confirm</button></form></dialog>"
        Browser.focus page "#anchor"
        void $ Browser.evaluateString page "window.dialogEvents=[];window.dialogClosed=new Promise(resolve=>document.querySelector('#prompt').addEventListener('close',e=>{dialogEvents.push(e.isTrusted);resolve();},{once:true}));document.querySelector('#prompt').showModal();'opened'"
        Browser.pressKey page "Escape"
        escapedDialog <- Browser.evaluateString page "dialogClosed.then(()=>JSON.stringify([document.querySelector('#prompt').open,document.activeElement.id,dialogEvents]))"
        assert "PureScript privileged Escape closes a modal with its real trusted event and retained focus" $ escapedDialog == "[false,\"anchor\",[true]]"
        void $ Browser.evaluateString page "window.dialogClosed=new Promise(resolve=>document.querySelector('#prompt').addEventListener('close',resolve,{once:true}));document.querySelector('#prompt').showModal();'opened'"
        Browser.click page "#confirm"
        submittedDialog <- Browser.evaluateString page "dialogClosed.then(()=>JSON.stringify([document.querySelector('#prompt').open,document.querySelector('#prompt').returnValue]))"
        assert "PureScript coordinate activation submits a dialog form and preserves the submitter value" $ submittedDialog == "[false,\"yes\"]"
        void $ Browser.evaluateString page "window.beforeReset={document,Array};document.open();document.write('<h1 id=written>Fresh parser</h1><input type=range min=10 max=30 step=4>');document.close();'written'"
        Browser.waitForSelector page "#written"
        writtenDocument <- Browser.evaluateString page "JSON.stringify([beforeReset.document===document,beforeReset.Array===Array,document.querySelector('input').value,document.querySelector('h1').innerText])"
        assert "PureScript sees a fresh written DOM in the retained Document and constructor realm" $ writtenDocument == "[true,true,\"22\",\"Fresh parser\"]"
        void $ Browser.goto page $ "data:text/html,<h1>PureScript rendering</h1><p>Own selectable text.</p>"
        image <- Browser.screenshot page false
        assert "PureScript Puppeteer receives a real PNG screenshot" $ Browser.signature image == "89504e470d0a1a0a" && Browser.byteLength image > 1000
        pdfBytes <- Browser.pdf page
        assert "PureScript Puppeteer reads a real PDF through CDP streams" $ Browser.signature pdfBytes == "255044462d312e34" && Browser.byteLength pdfBytes > 1000
        void $ Browser.evaluateString page "globalThis.heapPrototype={};globalThis.heapObjects=[Object.create(heapPrototype),Object.create(heapPrototype)];heapObjects[0].label='actual';'ready'"
        Browser.withHandle (Browser.evaluateHandle page "heapPrototype") \prototype ->
          Browser.withHandle (Browser.queryObjects page prototype) \instances -> do
            identities <- Browser.evaluateHandleString instances "items=>JSON.stringify([items.length,items.includes(heapObjects[0]),items.includes(heapObjects[1]),Object.getPrototypeOf(items)===Array.prototype])"
            assert "PureScript Puppeteer queries actual heap identities in a real realm Array" $ identities == "[2,true,true,true]"
        void $ Browser.evaluateString page "globalThis.heapForm=document.createElement('form');document.body.append(heapForm);'ready'"
        Browser.withHandle (Browser.evaluateHandle page "HTMLFormElement.prototype") \prototype ->
          Browser.withHandle (Browser.queryObjects page prototype) \instances -> do
            publicForm <- Browser.evaluateHandleString instances "items=>JSON.stringify([items.includes(heapForm),Object.getPrototypeOf(items)===Array.prototype])"
            assert "PureScript heap queries retain the genuine public form proxy and owned handle lifetime" $ publicForm == "[true,true]"
        mediaValues <- Browser.evaluateString page "(()=>{const data=new ImageData(new Uint8ClampedArray([255,0,0,255,0,128,0,255]),2,1);const cloned=structuredClone({one:data,two:data});const chunk=new EncodedVideoChunk({type:'key',timestamp:17,duration:23,data:new Uint8Array([0,128,255])});const bytes=new Uint8Array(3);chunk.copyTo(bytes);return JSON.stringify([cloned.one.width,cloned.one.height,Array.from(cloned.one.data),cloned.one===cloned.two,Array.from(bytes),chunk.timestamp,chunk.duration])})()"
        assert "PureScript Puppeteer reads genuine cloned image pixels and immutable encoded bytes" $ mediaValues == "[2,1,[255,0,0,255,0,128,0,255],true,[0,128,255],17,23]"
        audioSamples <- Browser.evaluateString page "(async()=>{const context=new OfflineAudioContext(1,8,8000);const buffer=context.createBuffer(1,4,8000);buffer.copyToChannel(new Float32Array([0.25,0.5,-0.5,-0.25]),0);const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);source.start(2/8000);return JSON.stringify(Array.from((await context.startRendering()).getChannelData(0)))})()"
        assert "PureScript Puppeteer receives actual scheduled offline audio samples" $ audioSamples == "[0,0,0.25,0.5,-0.5,-0.25,0,0]"
        cssSelection <- Browser.evaluateString page "(()=>{const node=document.createElement('div');node.id='1 #red';document.body.append(node);const selected=document.querySelector('#'+CSS.escape(node.id))===node;node.remove();return JSON.stringify([selected,CSS.supports('(display:grid) and (gap:1px)'),CSS.supports('unknown-property','x'),CSS.supports('selector(:has(a))')])})()"
        assert "PureScript Puppeteer escapes actual identifiers and evaluates CSS feature conditions" $ cssSelection == "[true,true,false,true]"
        canvasValues <- Browser.evaluateString page "(()=>{const canvas=document.createElement('canvas'),context=canvas.getContext('2d');canvas.width=2;canvas.height=3;context.fillStyle='red';context.fillRect(0,0,2,3);const image=context.getImageData(0,0,1,1),png=atob(canvas.toDataURL().split(',')[1]);return JSON.stringify([context.canvas===canvas,Array.from(image.data),png.length,png.charCodeAt(0),png.slice(1,4)])})()"
        assert "PureScript Puppeteer reads actual native-profile Canvas pixels and encoded PNG bytes" $ canvasValues == "[true,[0,0,0,0],67,137,\"PNG\"]"
        storageValues <- Browser.evaluateString page "(()=>{const area=localStorage;area.clear();try{const value='🐼'.repeat(1310720);area.setItem('quota',value);let error;try{area.setItem('overflow','x')}catch(e){error=e.name}return JSON.stringify([area.getItem('quota')===value,error,area.getItem('overflow')])}finally{area.clear()}})()"
        assert "PureScript Puppeteer uses the real UTF-8 Storage quota and atomic failed writes" $ storageValues == "[true,\"QuotaExceededError\",null]"
        audioDataValues <- Browser.evaluateString page "(()=>{const input=new AudioData({format:'f32',sampleRate:8000,numberOfFrames:2,numberOfChannels:1,timestamp:17,data:new Float32Array([0.25,-0.5])});const copy=structuredClone(input),samples=new Float32Array(2);copy.copyTo(samples,{planeIndex:0});const result=JSON.stringify([copy.numberOfFrames,copy.numberOfChannels,copy.sampleRate,copy.duration,Array.from(samples),copy===input]);copy.close();input.close();return result})()"
        assert "PureScript Puppeteer clones genuine AudioData and copies real PCM samples" $ audioDataValues == "[2,1,8000,250,[0.25,-0.5],false]"
        videoFrameValues <- Browser.evaluateString page "(async()=>{const frame=new VideoFrame(new Uint8Array([255,0,0,255,0,255,0,255]),{format:'RGBA',codedWidth:2,codedHeight:1,timestamp:33}),copy=structuredClone(frame),bytes=new Uint8Array(copy.allocationSize());const layout=await copy.copyTo(bytes);const result=JSON.stringify([copy.codedWidth,copy.codedHeight,copy.timestamp,Array.from(bytes),layout.map(p=>[p.offset,p.stride])]);copy.close();frame.close();return result})()"
        assert "PureScript Puppeteer receives actual VideoFrame plane bytes and layout" $ videoFrameValues == "[2,1,33,[255,0,0,255,0,255,0,255],[[0,8]]]"
        patternValues <- Browser.evaluateString page "(()=>{const pattern=new URLPattern({pathname:'/products/:id',search:'q=:query'}),match=pattern.exec('https://shop.test/products/red?q=panda');return JSON.stringify([match.pathname.groups.id,match.search.groups.query,pattern.generate('pathname',{id:'42'}),pattern.test('https://shop.test/other?q=panda')])})()"
        assert "PureScript Puppeteer matches and generates actual URLPattern components" $ patternValues == "[\"red\",\"panda\",\"/products/42\",false]"
        permissionValues <- Browser.evaluateString page "(async()=>{const note=new Notification('Red',{body:'Panda'}),status=await navigator.permissions.query({name:'geolocation'}),permission=await Notification.requestPermission();const denied=await new Promise(resolve=>navigator.geolocation.getCurrentPosition(()=>resolve(['invented']),error=>resolve([error.code,error.message,error instanceof GeolocationPositionError])));const result=JSON.stringify([note instanceof EventTarget,note.title,note.body,Notification.permission,permission,status.state,denied]);note.close();return result})()"
        assert "PureScript Puppeteer observes genuine denied device requests and Notification metadata" $ permissionValues == "[true,\"Red\",\"Panda\",\"default\",\"default\",\"prompt\",[1,\"User denied Geolocation\",true]]"
        selectionValues <- Browser.evaluateString page "(()=>{const node=document.createTextNode('red panda');document.body.append(node);const selection=getSelection();selection.removeAllRanges();const trace=[],listener=()=>trace.push([selection.direction,selection.toString()]);document.addEventListener('selectionchange',listener);selection.setBaseAndExtent(node,0,node,3);selection.modify('extend','forward','word');document.removeEventListener('selectionchange',listener);const result=JSON.stringify([trace,selection.anchorOffset,selection.focusOffset]);selection.removeAllRanges();node.remove();return result})()"
        assert "PureScript Puppeteer moves actual Selection boundaries and observes synchronous state" $ selectionValues == "[[[\"forward\",\"red\"],[\"forward\",\"red panda\"]],0,9]"
        lockValues <- Browser.evaluateString page "(async()=>{const manager=navigator.locks,trace=[];let entered,release;const ready=new Promise(resolve=>entered=resolve);const first=manager.request('automation-lock',lock=>{trace.push(lock.name+':'+lock.mode);entered();return new Promise(resolve=>release=()=>resolve('first'))});await ready;const second=manager.request('automation-lock',lock=>{trace.push('next:'+lock.mode);return 'second'});const snapshot=await manager.query();release();const results=await Promise.all([first,second]);return JSON.stringify([trace,results,snapshot.held.map(lock=>[lock.name,lock.mode]),snapshot.pending.map(lock=>[lock.name,lock.mode])])})()"
        assert "PureScript Puppeteer holds a real lock until its callback Promise settles" $ lockValues == "[[\"automation-lock:exclusive\",\"next:exclusive\"],[\"first\",\"second\"],[[\"automation-lock\",\"exclusive\"]],[[\"automation-lock\",\"exclusive\"]]]"
        schedulerValues <- Browser.evaluateString page "(async()=>{const controller=new TaskController({priority:'background'}),events=[];controller.signal.addEventListener('prioritychange',event=>events.push([event.previousPriority,controller.signal.priority,event.isTrusted]));controller.setPriority('user-blocking');const canceled=new TaskController();let ran=false;const pending=scheduler.postTask(()=>{ran=true},{signal:canceled.signal,delay:10});canceled.abort('owned cancellation');const reason=await pending.catch(error=>error),value=await scheduler.postTask(()=>42,{signal:controller.signal});return JSON.stringify([events,value,reason,ran,controller.signal.priority])})()"
        assert "PureScript Puppeteer executes real Scheduler tasks and cancels queued work" $ schedulerValues == "[[[\"background\",\"user-blocking\",true]],42,\"owned cancellation\",false,\"user-blocking\"]"
        cryptoValues <- Browser.evaluateString page "(async()=>{const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('abc')),hex=Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join(''),key=await crypto.subtle.importKey('raw',new Uint8Array(16),'AES-GCM',false,['encrypt','decrypt']),data=new Uint8Array([1,2,3]),iv=new Uint8Array(12),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,data),copy=structuredClone(key),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},copy,encrypted);return JSON.stringify([hex,Array.from(new Uint8Array(plain)),copy!==key,copy instanceof CryptoKey,copy.algorithm.name])})()"
        assert "PureScript Puppeteer performs real hashing and encryption with a cloned private CryptoKey" $ cryptoValues == "[\"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad\",[1,2,3],true,true,\"AES-GCM\"]"
        rangeValues <- Browser.evaluateString page "(()=>{const host=document.createElement('div');host.style.cssText='width:200px;font-size:20px;white-space:pre';host.textContent='red panda';document.body.append(host);const range=document.createRange();range.setStart(host.firstChild,0);range.setEnd(host.firstChild,3);const rects=range.getClientRects(),bounds=range.getBoundingClientRect(),result=[Array.isArray(rects),rects[0] instanceof DOMRect,rects[0].width,rects[0].height,bounds.width];range.collapse(true);result.push(range.getClientRects().length,range.getBoundingClientRect().width,range.getBoundingClientRect().height);host.remove();return JSON.stringify(result)})()"
        assert "PureScript Puppeteer reads genuine selected text fragments and collapsed Range bounds" $ rangeValues == "[true,true,36,24,36,0,0,0]"
        void $ Browser.goto page url
        cookieStoreValues <- Browser.evaluateString page "(async()=>{const store=cookieStore,name='automation-store';await store.delete(name);const changed=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('CookieStore event deadline')),3000);const listener=event=>{const value=event.changed.find(item=>item.name===name);if(!value)return;store.removeEventListener('change',listener);clearTimeout(timer);resolve([event.isTrusted,value.value])};store.addEventListener('change',listener)});await store.set({name,value:'panda',sameSite:'strict',path:'/'});const event=await changed,cookie=await store.get(name),result=JSON.stringify([cookie.name,cookie.value,cookie.sameSite,cookie.path,event]);await store.delete(name);return result})()"
        assert "PureScript Puppeteer reads actual CookieStore state and trusted mutation events" $ cookieStoreValues == "[\"automation-store\",\"panda\",\"strict\",\"/\",[true,\"panda\"]]"
        workerValues <- Browser.evaluateString page "new Promise((resolve,reject)=>{const url=URL.createObjectURL(new Blob([\"(async()=>{const c=new AbortController(),events=[];c.signal.addEventListener('abort',event=>events.push([event.isTrusted,event.target===c.signal,c.signal.reason.name]));const dependent=AbortSignal.any([c.signal]);c.abort();const control=new TaskController(),value=await scheduler.postTask(()=>42,{signal:control.signal}),exception=new DOMException('real','AbortError');postMessage([c.signal instanceof EventTarget,c.signal.aborted,c.signal.reason instanceof DOMException,dependent.reason===c.signal.reason,exception instanceof Error,value,events]);close()})().catch(error=>{postMessage({error:String(error)});close()})\"],{type:'text/javascript'})),worker=new Worker(url);const cleanup=()=>{worker.terminate();URL.revokeObjectURL(url)};const timer=setTimeout(()=>{cleanup();reject(Error('Worker task deadline'))},5000);worker.onmessage=event=>{clearTimeout(timer);cleanup();resolve(JSON.stringify(event.data))};worker.onerror=event=>{clearTimeout(timer);cleanup();reject(Error(event.message))}})"
        assert "PureScript Puppeteer observes genuine Worker abort, exception and Scheduler objects" $ workerValues == "[true,true,true,true,true,42,[[true,true,\"AbortError\"]]]"
        audioGraphValues <- Browser.evaluateString page "(async()=>{const c=new OfflineAudioContext(1,4,8000),source=c.createConstantSource(),gain=c.createGain();source.offset.value=2;gain.gain.value=0.25;source.connect(gain).connect(c.destination);source.start();const b=await c.startRendering();return JSON.stringify([b.length,Array.from(b.getChannelData(0))])})()"
        assert "PureScript Puppeteer renders actual connected gain and constant-source samples" $ audioGraphValues == "[4,[0.5,0.5,0.5,0.5]]"
        decodedValues <- Browser.evaluateString page "(async()=>{const c=new OfflineAudioContext(1,2,8000),input=new ArrayBuffer(48),v=new DataView(input);for(const[at,text]of[[0,'RIFF'],[8,'WAVEfmt '],[36,'data']])for(let i=0;i<text.length;i++)v.setUint8(at+i,text.charCodeAt(i));v.setUint32(4,40,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);v.setUint32(40,4,true);v.setInt16(44,16384,true);v.setInt16(46,-16384,true);const b=await c.decodeAudioData(input);return JSON.stringify([b instanceof AudioBuffer,b.sampleRate,Array.from(b.getChannelData(0)),input.byteLength])})()"
        assert "PureScript Puppeteer decodes actual PCM bytes into a genuine AudioBuffer" $ decodedValues == "[true,8000,[0.5,-0.5],48]"
        mediaPlaybackValues <- Browser.evaluateString page "(async()=>{const v=document.createElement('video'),events=[];for(const type of['play','playing'])v.addEventListener(type,e=>events.push([e.type,e.isTrusted]));await v.play();const playing=[v.paused,v.readyState,v.networkState];v.pause();return JSON.stringify([events,playing,v.paused])})()"
        assert "PureScript Puppeteer observes actual media transitions and synchronous events" $ mediaPlaybackValues == "[[[\"play\",false],[\"playing\",false]],[false,4,1],true]"
        paymentValues <- Browser.evaluateString page "(async()=>{const request=new PaymentRequest([{supportedMethods:'basic-card'}],{total:{label:'Total',amount:{currency:'USD',value:'1'}}}),available=await request.canMakePayment();let first,next;try{await request.show()}catch(e){first=e.name}try{await request.show()}catch(e){next=e.name}return JSON.stringify([request instanceof EventTarget,available,first,next])})()"
        assert "PureScript Puppeteer verifies the measured no-service Payment Request lifecycle" $ paymentValues == "[true,false,\"NotSupportedError\",\"InvalidStateError\"]"
        databaseValues <- Browser.evaluateString page "(async()=>{const name='red-panda-automation',db=await new Promise((resolve,reject)=>{const request=indexedDB.open(name,1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put({n:7,bytes:new Uint8Array([1,2])},'panda');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});const value=await new Promise((resolve,reject)=>{const request=db.transaction('records').objectStore('records').get('panda');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});const result=JSON.stringify([value.n,Array.from(value.bytes),Object.getPrototypeOf(value)===Object.prototype]);db.close();await new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(name);request.onsuccess=resolve;request.onerror=()=>reject(request.error)});return result})()"
        assert "PureScript Puppeteer writes and reads actual IndexedDB transactional bytes" $ databaseValues == "[7,[1,2],true]"
        sanitizedValues <- Browser.evaluateString page "(()=>{const host=document.createElement('div');host.setHTML('<p onclick=bad()>red<script>throw Error(1)</script><img src=x onerror=bad()><b>panda</b></p>');return JSON.stringify([host.textContent,host.querySelector('script')===null,host.firstChild.getAttribute('onclick'),host.querySelector('img')===null,host.firstChild.ownerDocument===document])})()"
        assert "PureScript Puppeteer sanitizes a real DOM subtree and removes unsafe handlers" $ sanitizedValues == "[\"redpanda\",true,null,true,true]"
        animationValues <- Browser.evaluateString page "(async()=>{const node=document.createElement('div'),a=node.animate([]);a.pause();const canceled=a.finished.catch(e=>e.name);a.cancel();const reason=await canceled,b=node.animate([]);b.pause();const event=new Promise(resolve=>b.onfinish=e=>resolve(e.isTrusted)),finished=b.finished;b.finish();const value=await finished;return JSON.stringify([a.playState,reason,b.playState,await event,value===b])})()"
        assert "PureScript Puppeteer observes real animation cancellation promises and finish events" $ animationValues == "[\"idle\",\"AbortError\",\"finished\",true,true]"
        popupValues <- Browser.evaluateString page "(()=>{const popup=open('','automation-popup');popup.document.write('<body>red panda');popup.document.close();const result=[popup.opener===window,popup.document.body.textContent,popup===open('','automation-popup')];popup.close();result.push(popup.closed);return JSON.stringify(result)})()"
        assert "PureScript Puppeteer creates, writes, reuses and closes a genuine popup document" $ popupValues == "[true,\"red panda\",true,true]"
        imageValues <- Browser.evaluateString page "new Promise((resolve,reject)=>{const img=new Image();img.onerror=()=>reject(Error('unexpected image error'));img.onload=e=>resolve(JSON.stringify([img.complete,img.currentSrc===new URL('/not-fetched.png',location.href).href,img.naturalWidth,e.isTrusted,e.target===img]));img.src='/not-fetched.png'})"
        assert "PureScript Puppeteer follows the measured default image selection event lifecycle" $ imageValues == "[true,true,0,true,true]"
        quantumAudioValues <- Browser.evaluateString page "(async()=>{const c=new OfflineAudioContext(1,16,8192),source=c.createConstantSource(),gain=c.createGain();gain.gain.setValueCurveAtTime([8,10],4/8192,4/8192);source.connect(gain).connect(c.destination);source.start();const samples=(await c.startRendering()).getChannelData(0);return JSON.stringify([samples.length,Array.from(samples).every(value=>value===1),gain.gain.value])})()"
        assert "PureScript Puppeteer observes actual quantum-rendered samples and intrinsic parameter state" $ quantumAudioValues == "[16,true,1]"
        publicEventRealmValues <- Browser.evaluateString page "(()=>{const event=new Event('actual');return JSON.stringify([Object.getPrototypeOf(Event)===Function.prototype,Object.getPrototypeOf(EventTarget.prototype.dispatchEvent)===Function.prototype,Object.getPrototypeOf(Object.getOwnPropertyDescriptor(Event.prototype,'type').get)===Function.prototype,event.isTrusted,Object.getOwnPropertySymbols(event).length])})()"
        assert "PureScript Puppeteer observes genuine Event interface realms and private backing" $ publicEventRealmValues == "[true,true,true,false,0]"
        eventSourceTransportValues <- Browser.evaluateString page $ "new Promise((resolve,reject)=>{const source=new EventSource(" <> show (fixtureStreamUrl fixture) <> ");const timer=setTimeout(()=>{source.close();reject(Error('SSE deadline'))},5000);source.onerror=()=>{clearTimeout(timer);source.close();reject(Error('SSE transport'))};source.addEventListener('panda',event=>{clearTimeout(timer);const row=[event.data,event.lastEventId,event.target===source,event.isTrusted];source.close();row.push(source.readyState);resolve(JSON.stringify(row))})})"
        assert "PureScript Puppeteer receives actual streamed SSE fields and closes the real transport" $ eventSourceTransportValues == "[\"red-panda\",\"17\",true,true,2]"
        socketTransportValues <- Browser.evaluateString page $ "new Promise((resolve,reject)=>{const socket=new WebSocket(" <> show (fixtureSocketUrl fixture) <> ");let row;const timer=setTimeout(()=>{socket.close();reject(Error('WebSocket deadline'))},5000);socket.onopen=()=>socket.send('red-panda');socket.onmessage=event=>{row=[event.data,event.isTrusted,event.target===socket];socket.close()};socket.onerror=()=>{clearTimeout(timer);socket.close();reject(Error('WebSocket transport'))};socket.onclose=()=>{clearTimeout(timer);row?resolve(JSON.stringify(row)):reject(Error('WebSocket closed before echo'))}})"
        assert "PureScript Puppeteer receives genuine WebSocket echo bytes and events" $ socketTransportValues == "[\"echo:red-panda\",true,true]"
        sharedWorkerValues <- Browser.evaluateString page "new Promise((resolve,reject)=>{const source=URL.createObjectURL(new Blob([\"let count=0;onconnect=event=>{const port=event.ports[0];port.onmessage=()=>port.postMessage(++count)}\"],{type:'text/javascript'})),first=new SharedWorker(source,'automation-shared'),second=new SharedWorker(source,'automation-shared');const cleanup=()=>{first.port.close();second.port.close();URL.revokeObjectURL(source)};const timer=setTimeout(()=>{cleanup();reject(Error('SharedWorker deadline'))},5000);first.port.onmessage=a=>{second.port.onmessage=b=>{clearTimeout(timer);const values=[a.data,b.data,a.isTrusted,b.target===second.port];cleanup();resolve(JSON.stringify(values))};second.port.postMessage('second')};first.port.postMessage('first')})"
        assert "PureScript Puppeteer shares actual worker state through genuine separate message ports" $ sharedWorkerValues == "[1,2,true,true]"
        streamingWasmValues <- Browser.evaluateString page "(async()=>{const bytes=new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11]),response=new Response(bytes,{headers:{'content-type':'application/wasm'}}),result=await WebAssembly.instantiateStreaming(response);return JSON.stringify([result.module instanceof WebAssembly.Module,result.instance instanceof WebAssembly.Instance,result.instance.exports.add(19,23),response.bodyUsed])})()"
        assert "PureScript Puppeteer compiles real streamed WebAssembly bytes and executes the exported function" $ streamingWasmValues == "[true,true,42,true]"
        workerBlobValues <- Browser.evaluateString page "new Promise((resolve,reject)=>{const source=URL.createObjectURL(new Blob([\"onmessage=()=>{const value=URL.createObjectURL(new Blob([new Uint8Array([3,1,4])],{type:'application/octet-stream'}));postMessage(value);close()}\"],{type:'text/javascript'})),worker=new Worker(source);const cleanup=()=>{worker.terminate();URL.revokeObjectURL(source)};const timer=setTimeout(()=>{cleanup();reject(Error('Worker Blob deadline'))},5000);worker.onerror=event=>{clearTimeout(timer);cleanup();reject(Error(event.message))};worker.onmessage=async event=>{clearTimeout(timer);cleanup();const value=event.data;try{const response=await fetch(value);resolve(JSON.stringify([response.type,Array.from(new Uint8Array(await response.arrayBuffer())),response.headers.get('content-type')]))}catch(error){reject(error)}finally{URL.revokeObjectURL(value)}};worker.postMessage('create')})"
        assert "PureScript Puppeteer reads actual worker-created Blob bytes after worker termination" $ workerBlobValues == "[\"basic\",[3,1,4],\"application/octet-stream\"]"
        Browser.closePage page
        log "PureScript Puppeteer integration: 87 checks passed"
