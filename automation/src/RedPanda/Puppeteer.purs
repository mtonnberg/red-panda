module RedPanda.Puppeteer
  ( Browser, BrowserContext, Page, Response, PreloadScript
  , connect, disconnect, createContext, closeContext, newPage, closePage
  , goto, gotoResponse, responseStatus, responseText
  , evaluateOnNewDocument, removePreload
  , evaluateString, textContent, waitForSelector, dispatchClick, content, cookieNames, setCookie
  , Async, fromAsync, quote
  ) where

import Prelude

import Data.Either (Either(..))
import Effect (Effect)
import Effect.Aff (Aff, Canceler(..), makeAff)
import Effect.Class (liftEffect)
import Effect.Exception (Error)

foreign import data Browser :: Type
foreign import data BrowserContext :: Type
foreign import data Page :: Type
foreign import data Response :: Type

newtype PreloadScript = PreloadScript String

-- The FFI only adapts promises. Resource lifetime and the workflow live here.
type Async a = (Error -> Effect Unit) -> (a -> Effect Unit) -> Effect (Effect Unit)

fromAsync :: forall a. Async a -> Aff a
fromAsync action = makeAff \done -> do
  cancel <- action (done <<< Left) (done <<< Right)
  pure $ Canceler \_ -> liftEffect cancel

foreign import connectImpl :: String -> Async Browser
foreign import disconnectImpl :: Browser -> Effect Unit
foreign import createContextImpl :: Browser -> Async BrowserContext
foreign import closeContextImpl :: BrowserContext -> Async Unit
foreign import newPageImpl :: BrowserContext -> Async Page
foreign import closePageImpl :: Page -> Async Unit
foreign import gotoImpl :: Page -> String -> Async Int
foreign import gotoResponseImpl :: Page -> String -> Async Response
foreign import responseStatus :: Response -> Int
foreign import responseTextImpl :: Response -> Async String
foreign import evaluateOnNewDocumentImpl :: Page -> String -> Async String
foreign import removePreloadImpl :: Page -> String -> Async Unit
foreign import evaluateStringImpl :: Page -> String -> Async String
foreign import waitForSelectorImpl :: Page -> String -> Async Unit
foreign import contentImpl :: Page -> Async String
foreign import setCookieImpl :: BrowserContext -> String -> String -> String -> Async Unit
foreign import cookieNamesImpl :: BrowserContext -> Async (Array String)

connect :: String -> Aff Browser
connect endpoint = fromAsync $ connectImpl endpoint

disconnect :: Browser -> Aff Unit
disconnect browser = liftEffect $ disconnectImpl browser

createContext :: Browser -> Aff BrowserContext
createContext browser = fromAsync $ createContextImpl browser

closeContext :: BrowserContext -> Aff Unit
closeContext context = fromAsync $ closeContextImpl context

newPage :: BrowserContext -> Aff Page
newPage context = fromAsync $ newPageImpl context

closePage :: Page -> Aff Unit
closePage page = fromAsync $ closePageImpl page

goto :: Page -> String -> Aff Int
goto page url = fromAsync $ gotoImpl page url

gotoResponse :: Page -> String -> Aff Response
gotoResponse page url = fromAsync $ gotoResponseImpl page url

responseText :: Response -> Aff String
responseText response = fromAsync $ responseTextImpl response

evaluateOnNewDocument :: Page -> String -> Aff PreloadScript
evaluateOnNewDocument page source = PreloadScript <$> fromAsync (evaluateOnNewDocumentImpl page source)

removePreload :: Page -> PreloadScript -> Aff Unit
removePreload page (PreloadScript identifier) = fromAsync $ removePreloadImpl page identifier

evaluateString :: Page -> String -> Aff String
evaluateString page expression = fromAsync $ evaluateStringImpl page expression

textContent :: Page -> String -> Aff String
textContent page selector = evaluateString page $
  "document.querySelector(" <> quote selector <> ").textContent"

waitForSelector :: Page -> String -> Aff Unit
waitForSelector page selector = fromAsync $ waitForSelectorImpl page selector

-- Dispatch a DOM event; no viewport, coordinates or layout are involved.
dispatchClick :: Page -> String -> Aff Unit
dispatchClick page selector = void $ evaluateString page $
  "document.querySelector(" <> quote selector <> ").click(); ''"

foreign import quote :: String -> String

content :: Page -> Aff String
content page = fromAsync $ contentImpl page

setCookie :: BrowserContext -> String -> String -> String -> Aff Unit
setCookie context url name value = fromAsync $ setCookieImpl context url name value

cookieNames :: BrowserContext -> Aff (Array String)
cookieNames context = fromAsync $ cookieNamesImpl context
