module Main where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff, bracket, launchAff_)
import Effect.Class (liftEffect)
import Effect.Class.Console (log)
import RedPanda.Puppeteer as Browser

foreign import settings :: Effect { endpoint :: String, url :: String }

main :: Effect Unit
main = launchAff_ do
  config <- liftSettings
  bracket (Browser.connect config.endpoint) Browser.disconnect \browser ->
    bracket (Browser.createContext browser) Browser.closeContext \context -> do
      page <- Browser.newPage context
      status <- Browser.goto page config.url
      title <- Browser.evaluateString page "document.title"
      links <- Browser.evaluateString page "JSON.stringify(Array.from(document.links, a => a.href))"
      log $ "HTTP " <> show status <> " — " <> title
      log links

liftSettings :: Aff { endpoint :: String, url :: String }
liftSettings = liftEffect settings

