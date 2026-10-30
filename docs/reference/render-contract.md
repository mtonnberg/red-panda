# Independent text-only PNG and PDF renderer

`src/render.js` exports `renderDocument(document, options)` and
`getRenderBackendInfo(options)`. Both are asynchronous. `renderDocument` returns
real artifact `bytes` (Buffer), `format`, `mimeType`, `width`, `height`,
`contentHeight`, `pageCount`, `lineCount`, `clipped`, `missingGlyphs` (Unicode code
points), `backend` version metadata, and captured visible `text`.
PDF results also include `totalPageCount` and one-based `selectedPages`.

Options:

```js
await renderDocument(document, {
  format: 'png',             // png or pdf
  selector: undefined,       // first CSS match, or pass an actual node instead
  node: undefined,
  width: 1920, height: 1080, // PNG viewport
  fullPage: true,            // false uses viewport height, cropping real content
  inline: false,            // true clamps width to 1280 and height to 4096
  clip: undefined,          // PNG {x,y,width,height,scale}, using original layout
  stripModes: [],            // clutter/css/js/invisible/shell/ui
  strip: undefined,          // alternatively an MCP-style Boolean strip object
  fontFamily: 'sans',        // fixed DejaVu sans or mono, never a page file path
  paperWidth: 612, paperHeight: 792, paperMargin: 28.8,
  marginTop: 28.8, marginBottom: 28.8, marginLeft: 28.8, marginRight: 28.8,
  landscape: false, PDFscale: 1, pageRanges: '',
  timeout: 15000, signal: undefined,
  pythonExecutable: 'python3', // trusted embedding/runtime configuration only
})
```

The Node module extracts actual DOM text and semantic font runs. The backend
`native/render_backend.py` receives JSON through stdin, never HTML, JavaScript or
shell commands. It measures real TrueType glyphs, wraps lines, draws real
Pillow/FreeType glyph pixels, and builds ReportLab PDFs with embedded TrueType
fonts and selectable text. PDF ActualText marked content preserves Unicode
selection, including astral characters and text whose visual glyph is unavailable.
Unsupported visual glyphs remain explicit in `missingGlyphs`; the renderer does
not claim complete font coverage. Only fixed installed DejaVu font paths are used.
No page-supplied file path, external image or font is opened. `renderFonts` with
additional fonts throws `RENDER_FONT_UNSUPPORTED` pending an implemented font
selection contract.

PNG clips crop the existing viewport-width text layout, preserving line breaks.
Crop coordinates can reach content beyond viewport height. Scale rasterizes actual
glyphs at the requested size; it does not reflow text into the clip rectangle.
Positive clip sizes produce the requested scaled dimensions, including negative
origins with a white background outside the source. As observed natively,
non-positive clip dimensions are ignored and a zero scale rejects. Inline clip
combination is explicitly unsupported. Clip scale is bounded above by 8.

PDF paper sizes and four margins use points. Landscape swaps paper dimensions,
and PDFscale (0.1..2) changes actual fonts, spacing, wrapping and pagination while
keeping paper and margins fixed. Page ranges select actual paginated content,
support comma-separated numbers/ranges and open ends (`-2`, `2-`), sort and
deduplicate, and clamp end values to the page count. Invalid syntax, zero/reversed
ranges and selections entirely beyond the document raise explicit errors with
the measured native messages. Snapshot text/line-count metadata still describes
the source document; selectedPages identifies the pages present in the artifact.
Header/footer rendering requests reject with `RENDER_OPTION_UNSUPPORTED`.

Rendering leaves the source DOM intact. Head/script/style/template content,
display:none, hidden and aria-hidden text are excluded. Native observed rendering
retains visibility:hidden text; this adapter follows that behavior. Semantic
headings, bold/italic/code, lists, line breaks, basic table rows, image alt and
button text are represented. Input values are omitted as in the observed native
fixture. Authored CSS font family/size/weight/colour are ignored, also matching the
observed native fixture. This is a text flow renderer, not the geometry adapter or
a general CSS renderer. Shell/clutter use an independent content heuristic.

Native observations use the verified executable
`/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux`, version
`1.1.0-nightly.11326+948d77378`, SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
Owned data fixtures, PNG/PDF artifacts and MCP schemas/results are preserved under
`render-native-*` and `render-mcp-*`. No upstream engine production code was read
or copied for implementation. `render-independent-*` are actual independently
generated artifacts for inspection, not canned output returned by the runtime.

Measured native contracts:

- Fetch PNG/PDF without JSON writes raw binary bytes; JSON content is base64.
- Fetch PNG uses width 1920 and content height. The four measured fixtures have
  heights 202, 4544, 107 and 141; the independent renderer matches those dimensions.
