module RedPanda.Puppeteer
  ( Browser, BrowserContext, Page, Frame, Response, JSHandle, ElementHandle, PreloadScript, Header, ByteArray, Cookie
  , Permission(..), GeolocationOptions
  , connect, disconnect, createContext, closeContext, newPage, closePage
  , goto, gotoResponse, responseStatus, responseText, responseBytes
  , withNavigation, goBack, goForward, reload, pageUrl
  , childFrame, evaluateFrameString, gotoFrame, focusFrame
  , screenshot, pdf, byteLength, signature
  , evaluateOnNewDocument, removePreload
  , setExtraHTTPHeaders, setUserAgent
  , overridePermissions, clearPermissionOverrides, setGeolocation, clearGeolocation
  , click, focus, typeText, pressKey, insertText
  , UtilityWorld, withUtilityWorld, evaluateUtilityString
  , evaluateString, textContent, waitForSelector, waitForFunction, dispatchClick, content, cookieNames, setCookie
  , cookies, cookieName, cookieValue, deleteCookie
  , evaluateHandle, queryObjects, evaluateHandleString, disposeHandle, withHandle
  , queryElement, withElementHandle, uploadFiles, disposeElementHandle, elementHandleDisposed
  , Async, fromAsync, quote
  ) where

import Prelude

import Data.Either (Either(..))
import Effect (Effect)
import Effect.Aff (Aff, Canceler(..), makeAff, bracket, throwError)
import Effect.Class (liftEffect)
import Effect.Exception (Error, error)

foreign import data Browser :: Type
foreign import data BrowserContext :: Type
foreign import data Page :: Type
foreign import data Frame :: Type
foreign import data Response :: Type
foreign import data JSHandle :: Type
foreign import data ElementHandle :: Type
foreign import data PendingNavigation :: Type
foreign import data ByteArray :: Type
foreign import data ProtocolSession :: Type
foreign import data Cookie :: Type

-- This bounded enum exposes the permissions exercised against this backend.
data Permission = GeolocationPermission | NotificationsPermission

type GeolocationOptions = { latitude :: Number, longitude :: Number, accuracy :: Number }

newtype UtilityWorld = UtilityWorld { session :: ProtocolSession, contextId :: Int }

foreign import createProtocolSessionImpl :: Page -> Async ProtocolSession
foreign import detachProtocolSessionImpl :: ProtocolSession -> Async Unit
foreign import getFrameTreeImpl :: ProtocolSession -> Async { frameTree :: { frame :: { id :: String } } }
foreign import createUtilityWorldImpl :: ProtocolSession -> { frameId :: String, worldName :: String } -> Async { executionContextId :: Int }
foreign import evaluateUtilityStringImpl :: ProtocolSession -> Int -> String -> Async String

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
foreign import responseBytesImpl :: Response -> Async ByteArray
foreign import evaluateOnNewDocumentImpl :: Page -> String -> Async String
foreign import removePreloadImpl :: Page -> String -> Async Unit
foreign import setExtraHTTPHeadersImpl :: Page -> Array Header -> Async Unit
foreign import setUserAgentImpl :: Page -> String -> Async Unit
foreign import overridePermissionsImpl :: BrowserContext -> String -> Array String -> Async Unit
foreign import clearPermissionOverridesImpl :: BrowserContext -> Async Unit
foreign import setGeolocationImpl :: Page -> GeolocationOptions -> Async Unit
foreign import clearGeolocationImpl :: Page -> Async Unit
foreign import focusImpl :: Page -> String -> Async Unit
foreign import clickImpl :: Page -> String -> Async Unit
foreign import typeTextImpl :: Page -> String -> String -> Async Unit
foreign import pressKeyImpl :: Page -> String -> Async Unit
foreign import insertTextImpl :: Page -> String -> Async Unit
foreign import evaluateStringImpl :: Page -> String -> Async String
foreign import evaluateHandleImpl :: Page -> String -> Async JSHandle
foreign import queryObjectsImpl :: Page -> JSHandle -> Async JSHandle
foreign import evaluateHandleStringImpl :: JSHandle -> String -> Async String
foreign import disposeHandleImpl :: JSHandle -> Async Unit
foreign import queryElementImpl :: forall a. a -> (ElementHandle -> a) -> Page -> String -> Async a
foreign import uploadFilesImpl :: ElementHandle -> Array String -> Async Unit
foreign import disposeElementHandleImpl :: ElementHandle -> Async Unit
foreign import elementHandleDisposed :: ElementHandle -> Effect Boolean
foreign import waitForSelectorImpl :: Page -> String -> Async Unit
foreign import waitForFunctionImpl :: Page -> String -> Async Unit
foreign import contentImpl :: Page -> Async String
foreign import setCookieImpl :: BrowserContext -> String -> String -> String -> Async Unit
foreign import cookieNamesImpl :: BrowserContext -> Async (Array String)
foreign import cookiesImpl :: BrowserContext -> Async (Array Cookie)
foreign import cookieName :: Cookie -> String
foreign import cookieValue :: Cookie -> String
foreign import deleteCookieImpl :: BrowserContext -> Cookie -> Async Unit

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

