module Test.Upload (uploadChecks) where

import Prelude

import Data.Either (Either(..))
import Effect.Aff (Aff, attempt, bracket, throwError)
import Effect.Class (liftEffect)
import Effect.Class.Console (log)
import Effect.Exception (error)
import RedPanda.Puppeteer as Browser

foreign import data UploadFixture :: Type
foreign import createFilesImpl :: Browser.Async UploadFixture
foreign import removeFilesImpl :: UploadFixture -> Browser.Async Unit
foreign import uploadPaths :: UploadFixture -> Array String
foreign import firstPath :: UploadFixture -> String
foreign import missingPath :: UploadFixture -> String

assert :: String -> Boolean -> Aff Unit
assert label ok = if ok then log $ "PASS " <> label else throwError $ error $ "FAIL " <> label

-- Disk fixture FFI owns no Puppeteer operations. PS acquires each resource,
-- chooses the selector/path vector, sequences uploads and checks actual values.
uploadChecks :: Browser.Browser -> String -> Aff Unit
uploadChecks browser origin =
  bracket (Browser.fromAsync createFilesImpl) (Browser.fromAsync <<< removeFilesImpl) \fixture ->
    bracket (Browser.createContext browser) Browser.closeContext \context ->
      bracket (Browser.newPage context) Browser.closePage \page -> do
        status <- Browser.goto page $ origin <> "/capability"
        assert "upload checks navigate a real isolated context" $ status == 200
        initial <- Browser.evaluateString page "(()=>{document.body.innerHTML='<form><input id=ps-upload-input type=file multiple></form>';const input=document.getElementById('ps-upload-input');globalThis.psUploadList=input.files;globalThis.psUploadEvents=[];for(const type of ['input','change'])input.addEventListener(type,event=>psUploadEvents.push([event.type,event.isTrusted]));return JSON.stringify([input.type,input.multiple,input.files.length,input.files instanceof FileList])})()"
        assert "upload starts with a genuine empty multiple-file control" $ initial == "[\"file\",true,0,true]"
        released <- Browser.withElementHandle page "#ps-upload-input" \handle -> do
          Browser.uploadFiles handle $ uploadPaths fixture
          metadata <- Browser.evaluateString page "(()=>{const list=document.getElementById('ps-upload-input').files;globalThis.psUploadFirst=list[0];globalThis.psUploadSecond=list[1];return JSON.stringify([list===psUploadList,list instanceof FileList,list.length,Array.from(list,file=>file.name),Array.from(list,file=>file.type),Array.from(list,file=>file.size),Array.from(list,file=>file.lastModified),list[0]===list.item(0),list[1]===list.item(1)])})()"
          assert "upload reads disk metadata into the same real FileList" $ metadata == "[true,true,2,[\"alpha.txt\",\"binary.redpanda\"],[\"text/plain\",\"application/octet-stream\"],[3,5],[1700000000125,1700000000125],true,true]"
          bytes <- Browser.evaluateString page "Promise.all(Array.from(document.getElementById('ps-upload-input').files,file=>file.arrayBuffer().then(buffer=>Array.from(new Uint8Array(buffer))))).then(JSON.stringify)"
          assert "upload retains exact nonUTF8 and NUL bytes from both real files" $ bytes == "[[65,0,255],[3,1,4,0,128]]"
          events <- Browser.evaluateString page "JSON.stringify(psUploadEvents)"
          assert "nonempty Puppeteer upload dispatches real trusted input then change" $ events == "[[\"input\",true],[\"change\",true]]"
          failed <- attempt $ Browser.uploadFiles handle [ firstPath fixture, missingPath fixture ]
          assert "a later missing disk path rejects the actual uploadFile call" $ case failed of
            Left _ -> true
            Right _ -> false
          retained <- Browser.evaluateString page "(()=>{const list=document.getElementById('ps-upload-input').files;return JSON.stringify([list===psUploadList,list[0]===psUploadFirst,list[1]===psUploadSecond,list.length,Array.from(list,file=>file.name),psUploadEvents.length])})()"
          assert "missing-path upload is atomic for FileList identity, files and events" $ retained == "[true,true,true,2,[\"alpha.txt\",\"binary.redpanda\"],2]"
          -- Actual Puppeteer handles [] through utility DataTransfer and authored
          -- events. Keep this real branch; it requires the separate utility API.
          Browser.uploadFiles handle []
          cleared <- Browser.evaluateString page "(()=>{const input=document.getElementById('ps-upload-input');return JSON.stringify([input.files===psUploadList,input.files instanceof FileList,input.files.length,input.files.item(0),input.value])})()"
          assert "empty Puppeteer upload clears actual stable selection" $ cleared == "[true,true,0,null,\"\"]"
          emptyEvents <- Browser.evaluateString page "JSON.stringify(psUploadEvents)"
          assert "Puppeteer's empty branch preserves genuine authored event trust" $ emptyEvents == "[[\"input\",true],[\"change\",true],[\"input\",false],[\"change\",false]]"
          Browser.uploadFiles handle []
          repeated <- Browser.evaluateString page "JSON.stringify(psUploadEvents)"
          assert "repeated empty upload executes the real client branch again" $ repeated == "[[\"input\",true],[\"change\",true],[\"input\",false],[\"change\",false],[\"input\",false],[\"change\",false]]"
          pure handle
        disposed <- liftEffect $ Browser.elementHandleDisposed released
        assert "PS bracket releases the actual Puppeteer ElementHandle" disposed
        absent <- attempt $ Browser.withElementHandle page "#missing-upload-control" \_ -> pure unit
        assert "PS selector acquisition rejects a missing element" $ case absent of
          Left _ -> true
          Right _ -> false
        log "PureScript Puppeteer upload: 12 checks passed"