- PDF is 1.4, US Letter 612x792, with selectable DejaVuSans regular/bold text,
  approximately 28.8pt margins and 12pt body/24pt heading fonts. The measured long
  fixture has 11 pages; the independent renderer also produces 11 pages with its
  first and final lines intact.
- MCP screenshot accepts path, selector/backendNodeId, fullPage, strip, url and
  timeout. The caller resolves node IDs, navigates, manages deadlines and writes
  paths; the renderer only returns bytes.
- Inline screenshot width is clamped to 1280 and height to 4096, without shrinking
  glyphs proportionally. The measured viewport is 1280x1080, small full-page
  image 1280x107, and long full-page image 1280x4096. Path output retains 1920x107
  for the same small full-page document. The helper exposes these choices through
  inline/fullPage/width/height. A selector targets its text content while viewport
  screenshots retain viewport dimensions.

These measurements do not establish pixel or full layout parity. Single-block
native heights expose a remaining vertical-metric gap: the native selected/full
h1 fixture is 72px while this flow model is 76px; a native single paragraph is 55px
while this model is 54px. A measured scale-2 PDF has 28 native pages and 27
independent pages; default/half-scale/margin cases have matching page counts.
Font rasterization, kerning, compression, PDF metadata,
subset font bytes, page-break positions, tables, bidirectional/complex text,
all HTML/CSS features, custom fallback fonts and arbitrary-page line metrics remain
unverified or different. The independent default font lacks some CJK/emoji glyphs;
selectable PDF text remains intact and missing visual glyphs are reported.

Bounds are explicit: PNG width 64..8192, viewport height 1..32768, 32Mi pixels,
200 PDF pages, one million input text characters, 20000 blocks, 100000 traversed
nodes/depth 256, and 30000 wrapped lines. Full output exceeding bounds fails rather
than silently truncating. Inline clipping follows its explicit screenshot limit.
Missing interpreter/packages/fonts, timeout, cancellation, invalid selectors and
unsupported requests raise RenderError with an explicit code. No placeholder PNG
or PDF is returned on failure. An empty document legitimately renders an empty
white 32px-high image and no invented text.

Dependencies and provenance:

- Tested interpreter: Python 3.12.14, called as `python3` from PATH.
- Production packages: Pillow 12.3.0 (MIT-CMU), reportlab 4.4.9 (BSD),
  fonttools 4.61.1 (MIT), charset-normalizer 3.5.2 (MIT). ReportLab requires
  Pillow and charset-normalizer; the other base packages have no required Python
  dependencies. Pillow's measured FreeType version is 2.14.3.
- Fonts: eight DejaVuSans/DejaVuSansMono regular/bold/oblique/bold-oblique TTFs
  in `/usr/share/fonts/truetype/dejavu`; font license is
  `/usr/share/doc/fonts-dejavu-core/copyright`.
- Existing package licenses remain with installed distributions, including
  `pillow-12.3.0.dist-info/licenses/LICENSE`,
  `reportlab-4.4.9.dist-info/licenses/LICENSE`, and
  `fonttools-4.61.1.dist-info/licenses/LICENSE`/`LICENSE.external`.
- Validation additionally uses installed PyMuPDF 1.26.6; it is not a runtime
  renderer dependency. Font hashes and exact versions are recorded in
  `render-backend-provenance.json`.

Runtime dependencies are pinned with official wheel hashes in
`native/render-requirements.txt`; `native/render-test-requirements.txt` also pins
the PDF inspector. The prepared cloud environment installs them in
`/workspace/shared/red-panda-render`, whose `bin` directory must be on PATH.
The setup draft records installation and startup requirements. Saving that draft
does not publish a snapshot or establish readiness in a newly restored task.
The helper reports explicit missing-backend errors when dependencies are absent.

`render-runtime-requirements.proposal.txt` and optional
`render-test-requirements.proposal.txt` provide a complete hash-pinned wheel
proposal for CPython 3.12/Linux x86_64/glibc 2.28 or newer. Official PyPI metadata
and wheel hashes are in `render-python-dependencies.json`. A hash-enforced pip
download successfully resolved and verified all five wheels in
`/workspace/shared/render-wheelhouse`; it did not install anything or change the
active environment. The parent owns adopting these proposals as native manifests.

`node --test test/render.test.js` exercises actual decoded PNG pixels and glyph
widths, native measured dimensions, selection, viewport/full-page clipping,
real crop equality/scaling, Unicode wrapping, PDF text extraction/font embedding,
pagination/ranges/paper geometry, visibility,
stripping, missing backend, bounds, cancellation and legitimate empty content.
