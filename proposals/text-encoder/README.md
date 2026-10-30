# TextEncoder.encodeInto contract

This independent delta retains Node's actual UTF-8 encoder and byte destination.
It creates a real nonconstructable method in the API realm with two parameters,
checks a private successful-construction WeakSet before argument conversion,
converts the source before checking the destination, and returns an actual
method-realm object literal. Authored conversion exceptions retain identity;
generated conversion errors use the captured realm TypeError constructor.

`native.json` records the pinned binary's public raw-CDP control.
`candidate-before.json` preserves the original mismatches. The final observation
matches exactly, including error names/messages, method metadata, conversion
counts, bytes, detached destinations and result realm. The independently retained
source fixture pair also passes unchanged: TextEncoder and TextDecoder. Its native
subset comes from the earlier48-case capture; no unrelated missing-route result
is converted to a pass. Fixtures use the native external harness, iframe/worker
flags, document-complete/100ms settling and a15s diagnostic budget.

42 focused checks pass on Node24.19.0, including4 new tests. Those4 also pass on
Node24.22.1 and26.13.0. The full900-test/53-PureScript result belongs to parent
commit9f2a970; it is not represented as a new full-suite execution for this delta.
Other stream constructor, prototype, function-fingerprint and lifetime contracts
remain incomplete. No upstream engine source or fixed fixture output is used.

Reproduce the public control with:

```sh
node --experimental-vm-modules proposals/text-encoder/probe.mjs native /tmp/encoder-native.json
node --experimental-vm-modules proposals/text-encoder/probe.mjs candidate /tmp/encoder-candidate.json
node --experimental-vm-modules --test test/text-encoder.test.js
```

`manifest.json` binds the owned source, tests, probe and retained results.
