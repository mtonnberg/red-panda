module RedPanda.Puppeteer
  ( Browser, BrowserContext, Page, Frame, Response, PreloadScript, Header, ByteArray
  , connect, disconnect, createContext, closeContext, newPage, closePage
  , goto, gotoResponse, responseStatus, responseText
  , withNavigation, goBack, goForward, reload, pageUrl
  , childFrame, evaluateFrameString, gotoFrame, focusFrame
  , screenshot, pdf, byteLength, signature
  , evaluateOnNewDocument, removePreload
  , setExtraHTTPHeaders, setUserAgent
  , click, focus, typeText, pressKey, insertText
  , evaluateString, textContent, waitForSelector, dispatchClick, content, cookieNames, setCookie
  , Async, fromAsync, quote
  ) where

import Prelude

import Data.Either (Either(..))
import Effect (Effect)
import Effect.Aff (Aff, Canceler(..), makeAff, bracket)
import Effect.Class (liftEffect)
import Effect.Exception (Error)

foreign import data Browser :: Type
foreign import data BrowserContext :: Type
foreign import data Page :: Type
foreign import data Frame :: Type
foreign import data Response :: Type
foreign import data PendingNavigation :: Type
foreign import data ByteArray :: Type

newtype PreloadScript = PreloadScript String

type Header = { name :: String, value :: String }

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
foreign import armNavigationImpl :: Page -> Effect PendingNavigation
foreign import awaitNavigationImpl :: PendingNavigation -> Async String
foreign import cancelNavigationImpl :: PendingNavigation -> Effect Unit
foreign import goBackImpl :: Page -> Async String
foreign import goForwardImpl :: Page -> Async String
foreign import reloadImpl :: Page -> Async String
foreign import pageUrlImpl :: Page -> Effect String
foreign import childFrameImpl :: Page -> Int -> Async Frame
foreign import evaluateFrameStringImpl :: Frame -> String -> Async String
foreign import gotoFrameImpl :: Frame -> String -> Async Int
foreign import focusFrameImpl :: Frame -> String -> Async Unit
foreign import screenshotImpl :: Page -> Boolean -> Async ByteArray
foreign import pdfImpl :: Page -> Async ByteArray
foreign import byteLength :: ByteArray -> Int
foreign import signature :: ByteArray -> String
foreign import responseStatus :: Response -> Int
foreign import responseTextImpl :: Response -> Async String
foreign import evaluateOnNewDocumentImpl :: Page -> String -> Async String
foreign import removePreloadImpl :: Page -> String -> Async Unit
foreign import setExtraHTTPHeadersImpl :: Page -> Array Header -> Async Unit
foreign import setUserAgentImpl :: Page -> String -> Async Unit
foreign import focusImpl :: Page -> String -> Async Unit
foreign import clickImpl :: Page -> String -> Async Unit
foreign import typeTextImpl :: Page -> String -> String -> Async Unit
foreign import pressKeyImpl :: Page -> String -> Async Unit
foreign import insertTextImpl :: Page -> String -> Async Unit
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

-- Arm the listener before the action can trigger a navigation; always cancel it
-- on failure so a failed click/evaluation does not leave a watcher behind.
withNavigation :: forall a. Page -> Aff a -> Aff String
withNavigation page action = bracket
  (liftEffect $ armNavigationImpl page)
  (liftEffect <<< cancelNavigationImpl)
  \pending -> do
    void action
    fromAsync $ awaitNavigationImpl pending

goBack :: Page -> Aff String
goBack page = fromAsync $ goBackImpl page

goForward :: Page -> Aff String
goForward page = fromAsync $ goForwardImpl page

reload :: Page -> Aff String
reload page = fromAsync $ reloadImpl page

pageUrl :: Page -> Aff String
pageUrl page = liftEffect $ pageUrlImpl page

childFrame :: Page -> Int -> Aff Frame
childFrame page index = fromAsync $ childFrameImpl page index

evaluateFrameString :: Frame -> String -> Aff String
evaluateFrameString frame expression = fromAsync $ evaluateFrameStringImpl frame expression

gotoFrame :: Frame -> String -> Aff Int
gotoFrame frame url = fromAsync $ gotoFrameImpl frame url

focusFrame :: Frame -> String -> Aff Unit
focusFrame frame selector = fromAsync $ focusFrameImpl frame selector

screenshot :: Page -> Boolean -> Aff ByteArray
screenshot page fullPage = fromAsync $ screenshotImpl page fullPage

pdf :: Page -> Aff ByteArray
pdf page = fromAsync $ pdfImpl page

responseText :: Response -> Aff String
responseText response = fromAsync $ responseTextImpl response

evaluateOnNewDocument :: Page -> String -> Aff PreloadScript
evaluateOnNewDocument page source = PreloadScript <$> fromAsync (evaluateOnNewDocumentImpl page source)

removePreload :: Page -> PreloadScript -> Aff Unit
removePreload page (PreloadScript identifier) = fromAsync $ removePreloadImpl page identifier

setExtraHTTPHeaders :: Page -> Array Header -> Aff Unit
setExtraHTTPHeaders page headers = fromAsync $ setExtraHTTPHeadersImpl page headers

setUserAgent :: Page -> String -> Aff Unit
setUserAgent page userAgent = fromAsync $ setUserAgentImpl page userAgent

focus :: Page -> String -> Aff Unit
focus page selector = fromAsync $ focusImpl page selector

click :: Page -> String -> Aff Unit
click page selector = fromAsync $ clickImpl page selector

typeText :: Page -> String -> String -> Aff Unit
typeText page selector text = fromAsync $ typeTextImpl page selector text

pressKey :: Page -> String -> Aff Unit
pressKey page key = fromAsync $ pressKeyImpl page key

insertText :: Page -> String -> Aff Unit
insertText page text = fromAsync $ insertTextImpl page text

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
