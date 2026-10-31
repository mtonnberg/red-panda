# Private generated Event backing

The original selected-VM Event wrapper is still the object passed to the pinned
jsdom generated setup, backed by the same real EventImpl used for dispatch.
Setup/new bind that backend in a Host WeakMap instead of defining a public
implementation symbol. Generated Event-family brands and backend reads use the
private map. The existing implementation-to-wrapper backlink stays on the
private backend. EventTarget, Node and other interface backing is unchanged.

The own nonconfigurable `isTrusted` accessor is a genuine function created in the
allocating VM. It captures that VM's TypeError before authored code. Its private
bridge accepts the exact receiver and returns only a boolean. Copied symbols,
proxies and inherited lookalikes do not authenticate. Authored symbols on genuine
events remain ordinary visible authored properties and do not affect dispatch.

This is a delta on the frozen 116-interface DOM allocation/factory-parity slice
(dom-wrapper-realms.js SHA256
9727bb4db1612d9b427e553ac5a13d094b8d8fd4d639eb929930c182f42da054).
Original generated source fingerprints remain unchanged. The additional pinned
utils.js guard runs before its exported functions change; dependency files are
never rewritten. The public generated exports objects, conversions, actual
EventImpl classes, constructor/newTarget paths and dispatch algorithms remain
canonical. Utility worlds use their existing real wrappers, the same private
backend and their actual local VM getter. The audio installer captures Event.setup
after the generated factories are initialized, before authored code.

Native binary SHA256:
9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f.
The two recorded expressions cover 39 actual Native rows: 19 Event families,
own accessor descriptors, fake/proxy/null receivers, cloning, trusted focus,
ordinary symbols, dispatch, frame borrowing, cross-frame newTarget, subclassing,
captured TypeError and trusted-event redispatch. The candidate matches 36 rows
exactly. Three inherited generated diagnostics (`typeFake`, `typeProxy`,
`dispatchFake`) retain their prior message text while preserving actual VM
TypeError identity; the new own getter uses Native's `Illegal invocation`.
The tests keep that diagnostic boundary explicit.

The handoff evidence contains actual public-V8 `sameRealm` and `creationGlobal`
proofs before and after null prototypes, on Node 24.19.0, 24.22.1 and 26.13.0.
Public Window/frame/utility events and getters have their actual selected VM;
the real EventImpl remains Host-created and private. This does not use factory
metadata as creation-context evidence, prototype grafting, reflected-key filters,
heap filtering or an extra public facade.

Scope is Red Panda's pre-Window generated-factory initialization. Already live
external JSDOM windows with nonconfigurable legacy unforgeables are not migrated.
Other interfaces' implementation symbols and existing unsupported custom utility
adapters are outside this delta. The existing XHR direct Window.close retirement
failure was also reproduced unchanged on the Root baseline and is retained in
the handoff evidence; this slice does not change popup ownership or close rules.
