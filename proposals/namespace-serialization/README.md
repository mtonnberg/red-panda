# XML namespace and serialization followup

This frozen independent slice follows immutable attribute proposal `eeef05066357dea7102aa9a27c4b51eec0a756d54304756c6590aec67b529f31`. It changes eight runtime files and adds ten focused tests. No native addon source/binary, dependency or Root production file was changed. Root's newer EventIDL realm transformation/compiler argument, setupEventTarget controller method, and EventSource/WebSocket integrations are preserved in the executed composed scratch.

## Applying the reviewed result

Three immutable patches are provided because Root's WorldSession integrations advanced after the original attribute proposal:

* `attributes-prerequisite-current.patch` is only the original attribute proposal mechanically composed with current Root's newer WorldSession imports/installers; it preserves the original runtime leaves and assertions. The original attribute package remains unchanged.
* `integration-after-attributes.patch` is this followup against that logical attribute prerequisite. SHA256: **5c91f08c93e8dfc18f701b8713729ea81a0641b9a1656ea8dab661d10e125aaa**.
* `integration-current-composed.patch` applies both slices in one patch against the captured current Root. SHA256: **7a273601e561f329431ae82156158f013f4a56689d922bb62bbf57fce9cfcbe4**.

`candidate/` contains all exact final leaves. `patch-base.json`, `rebased-current-root.json` and `apply-check.json` record bases and successful read-only apply checks. Apply checks ran in isolated copies, never Root. Source freeze pins **410 source/helper/test/addon files, 6579 dependency files and nine external inputs**, all verified unchanged after final controls. `source-freeze.json` SHA256: **b6a112aafd7cfa10b53e6e6b6f75c5ca77803408e2a1d91397eef1be31a97f18**.

## Actual parser and tree behavior

Native's XML parser resolves Element namespace URI/prefix from real declarations, omits the declaration Attr nodes, and stores ordinary qualified Attr names as flat names with null namespace metadata. HTML foreign-content parsing instead retains flat xmlns declaration attributes. The implementation applies those rules at actual attribute insertion while the genuine SAX parser owns the XML parse scope. Actual Element URI/prefix and ancestor relationships remain intact; no captured markup is edited after parsing and no reflected namespace field is hidden to simulate a flat tree.

Actual namespace lookup follows real Element metadata and live flat declaration attributes. Attr value changes/removals immediately change lookup results. XML parsing declarations have already served their parser binding purpose before their omission from the DOM. Programmatic and HTML-fragment declarations remain actual nodes.

Native XML null/custom/MathML elements use HTMLUnknownElement, including real style behavior. Inside the owned XML parser scope the existing generic Element factory call selects the actual canonical HTMLUnknownElement factory. HTML/SVG factories remain their original choices. This constructs the correct implementation and wrapper before publication; it does not relabel a generic Element prototype. Utility XML documents similarly use the existing genuine local generated XMLDocument factory.

Native XML innerHTML, outerHTML and insertAdjacentHTML use actual HTML fragment parsing. The owned path routes through the real parse5 adapter, preserving HTML/SVG/MathML contexts and using a genuine inert typed HTML context with the actual document/tag for null/custom namespaces. This preserves table recovery, lowercase HTML names, entities and real node creation. The actual target node is never temporarily retargeted. Private XML parse scopes have a Host checkpoint so V8 termination cannot leave declaration filtering active on later work.

## Serialization

Native XMLSerializer is exposed. For owned trees its format is HTML-style tree emission, including explicit closing tags, actual prefixes, escaped CDATA text, PI nodes (including the measured empty-data space), boolean attributes and actual doctype structure. No namespace declaration is generated. The existing real-node serializer is extended for CDATA/PI, and owned XML inner/outer getters use it directly. XMLSerializer's implied HTML doctype when a parsed HTML document has no actual doctype is an emission rule; the tree is not modified.

All strings are produced by traversing current genuine nodes and current attribute/text values. The serializer never returns a captured expected fixture string. Existing unregistered serialization-only XML profiles and unowned jsdom retain their original namespace-aware XML paths.

## Utility creator and allocation corrections

Utility DOMParser previously read a nonexistent utility `_document` and threw null.URL. A Host-private creator record now supplies the actual captured DocumentImpl URL and the original generated document factory. No synthetic `_document` or VM controller table is installed. A Host-only controller.createDocument method uses the existing local generated factory and canonicalizeNew machinery.

