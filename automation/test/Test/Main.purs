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
        Browser.closePage page
        log "PureScript Puppeteer integration: 47 checks passed"
