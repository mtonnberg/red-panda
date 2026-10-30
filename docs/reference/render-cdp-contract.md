# Native raw CDP rendering observations

Owned data-document probes use the verified native binary recorded in
`render-cdp-observations.json` and `render-cdp-option-observations.json`.
`render-cdp-pdf-inspection.json` records actual page sizes, text/font sizes and
positions parsed from the saved PDF artifacts. Stream-read `.bin` files are
partial byte chunks, not standalone PDFs.

`Page.captureScreenshot` returns `{data: base64PNG}`. Its default is one viewport
(1920x1080), including a newly created blank target. Device metrics 320x200 change
the returned viewport to 320x200. `captureBeyondViewport: true` returns full
content height (the measured long document is 320x6992); false/default stays at
320x200. PNG is supported; JPEG/WebP reject with code -32000 and message
`unsupported screenshot format.`

Clip `{x:10,y:20,width:100,height:50,scale:2}` returns a 200x100 PNG. Negative
origins are accepted. Clip y1200 reads content beyond viewport height even with
default captureBeyondViewport. A negative width is ignored, returning the normal
viewport. Scale zero rejects with code -31998, `InvalidScreenshotOptions`.

`Page.printToPDF` returns `{data: base64PDF}`. Default output is Letter 612x792;
landscape is 792x612. Paper 4x6 inches gives 288x432 points; all-zero margins put
the first text at x0. Individual margins are applied: left0.3in is x21.6pt and
top0.1in moves the heading baseline to y30.45pt. Default body/heading fonts are
12/24pt; scale0.5 gives 6/12pt and scale2 gives 24/48pt. Scale zero, a negative
margin and paperWidth zero reject with code -32602, `invalid print parameters`.

Page ranges operate on actual pages. `3,1,3` produces pages1 and3 in document
order; `-2` selects the first two and `2-` selects page2 through the end. Range
end beyond the document clamps (`1-999` is all pages). A range entirely beyond
the page count rejects with -32000, `Page range exceeds page count`. Zero and
reversed ranges reject with `Invalid page range`; nonnumeric syntax rejects with
`Invalid page range syntax` (both -32000). The observed header/footer templates
with displayHeaderFooter true do not appear in native output; the independent
backend explicitly rejects requested header/footer rendering.

`transferMode: ReturnAsStream` returns `{data:'',stream:'1'}` in the observed
connection. `IO.read` returns base64 `data`, `base64Encoded:true`, and `eof`; size
limits the byte count and offset0 restarts from the beginning. `IO.close` returns
`{}`. Reading a closed handle rejects with -32000, `Invalid stream handle`.
Handle numbering is connection-specific and should not be treated as a constant.

`LP.dump` returns `{format,content}` with base64 content for PNG/PDF. PNG defaults
to full-content height (1920x107 for the measured small document); selected h1
is 1920x72. Unknown format JPEG rejects with -31998 `InvalidEnumTag`. Missing PNG
selector and maxBytes with PNG reject with -31998 `InvalidParams`.

MCP screenshot differs from CDP viewport dimensions: inline image width is
clamped to1280, fullPage height is clamped to4096; path output uses full width.
The exact observed success result is:

```js
{
  content: [
    {type:'image', mimeType:'image/png', data:'<base64>'},
    {type:'text', text:'PNG, 1280x107'},
  ],
  isError:false,
}
```

Path success contains one text item:
`Saved 1920x107 PNG to <absolute path>`, with `isError:false`. Unloaded MCP
screenshots reject with -32604 `FrameNotLoaded: ...`; a missing selector rejects
with -32602 `NodeNotFound: ...`. This unloaded behavior differs from a blank CDP
target, where captureScreenshot/printToPDF produce actual blank artifacts.

These are bounded public-interface observations. They do not establish complete
CDP option coverage, pixel/font-byte equality, universal page-break equality or
general CSS rendering. The independent comparison records one scaling mismatch:
scale2 produces 27 independent pages versus 28 native pages for the long print
fixture. No extra page is fabricated to conceal that layout difference.
