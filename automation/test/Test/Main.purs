module Test.Main where

import Prelude

import Data.Foldable (elem)
import Effect (Effect)
import Effect.Aff (Aff, bracket, launchAff_, throwError)
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
        Browser.closePage page
        log "PureScript Puppeteer integration: 17 checks passed"
