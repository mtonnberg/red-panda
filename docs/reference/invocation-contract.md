# Protocol function invocation

Page.callFunction now compiles the declaration in the actual selected page VM,
then invokes it using a Reflect.apply captured before authored code. A private
per-context lexical controller holds only the current host invocation frame;
there is no temporary Window property. Nested invocation restores the prior
frame in finally. Receivers, argument identities, callable Proxies, thrown
values and actual returned promises retain their engine behavior.

The existing VM timeout applies separately to declaration compilation and the
synchronous function body. It is not a total asynchronous execution deadline:
promise continuations, later timers and network waits are not made CPU-bounded
by this adapter. Full native --terminate-ms behavior remains unfinished.

The randomly named lexical binding is not a V8 private slot. Code that learns
its name can address it; the page runtime remains trusted-code-only. The owned
binding is excluded by exact identity from Runtime.globalLexicalScopeNames;
authored lexical names remain visible. Captured realm JSON parsing and protocol
caller/context/object-group validation are independent retained mechanisms.

The isolated deadline investigation remains under docs/reference and the
invocation source was adapted from the owned proposal in
/tmp/red-panda-termination.okPPv2/proposal/invocation.mjs. Production verification
is test/invocation.test.js plus the existing raw CDP/runtime/PureScript suites.
