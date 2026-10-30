# Independent document/XML proposal

This is a proposed isolated change, not an applied production change.
[document-xml-proposal.patch](document-xml-proposal.patch) adds one installer
and its focused tests. `git apply --check` passes. Root owns integration into
`Page.prepareWindow`; call `installDocumentXML(page, window)` before document
scripts run, including real child realms. No package manifest, production file,
common runtime, upstream engine implementation or dependency file was edited.

The working proposal and verifier are under ignored `.cache/document-xml/`.
They wrap the `prepareWindow` method of the copied read-only production snapshot
`/tmp/red-panda-broader-frozen-EGeNlI` in the test process. Snapshot files remain
untouched. The imported pinned jsdom DOM/parser/XPath components supply real
objects and parsing; this proposal corrects their observable contracts without
copying target engine code.

## Observations and changes

Three reproducible public native probes and JSON observations are retained as
`document-xml-native-*`, `document-xml-entities-native-*` and
`document-xml-attributes-native-*`. They use owned random-port HTTP/browser
processes, verify the official binary SHA-256 and close only owned resources.
The binary digest is
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.

- **Document interfaces/metadata:** native HTMLDocument, XMLDocument and
  Document have distinct actual prototypes. HTMLDocument is constructible,
  XMLDocument's public constructor is illegal. Parsed and implementation-created
  documents acquire their appropriate real prototype. `prerendering` is false;
  `scrollingElement` returns the document element, including XML and quirks HTML,
  or null for an empty base Document. Domain getters follow the real creation
  host; assignments validate host/suffix and reject invalid changes. Cookie
  setters reject control/DEL/non-ASCII characters before ordinary jar storage.
- **Attributes:** native accepts `.over`, numeric/leading-hyphen names and
  multiple colons in both HTML and XML documents, while rejecting empty/space,
  `/`, `>`, and `=` names. The proposal creates real Attr-backed nodes with
  owner-document/owner-element and value/attachment behavior; it does not return
  a name-only replacement object.
- **DOMParser:** strict XML parsing still validates well-formedness. Known HTML
  named entities also work, matching native. DTD internal subsets are stripped
  while retaining the actual DocumentType identifiers; DTD declarations are
  neither evaluated nor fetched. Unknown entities remain literal only when a
  doctype exists, matching native's observed unexpanded entity behavior. CDATA,
  comments and processing instructions retain literal contents. Scripting stays
  disabled and parsed document state/lookups remain independent.
- **XPath:** the existing dependency exposes its AST evaluator hooks. Name,
  local-name and namespace-uri are evaluated over actual context/argument node
  sets, with real empty-set handling. Expressions are not rewritten and no
  expected fixture values are hardcoded. The original evaluator handles all
  other grammar/operators. `createNSResolver` preserves the supplied Node's
  identity rather than manufacturing a resolver stand-in.
- **moveBefore:** validates the actual parent/node/reference/root/document
  before changing topology. The existing insertion machinery produces genuine
  removal/addition MutationRecords and invalidates DOM caches. Temporary
  attachment hooks prevent state destruction/recreation during the atomic move;
  actual node identity, input value/selection/focus, event listeners and iframe
  browsing-context identity survive. ID indexes are reordered after the actual
  move. Connected custom elements with connectedMoveCallback receive that real
  reaction in place of disconnect/connect. Native resolves that callback
  dynamically after registration; the proposal preserves this measured behavior.
  Throwing callback getters cannot leave temporary attachment hooks installed.

Native's range behavior was also observed: moving a focused input retained its
value/selection and focus, but a DOM Range rooted there changed its start
container. The proposal keeps normal range/pre-removal updates rather than
claiming that every form of DOM state is preserved.

## Verification

`node --test .cache/document-xml/proposal.test.mjs` passes **14 tests**. These
check actual interfaces, jar contents, parser isolation and namespace nodes,
real XPath node results, input state/listeners, real iframe Window identity,
mutation records, validation without side effects, custom callbacks, Attr
attachment and throwing-getter cleanup.

[document-xml-proposal-fixtures-canonical.json](document-xml-proposal-fixtures-canonical.json)
records all four unchanged fixtures failing on the frozen baseline and all four
passing with the isolated installer at canonical origin9582:

- document/document.html
- node/move_before.html
- domparser.html
- xpath/xpath_conformance.html (all91 expressions)

The exact native harness branch and iframe+worker resource profile were used.
The four native controls are reused from conformance-broader-checkpoint.json,
with matching fixture/harness hashes and verified binary identity. The earlier
port0 report remains unchanged: it correctly retains the document.URL mismatch
against the native harness's hardcoded9582 BASE_URL. Other three fixtures passed
at port0 too; no harness assertions were rewritten to hide the mismatch.

The canonical report binds the proposal digest at that capture. The final patch
also adds throwing-getter restoration, real namespace-resolver identity and strict
receiver/brand tests;
its module SHA-256 is
`6c4397335c482f70767bf6bdcf822fa0563c6fa2d300f6cb8eefc47b95490783`.
Root should run fresh production integration checks after applying it; the
isolated report is not a substitute for that final integration.

## Remaining limits

This is a bounded proposal rather than complete document/XML parity. It targets
pinned jsdom26 private structures and exported XPath hooks. The actual DOM
insertion/range/slot/custom-element machinery remains involved, so combined
frame/focus/selection/shadow/mutation tests are required when integrating.

Domain validation and metadata do not implement domain-relaxed cross-frame
origin access; the surrounding browser's origin model must support that
separately. General domain/IDN/public-suffix cases have focused independent tests
but only the probed native host/same-host/rejection cases are measured here.
Attribute-name edge cases beyond the observed set remain unexhausted.

DTD entity declarations deliberately stay unexpanded, as in the reference.
External DTD/network fetching is absent. The normalization layer still relies on
the strict XML parser and needs broader malformed-input/encoding/entity tests.

The dependency's broader XPath limitations remain: full namespace-resolver axis
semantics, case-sensitive XML axes, iterator invalidation, all realm/receiver/
lifetime contracts and all XPath APIs have not been established. The91-case
HTML battery passing does not establish those features.