-- PureScript owns protocol-session lifetime and world setup; FFI adapts each call.
withUtilityWorld :: forall a. Page -> (UtilityWorld -> Aff a) -> Aff a
withUtilityWorld page action = bracket
  (fromAsync $ createProtocolSessionImpl page)
  (fromAsync <<< detachProtocolSessionImpl)
  \session -> do
    tree <- fromAsync $ getFrameTreeImpl session
    created <- fromAsync $ createUtilityWorldImpl session { frameId: tree.frameTree.frame.id, worldName: "purescript-utility" }
    action $ UtilityWorld { session, contextId: created.executionContextId }

evaluateUtilityString :: UtilityWorld -> String -> Aff String
evaluateUtilityString (UtilityWorld world) expression = fromAsync $ evaluateUtilityStringImpl world.session world.contextId expression

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

responseBytes :: Response -> Aff ByteArray
responseBytes response = fromAsync $ responseBytesImpl response

evaluateOnNewDocument :: Page -> String -> Aff PreloadScript
evaluateOnNewDocument page source = PreloadScript <$> fromAsync (evaluateOnNewDocumentImpl page source)

removePreload :: Page -> PreloadScript -> Aff Unit
removePreload page (PreloadScript identifier) = fromAsync $ removePreloadImpl page identifier

setExtraHTTPHeaders :: Page -> Array Header -> Aff Unit
setExtraHTTPHeaders page headers = fromAsync $ setExtraHTTPHeadersImpl page headers

setUserAgent :: Page -> String -> Aff Unit
setUserAgent page userAgent = fromAsync $ setUserAgentImpl page userAgent

permissionName :: Permission -> String
permissionName GeolocationPermission = "geolocation"
permissionName NotificationsPermission = "notifications"

overridePermissions :: BrowserContext -> String -> Array Permission -> Aff Unit
overridePermissions context origin permissions = fromAsync $ overridePermissionsImpl context origin (map permissionName permissions)

clearPermissionOverrides :: BrowserContext -> Aff Unit
clearPermissionOverrides context = fromAsync $ clearPermissionOverridesImpl context

setGeolocation :: Page -> GeolocationOptions -> Aff Unit
setGeolocation page options = fromAsync $ setGeolocationImpl page options

clearGeolocation :: Page -> Aff Unit
clearGeolocation page = fromAsync $ clearGeolocationImpl page

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

evaluateHandle :: Page -> String -> Aff JSHandle
evaluateHandle page expression = fromAsync $ evaluateHandleImpl page expression

queryObjects :: Page -> JSHandle -> Aff JSHandle
queryObjects page prototype = fromAsync $ queryObjectsImpl page prototype

evaluateHandleString :: JSHandle -> String -> Aff String
evaluateHandleString handle expression = fromAsync $ evaluateHandleStringImpl handle expression

disposeHandle :: JSHandle -> Aff Unit
disposeHandle handle = fromAsync $ disposeHandleImpl handle

withHandle :: forall a. Aff JSHandle -> (JSHandle -> Aff a) -> Aff a
withHandle acquire = bracket acquire disposeHandle

-- Selector lookup, missing-element policy and handle lifetime belong to PS.
queryElement :: Page -> String -> Aff ElementHandle
queryElement page selector = do
  result <- fromAsync $ queryElementImpl (Left unit) Right page selector
  case result of
    Left _ -> throwError $ error $ "No element matches selector: " <> selector
    Right handle -> pure handle

withElementHandle :: forall a. Page -> String -> (ElementHandle -> Aff a) -> Aff a
withElementHandle page selector = bracket (queryElement page selector) disposeElementHandle

uploadFiles :: ElementHandle -> Array String -> Aff Unit
uploadFiles handle paths = fromAsync $ uploadFilesImpl handle paths

disposeElementHandle :: ElementHandle -> Aff Unit
disposeElementHandle handle = fromAsync $ disposeElementHandleImpl handle

textContent :: Page -> String -> Aff String
textContent page selector = evaluateString page $
  "document.querySelector(" <> quote selector <> ").textContent"

waitForFunction :: Page -> String -> Aff Unit
waitForFunction page expression = fromAsync $ waitForFunctionImpl page expression

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

cookies :: BrowserContext -> Aff (Array Cookie)
cookies context = fromAsync $ cookiesImpl context

-- Delete the actual complete Cookie produced by context.cookies().
deleteCookie :: BrowserContext -> Cookie -> Aff Unit
deleteCookie context cookie = fromAsync $ deleteCookieImpl context cookie