Direct V8 metadata then proved two genuine creation defects. Host-generated parser Nodes carrying utility prototypes were actually created in the main VM, and NamedNodeMap's Host Proxy handler returned an Attr without the utility canonical mapping. Trusted fresh utility startup now captures its actual VM Object/Proxy in the existing Host registry, before the fallback through its shared main Window implementation. Genuine NamedNodeMap joins the existing pinned generated allocation compiler. For genuine Proxy-backed canonical wrappers, the existing local generated-wrapper path supplies the real utility handler/utils; non-Proxy behavior is preserved. No marker, prototype-only classification, extra parser-specific allocator or context-copy object is used.

The compiler still checks exact pinned sources: only NamedNodeMap is added to the old 116-module set. `allocation-source-proof.json` records the original fingerprint, new **f199523c2fb0570868c2e3aa84c9fd7b380687298db9b52f1d5531a3f561ae8f** fingerprint, 117 source hashes and that sole addition. The unchanged-source guard still rejects modified generated sources.

Codec/Event parity independently adds a complementary Host context→actual-global registry. Coordination agreed that a **separate composition patch**, owned by codec_recovery, will invoke its validated pair registration inside this existing captureDOMWrapperRealm startup helper and remove its late registration. These frozen namespace files are not changed by that future composition. Legacy utility globals here are fresh, non-retargeted VM identities; the separate reusable-Window prototype must use its immutable RealmHandle keys.

## Verification and contrary evidence

* Current Root-composed focused suites: **29/29** (`focused-rebased-final.log`: ten new namespace tests, nine existing serialization tests, ten existing utility tests), then **23/23** (`focused-rebased-attributes-documents.log`: original attribute and DocumentXML contracts). All 52 pass serially. The genuine infinite-VM test proves skipped finally, nested scope cleanup, successful later real HTML fragments/XML parsing, an unrelated timer and page disposal. A normal nested VM-entry control also preserves an active parse scope.
* `candidate-attribute-semantic-frozen.json` exactly matches all **436 complete records** from the frozen Native attribute semantic probe, including the **119 XML serialization outcomes** that differed before this slice. No fields are removed from this comparison.
* `candidate-frozen.json` exactly matches four ordinary parsed-tree corpora, exposed API fields, API-created XML trees and genuine mutation/clone/import/adoption records. Two malformed-XML corpora still differ as described below. `native-before.json` and all intermediate candidate reports remain intact.
* `native-brands.json` / `candidate-brands-final.json` exactly match all six Element/Attr interface exposure records. The earlier three contrary generic-Element records are retained in `candidate-brands.json`.
* Actual HTML fragment controls: **12/18 full records** match; all 18 emitted tree strings match. The remaining six differ only in colon-qualified element localName/prefix metadata. Across 15 namespace/context cases all emitted strings and measured case behavior match; full records retain that same colon metadata difference. No failed record is relabeled a pass.
* `utility-creation-frozen.json`: six actual public values (Document, Element, Attr, child, NamedNodeMap Proxy and names Array) have genuine utility creation contexts before AND after null prototype, and are neither main nor Host-created. Four Node values retain actual main canonical counterparts, exact shared implementations and Host-owned backends. This uses constant-time V8 SameRealm metadata, **no heap enumeration or GC**. Both contrary creation epochs are preserved. The v1 driver is archived with its exact recorded hash; its later wrap-based implementation query had an observable mapping side effect, so final comparisons use direct trusted factory records instead.
* `focused-source-guard.log` confirms the original exact-source rejection control. Its execution predates the later Root EventIDL rebase; original generated dependency sources remain unchanged.
* Initial focused failures remain visible: missing scratch docs input (ENOENT), followed by the inherited utility DOMParser null.URL defect. The read-only docs input and genuine creator/factory corrections are recorded, rather than hiding these epochs.

No broad/full/PureScript suite, heap enumeration, canonical port or source-load two-second replay was run for this slice. Sharedworker held that resource lease. Root owns final composed source replay and full validation.

## Remaining bounds

Malformed XML parsererror text remains the SAX detail rather than Native's literal `error` node text. Duplicate expanded attribute names remain a strict SAX error where Native keeps the first expanded name. Both genuine contrary trees/serialization are retained; no forced parser-success path is added.

HTML colon-qualified element localName/prefix metadata remains different despite matching emitted strings and actual namespaces. Parser recovery outside the measured controls, broader utility HTMLDocument interface details, and the separate immutable reusable-Window/factory-authority migration are not claimed complete. Existing broader generated-interface intrinsic/error-realm hardening is outside this slice.

Reproduce the final focused suites from the frozen scratch using the prepared Node pinned in source-freeze.json. Each raw probe takes a binary (or scratch root for the creation probe) and a NEW output JSON path, owns its process, and refuses to overwrite evidence. `frozen-probe-status.json` contains the exact final commands.
