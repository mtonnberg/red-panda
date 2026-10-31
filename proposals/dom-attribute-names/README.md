# Native attribute-name and namespace behavior

Frozen independent proposal against current Root. `integration-current.patch` changes **three runtime files and two test files**. `candidate/` contains the exact leaves, `patch-base.json` records their Root bases, and `source-freeze.json` pins 399 source/helper/test/native-addon files, 6579 dependency files, and seven external inputs. All hashes were checked unchanged after the final focused execution and raw probes. `git apply --check` passed without changing Root. No dependencies or native addon sources/binaries are changed. Frozen CSS proposals remain untouched.

## Behavior

The actual ElementImpl/DocumentImpl attribute graph now accepts Native's relaxed names: nonempty strings excluding NUL, ASCII HTML whitespace, slash, greater-than and equals. Digit starts, punctuation, quotes, vertical tabs and Unicode are accepted in both HTML and XML documents. Lone UTF-16 surrogates normalize through actual replacement characters. HTML element operations lowercase ASCII names; `Document.createAttribute` preserves the declared spelling, including uppercase. The old document-xml public override rejected valid names and lowercased them; it is removed, restoring the genuine generated Document factory through the corrected backend.

Native's measured namespace methods use flat physical attributes. `createAttributeNS` retains the literal name and ignores the namespace. `setAttributeNS` rejects empty/multiple colon components; null namespace discards a single prefix, while a nonnull namespace (including the empty string) retains the qualified spelling. Namespace reads/removals try the actual xml/xlink/xmlns URI-derived prefix first and then the plain-name fallback; unknown URI values use the plain fallback. These operations mutate/select genuine Attr implementations and their real element lists; no stored expected result, namespace-only return shim or separate public object is substituted.

Actual attachment adopts the Attr into the receiving document. An uppercase Attr declaration retains its original public name/localName/nodeName while the HTML element's real physical name and index are lowercase. A Host-private weak record retains this immutable declared spelling; the real attribute backend and serialization use the physical spelling. Detach/value replacement, switching HTML/XML owners, direct Attr clone/import and element clone all follow the measured state transitions. All original generated setup/new allocations and captured per-Document globals remain intact.

Small nonconstructible selected-VM methods retain the original generated conversions, argument checks, factory calls and CE reaction machinery. They only translate primitive Symbols through their actual description, matching Native (`Symbol()` becomes literal `undefined`); boxed Symbols and objects producing Symbols still throw. Genuine factory identities guard receivers and Attr arguments, including copied/inherited lookalikes, before authored coercion. Private ownership tables, records and lookups are Host-owned. The Native Attr interface has no prefix descriptor, so the owned public prototype omits it while the genuine private backend remains available.

Installation goes through the existing DocumentXML owned-window hook, plus the existing utility-world initialization path. Plain unowned jsdom retains XML name validation, standard namespace metadata and its original Attr.prefix. Frame setup uses the existing owned-window preparation hook; no global factory source or allocator authority is changed. The central factory owner confirmed compatibility with removal of the document-xml `_createAttribute` shim.

## Verification

* `native-source-r1.json` / `candidate-source-r1.json`: the unchanged pinned `element/attributes.html` fixture passes using the upstream profile, Native harness branch and original 2000ms load plus 2000ms assertion budgets. Owned ephemeral HTTP origins avoid canonical port leases. Actual loads are **27ms Native / 335ms candidate**, with no diagnostics or runtime exceptions. The source harness remains unchanged; no synthetic assertion count is claimed.
* `focused-r2.log`: **23/23 pass**: nine new domain tests plus fourteen existing DocumentXML tests. The existing uppercase expectation changes from `upper` to Native-proven `UPPER`. New controls cover real reflection/mutation records, owner/adoption/clone/import state, Symbols and conversion order, real utility identities, retired document use, copied/inherited lookalikes and unowned-jsdom behavior. `focused-r1.log` preserves the contrary uppercase-attachment failure that motivated the real backend correction.
* `native-semantic.json` / `candidate-semantic-r1.json`: **90 basic-name, 252 qualified-name, ten lookup and 84 conversion records** match in actual DOM state/values/errors. Serialization is separately retained in each record; it differs in **119 XML rows**, rather than being hidden by an outer serialization exception. Full first-epoch reports and intermediate candidate reports are preserved.
* `native-namespaces.json` / `candidate-namespaces-r1.json`: entire reports match exactly: 168 HTML/XML/SVG namespace combinations, forty scalar conversions, six real collision/removal cases, interface-prefix exposure and HTML/XML case behavior.
* `native-ownership-import.json` / `candidate-ownership-import-r1.json`: all declared-name/physical-name/adoption/value/clone/import stages match exactly, including HTML-to-XML-to-HTML transfers and genuine element clone behavior.
* `final-verification.json` records exact hashes, comparisons, source contracts and remaining differences. No broad/full/heap/PureScript suite or canonical port was used for this slice. Root owns composed final validation.

## Explicit bounds

XML `outerHTML` serialization remains different: Native emits HTML-style strings, whereas the existing jsdom XML serializer emits XML syntax or rejects names that are valid for these attribute operations. The actual mutation/value/error records match independently; this patch does not change serialization policy.

Parsed SVG/XML namespace metadata remains different. `native-parsed.json` / `candidate-parsed-r1.json` preserve the contrary proof: Native exposes flat Attr local names with null namespace metadata and omits XML xmlns declarations, while the existing parser retains real XML namespace metadata/declarations. Programmatic namespace methods are implemented here; parser rewriting and namespace declaration policy are separate work.

General scalar conversion outside these forwarded attribute methods is unchanged. Broader Node equality/import combinations, cross-realm native error entry and adversarial public constructor replacement remain existing infrastructure bounds; no universal creation-context or error-realm parity is claimed. The implementation preserves original generated factory authority and does not introduce another allocator.

## Reproduction

Use the prepared Node and source paths pinned in `source-freeze.json`:

```sh
/workspace/shared/rea-tools/node_modules/node/bin/node --experimental-vm-modules --test --test-concurrency=1 test/attribute-names.test.js test/document-xml.test.js
```

`source-status-r1.json` contains both exact fixture replay commands. Each standalone `*-probe.mjs` takes binary and a new output JSON path, owns its browser process, and refuses to overwrite prior reports. Its paired expression file is hashed in the raw report. `probe-expression.js` is the original combined probe; `semantic-expression.js` only separates real serialization outcomes from preceding genuine DOM mutation outcomes, preserving every observation.
