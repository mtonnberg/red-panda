# Independent document dumps

`src/dump.js` exports:

```js
dumpDocument(document, {
  format: 'html',
  selector: undefined,
  maxBytes: undefined,
  stripModes: [],
  nodeIdFor: undefined,
  withBase: false,
}) // returns a string; throws DumpError on invalid/unsupported requests
```

The implementation clones the selected DOM and leaves the live document intact.
`selector` chooses the first CSS match, including that element itself in output.
Missing matches throw `DumpError` with code `SelectorNotFound`; invalid selectors
use `InvalidSelector`. Native selector parser error names are more specific and
are not reproduced individually.

Native observations come from the verified binary
`/workspace/shared/lightpanda-reference/lightpanda-x86_64-linux`, version
`1.1.0-nightly.11326+948d77378`, SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
The five `dump-*-observations.json` files preserve owned fixture HTML, command
flags, and native fetch JSON. Requests use data URLs and an owned loopback HTTP
server. No upstream production
implementation was copied. The fetch-help reference documents allowed groups
and formats.

Verified contracts:

- `html` serializes current DOM, including scripts by default, with a newline
  after the doctype. Selected elements omit document/head/body wrappers.
- `maxBytes` applies only to `html` and `markdown`. It retains the largest prefix
  within the cap ending at a UTF-8 boundary, then appends
  `\n\n[truncated]\n` outside the cap. Zero truncates all nonempty content; an
  omitted cap leaves output unlimited. Other formats reject a supplied cap.
- `stripModes` accepts `clutter`, `css`, `js`, `invisible`, `shell`, and `ui`.
  JS removes scripts/preloads, CSS removes stylesheet nodes, and UI additionally
  removes images, picture/video and SVG. Shell removes page chrome while keeping
  article-local headers/footers. Clutter uses an independent main-content
  heuristic and removes authored display:none/template content.
- Native HTML `invisible` stripping is narrower than semantic visibility: the
  observed output retains hidden and aria-hidden attributes, visibility:hidden,
  opacity:0, hidden inputs, head metadata and scripts, while removing authored
  display:none and templates. The adapter follows those observations and checks
  original styles before removing CSS.
- `markdown` resolves link/image URLs against the original document's base URI,
  including an explicit `<base href>`. Resolvable HTTP URLs become absolute;
  relative references that cannot resolve against a data URL remain relative.
  It retains leading/trailing newlines,
  supports headings, emphasis, code, lists, basic tables, blockquotes, controls
  and visibility filtering. Data-only probes do not establish HTTP URL behavior.
- `structured_data` returns the native-shaped JSON object with `jsonLd`,
  `openGraph`, `twitterCard`, `meta`, and `links`, plus `alternate` when present.
  JSON-LD remains raw text, including invalid JSON. Repeated metadata becomes an
  array. Canonical/icon and alternate link URLs use the original document's URL
  resolution, just as Markdown does. This differs from the prototype's parsed
  JSON-LD and meta-array shape.
- HTML retains the original URL attributes by default. `withBase: true` prepends
  an absolute `<base href="document.baseURI">` as the first head child of a full
  HTML document dump, retaining an existing base element. Native ignores this
  insertion for a selected subtree, including a selected head. The live DOM is
  never changed.
- `semantic_tree` describes DOM structure with node IDs, XPath, node kind,
  role/name, interactivity, attributes, live control values, checked/disabled
  states and select options. It filters non-rendered nodes and whitespace-only
  text. `semantic_tree_text` prunes generic containers and named descendants,
  retaining meaningful roles, text and interactive state.
- `nodeIdFor(originalNode)` optionally supplies stable external IDs. Without it,
  each semantic dump allocates its own IDs in traversal order. The callback
  receives original nodes, never cloned nodes.
- Prototype extras `text` and `links` remain available. Links use absolute URLs;
  this extra format has no native fetch dump counterpart.

The new adapter does not render PNG/PDF and rejects those formats explicitly.
Alternate Markdown loading is asynchronous and belongs to the caller. Frame
expansion, complete Markdown dialect behavior, all semantic
roles, native internal ID allocation, all CSS visibility cases, and exact reader
mode heuristics remain outside the proven contract. Shell/clutter behavior on
arbitrary pages is an independent heuristic, not a claim to native algorithm
equivalence. Styling and layout inherit the host DOM's limitations.

`node --test test/dump.test.js` passes 15 tests, including a golden comparison
against all 47 successful captured native fixture outputs (36 original data URL
cases and 11 additional HTTP/base cases). Negative URL assertions distinguish
resolvable HTTP references from unresolvable data references. Missing selectors and
invalid format/cap cases remain distinct observed failures. The exact comparison
summary is `dump-differential.json`; the result is bounded to these fixtures and
does not establish full dump or browser parity.
