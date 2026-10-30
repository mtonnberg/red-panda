# Owned HTML serialization

This proposal was developed in `/tmp/red-panda-serialization.knsMz5`, copied from
the current runtime after the independent innerText/style proposals were applied.
No shared production files, dependencies or node_modules were changed. Only the
isolated dump copy uses the proposed shared serializer import; an in-memory Page
beforeParse wrapper installs the new module during Browser probes.

`installSerialization(page, window)` registers an owned realm and returns an
idempotent `dispose()` controller. Place it after `installShadowDOM` in Browser's
normal beforeParse preparation, including frame preparation. Abort and Window
close dispose registration without adding another Page close listener.

`serializeHTML(node, options)` traverses actual nodes through the pinned jsdom
serialization adapter, accepting the shadow installer's selected-root adapter.
Both pinned parse5 serializer exports dispatch owned HTML-affinity documents to
this serializer; unregistered documents retain their original paths. The
XMLSerializer implementation likewise uses this route for supported node kinds
owned by an HTML realm. DOMParser-created HTML documents share that realm
affinity. XML-mode documents stay on their existing namespace-aware path.

The proposed dump import uses the same node serializer after its existing clone,
strip and cap operations. Attribute escaping occurs while emitting each real
attribute. There is no finished-markup replacement, DOM attribute rewriting,
temporary DOM mutation, fixture detection or canned serialization output.

## Observed contracts

The verified native executable has SHA256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
`serialization-probe.mjs` captures public DOM/CDP and CLI observations using owned
port0 servers/processes. `serialization-native-observation.json` preserves raw
native output, including control characters and exact CLI stdout.

- Attribute values escape ampersand, double quote, less-than, greater-than and
  NBSP, while preserving tabs/newlines/CR, apostrophes, backticks, Unicode and
  the observed control characters. Stored attribute values remain unchanged.
- Text, raw-text and RCDATA use their actual parent namespace/context. HTML
  script/style/noscript text stays raw; foreign SVG script text is escaped.
- Twenty measured empty boolean attribute names serialize bare, even on another
  tag/namespace. Other empty names, including inert, itemscope, allowfullscreen,
  nomodule and playsinline, retain quotes in the measured native browser.
  Nonempty boolean values remain quoted. Shadow option flags retain quotes.
- Templates and explicit/serializable closed roots use their actual selected
  children. Ordinary serialization does not expose closed roots.
- HTML-owned XMLSerializer follows native HTML emission: no synthetic namespace
  declaration, HTML void/boolean rules, HTML text escaping and qualified foreign
  attributes. Existing WebIDL receiver/Node validation remains authoritative.
- Document doctypes preserve public/system identifiers and receive a structural
  newline before following document children. A doctype serialized alone has no
  added newline.

## Validation

The unchanged external `element/inner.html` fixture has SHA256
`93db0fc91a5e8bf3f78240bb8313de77f700273a65dea15e1ad02a04adb9e68c`.
It passes natively, fails in the copied baseline at attributeSerialization, and
passes with this proposal using the native harness branch, Lightpanda/1.0 test
UA and default iframe/worker flags. The source and harness were unchanged.

Nine focused actual-DOM tests pass. The combined serialization, dump, DOM, frame,
shadow and current innerText tests pass 76/76. Public native/candidate observations
match across fifteen groups: character/attribute cases, document output, raw text,
SVG/qualified attrs, shadow/template selections, ordinary XML text controls,
boolean recognition/values, HTML-owned XMLSerializer and doctypes. Serialization
produces zero observed DOM mutations.

`serialization-observations.json` retains the before/after/native fixture evidence
and explicit unmatched groups. Previous failures remain recorded. The proposal
includes the current source hashes and test bootstrap; it does not overlay older
style/innerText implementations.

## Explicit boundaries

Two XML-mode groups remain unmatched. Native DOMParser drops namespace-declaring
attributes and exposes a prefixed attribute with namespaceURI null, while jsdom
preserves those actual DOM namespace values. Native then serializes empty XML
elements with paired tags. This proposal does not erase real attributes or
namespace metadata merely to match a serialized string; XML parsing/serialization
compatibility remains a separate gap. Both outputs and actual attribute metadata
are preserved in the evidence.

CLI HTML payload bytes match after serialization; its existing writer still adds
one final LF absent from the native plain writer. That separate writer proposal
is owned by rea_reference/root and is not included here. XML-mode namespace
recovery, processing instructions, malformed XML handling and unprobed serializer
edge cases are not claimed as replicated. This is bounded compatibility evidence,
not full browser parity.
