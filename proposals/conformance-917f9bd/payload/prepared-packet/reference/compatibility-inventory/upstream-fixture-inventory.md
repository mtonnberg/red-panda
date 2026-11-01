# Next upstream fixture cohort inventory

This is a read-only static inventory at upstream commit
`948d773786380bae36f046639fc61e2ddddd212a`. No browsers or runtime probes were
started, no production files were edited, and the external source retains its
license. Full paths, fixture SHA-256 values, registrations, option expressions,
source locations and the proposed selection are in
[upstream-fixture-inventory.json](upstream-fixture-inventory.json).

There are **574 HTML files: 321 tagged `lp-mode=test`, 253 untagged**. Active
literal `testing.htmlRunner` calls map to **455 unique HTML files**: all 321
were tagged and **134 were untagged**. Another **119 untagged files are outside
those registrations**; many are support pages or protocol inputs. Four of those
still import testing.js: canvas/webgl_rendering_context.html,
polyfill/webcomponents.html, support/history.html and xpath/xpath_perf.html.
The last has a commented-out native registration. A tag or harness import alone
is not proof that a file is an independently executable conformance case.

The source contains **216 active htmlRunner calls**, **14 with nondefault
options**. Directory registrations enumerate immediate .html children only and
ignore the metadata tag. Defaults are iframe+worker enabled, 2,000 ms, no
injection and no experimental features. A load_resources override replaces the
whole Boolean struct: enabling stylesheet alone disables worker/iframe. The
experimental CORS field is explicitly retained but ignored upstream; that is not
a normal CORS-disable instruction.

The historical 178-case cohort and current frozen 41-case cohort intersect in
**15 paths**; their union is **204**. The latest 41 includes **26 cases outside
the old 178**, while **163 old cases have not been rechecked by that snapshot**.
The old native-pass/candidate-nonpass set contained 63 fixtures (including one
timeout); current41 revisits 10 and all10 pass, leaving **53 historical failures
not revisited**. Current source may already fix some; the old results are not a
current pass rate. There remain **251 registered fixtures outside both selected
cohorts**. Older expanded/shadow checkpoints provide additional historical
measurements but do not bind the current production snapshot.

The next bounded selection is **32 fixtures**, with 17 historical178 paths and
15 new paths, split below. The JSON `proposedNextCohort.testsFileArray` can become
an explicit runner selection after root validation. Use identical native and
candidate settings, a fresh owned process per fixture, iframe+worker only,
9582/xhr-subset, and the recorded document-complete+100 ms settling procedure
within a 15-second instrumented fixture budget. These are proposals, not passes.

| Rank | Group | Cases | Purpose |
|---:|---|---:|---|
|1|DOM selectors/scope/escapes/duplicate IDs|7|Revisit native-passing historical selector failures.|
|2|Input/radio/label/option/dialog state|7|Check remaining form-control semantics beyond the newly passing form fixture.|
|3|Document metadata, moveBefore, DOMParser, XPath|4|Cover document/DOM/XML contracts not established by current41.|
|4|Readable/text/transform streams, compression/decompression|5|Exercise unchanged browser assertions against real byte/chunk behavior.|
|5|Headers, Request, Response, URLSearchParams|4|Broaden Fetch value/body semantics without unsupported HTTP endpoint families.|
|6|MessageChannel, BroadcastChannel, Blob|3|Check delivery/transfer/realm and byte contracts.|
|7|Data iframe and cross-realm identity|2|Extend frame evidence with actual child documents.|

No unsupported *direct route hint* was found in this proposed32 static scan.
That does not establish absence of transitive or generated URLs. Relative
support scripts/documents must still be served unchanged. Request constructor
examples using example.com are value tests, not automatically network traffic.
Preserve actual missing-route logs and native failures; do not drop nonpassing
controls or infer coverage from advertised method names.

Separate cohorts need prerequisites:

- **Five external CSS fixtures:** stylesheet-only profile and exact /styles/*,
  encoding/header/delay and /defer-marker.js routes. The current helper lacks
  them; serving empty200 bodies would invalidate the comparison.
- **Fetch/XHR/resource/navigation timing:** the XHR subset is insufficient for
  CORS, referer redirects, raw/cache/compression, resource-timing and navigation
  redirect endpoints. Transport phase measurements also remain incomplete.
- **Service worker/cache:** three enabled tests require serviceworker=true;
  disabled-profile cases are distinct controls. Independent feature support and
  route contracts must exist before interpreting results.
- **SharedWorker:** 8,000 ms registration, enabled worker resources, independent
  implementation/support files required. Ordinary dedicated Worker passes do
  not establish this feature.
- **Beacon:** beacon+iframe override, no worker flag, and real stateful
  /beacon/store/read/reset endpoints.
- **Image fetch:** image-only override and exact endpoint/status/count behavior.
- **inject_script.html:** exact preload
  `window.__injected = true; window.__injectValue = 42;` before document scripts;
  the generic external-runner preload does not satisfy it.
- **SSE/WebSocket:** progressive SSE/reconnect state and the separate hardcoded
  WebSocket server on9584. The current XHR subset supplies neither.

Worker/shared-worker/service-worker registrations use 8,000 ms where recorded;
other defaults are2,000 ms. The inventory is source-syntax extraction rather
than a Zig compiler/import-configuration analysis. It resolves every literal
call found and preserves all14 overrides for review, but does not prove which
conditional native test imports a particular build enables.
