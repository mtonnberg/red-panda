# Arbitrary values and CDP metadata

The reference is the checksum-verified Lightpanda Linux binary
`1.1.0-nightly.11326+948d77378`, SHA-256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
No native browser engine implementation was copied or imported.

## Native observations

`remote-values-probe.mjs` retains 77 bounded cases in
`remote-values-native-observation.json`. Each case starts a new owned browser
process and exercises Runtime.evaluate or Runtime.callFunctionOn. Actual target
state records getter/trap counts; a separate `6*7` request checks continued
operation. All 77 subsequent heartbeats returned 42. All 72 by-reference
getter/trap counters remained zero, including hostile objects, Error accessors,
DOM node accessors, active/revoked/callable Proxies and Proxy prototypes.

One initial evaluate(-0) request exceeded its 2s RPC deadline under concurrent
work. That observation is preserved as a timeout, not a successful response.
The fresh-process 5s follow-up returned the expected -0 fields for both evaluate
forms and callFunctionOn; its heartbeat also returned 42. See
`remote-values-negative-zero-observation.json`. REA 6.8.0 independently captured
that follow-up in `remote-values-negative-zero-evidence.json`, Evidence ID
`ev_be070eba29d961e94cf397348681f1d2db77183d84ea4a5087baeb90626fddd2`.
The capture exited 0, settled and was not truncated.

Observed contracts:

- Throwing null, undefined or a number retains that exact primitive in both
  result and exceptionDetails.exception. The exception text is `Uncaught`.
  Arbitrary thrown objects remain objects; they are not coerced into Error.
- Symbols have type symbol, their intrinsic description and a remote objectId.
  A Symbol remains a retained reference for CDP despite being a JS primitive.
- Finite numbers include their description. Negative zero, NaN and infinities
  use unserializableValue; negative zero's description is `-0`. BigInt uses an
  `n`-suffixed unserializableValue/description. Undefined has no value field.
- Ordinary objects retain Object metadata even when constructor, nodeType,
  ownerDocument, message, stack or Symbol.toStringTag are hostile accessors.
- A callable Proxy is type object, subtype proxy and className Function.
  Native descriptions distinguish active targets (e.g. Proxy(Object) and
  Proxy(Function)) from revoked Proxy. The JS helper deliberately uses the
  generic safe description Proxy because it cannot unwrap target internals.
- Genuine DOM nodes remain subtype node/class HTMLDivElement even if public
  nodeType, ownerDocument, constructor and nodeName getters are overridden.
  The measured native node description is empty. HTMLAllCollection retains its
  callable/HTMLDDA remote shape, rather than becoming actual undefined.
- Explicit returnByValue is a different operation. Native hostile object/Proxy
  serialization invoked one getter/trap and returned protocol -32603 Internal
  error. A revoked Proxy returned that code without a trap. Symbol returned
  -32000 Object couldn't be returned by value. These are errors, not empty
  successful objects.

## Helper contract

`src/remote-values.js` supplies metadata, never an invented objectId or execution
context. The retaining Session remains responsible for actual values, groups,
realm validation and handle lifetime.

| Export | Responsibility |
| --- | --- |
| primitiveRemoteValue(value) | Complete primitive fields, or undefined when a handle is needed. |
| needsRemoteHandle(value) | Includes objects, functions, Symbols and actual HTMLDDA values. |
| describeRemoteValue(value) | Metadata without calling page getters/coercion hooks. |
| nodeIdentity(value), ownerDocumentOf(value) | Genuine jsdom Node implementation data and actual owner document. |
| ownDataValue(value, key) | Own data only; accessor/Proxy values are not read. |
| safeErrorMessage(value) | Safe text without String(object), message/stack accessors or user toString. |
| protocolErrorFields(value) | Safe protocol code/message even when the caught value is null or hostile. |
| exceptionDetailsFor(value, options) | Original thrown value through the caller's retaining remote serializer; native Uncaught text. |

Node and jsdom DOMException recognition checks implementation data descriptors,
guarded prototype identity and the implementation's own wrapperSymbol data
value equal to the input wrapper. Copying a real node's implSymbol onto an
ordinary object does not confer a DOM brand or frame affinity. Public DOM
getters are not used. Intrinsic Map/Set sizes, typed-array lengths, Date/RegExp
metadata and host DOMException accessors bypass user overrides through their
actual internal-slot/brand checks. Proxy prototype walks stop before traps.

A native Error's ordinary lazy stack is an accessor and may invoke an overridden
Error.prepareStackTrace or Error name/message getters. The helper does not read
it. It uses already-materialized string data or a safe name/message summary.
The real retained handle is still available to explicit inspection. Line/column
zero in exceptionDetails are documented unavailable-position fallbacks;
trustworthy source positions may be supplied by the caller.

## Checks and limitations

The ten focused tests exercise hostile and revoked Proxies, constructor/name
accessors, cross-realm internal-slot values, actual frame Node affinity,
forged implementation-symbol objects, genuine HTMLDDA, unchanged thrown-value
identity, caller-owned groups/context IDs, prepared-stack hooks and arbitrary
protocol failures. All ten passed, with no skipped tests.

`remote-values-checkpoint.json` summarizes the independent native/helper check.
Production CDP/Runtime integration and its acceptance tests are recorded by the
parent task separately; this helper checkpoint does not claim a complete CDP
implementation or V8-equivalent metadata/serialization.

Remaining JS limitations include opaque Proxy target/revocation descriptions,
prototype-derived constructor-name fallbacks, omitted lazy native Error stacks
and unavailable exact exception source positions. Object previews and complete
V8 by-value serialization are not supplied by this metadata module. Future
native metadata could obtain these from public V8 APIs without user callbacks;
this change does not modify the existing collection addon's source or build
contract and does not depend on that future capability.
