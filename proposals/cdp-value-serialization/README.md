# Actual V8 protocol by-value serialization

Use `integration-current.patch`. Its six files contain a general serializer,
small additions to the existing private invocation and named-context inspector,
Session routing/cleanup, and focused regression controls. It applies cleanly to
current Root without changing its sync-XHR, DOM, codec or network implementations.
Exact before/after digests and tested source compositions are in `manifest.json`.
No Lightpanda production source was imported.

Native raw CDP does not use JSON.stringify for returnByValue. It serializes actual
own enumerable properties, executes actual enumerable getters, ignores inherited
toJSON, and serializes own function values as objects rather than invoking them.
This applies to ordinary authored objects and platform objects alike. The former
JSON.stringify path instead invoked toJSON, unboxed objects, converted Dates and
URLs to strings, omitted function-valued properties, and reported different errors
for cycles and nested unsupported values.

The proposal uses Node's real V8 inspector serializer on the original value in
the selected actual named VM. The existing RealmInspector supplies the same
context-name routing and cleanup used by Runtime lexical inspection. No default
Node context is evaluated, and no logical context alias or copied value substitutes
for the actual realm. A private invocation frame supplies the existing value to
the inspector. Its randomized lexical binding remains the existing documented
JavaScript binding, not a native private slot or hostile-code sandbox. No temporary
Window property or platform-type exception was added. By-reference metadata and
getter avoidance retain their previous paths.

Serialization errors propagate as protocol errors through evaluate, callFunctionOn,
runScript and awaitPromise. They are outside the latter commands' authored execution
catch blocks, so a serialization failure does not masquerade as a script exception
or rejected promise. BiDi uses its separate remote-value schema and is unchanged;
its existing regression tests are included in the focused checks.

## Real deadlines and interrupted host cleanup

V8's inspector timeout option alone did not interrupt an infinite serialization
getter. Both that experiment and the initial unbounded inspector path required
external4s termination; their failed evidence is preserved. They are not the final
implementation.

The final path places the entire inspector operation inside an actual vm.Script
deadline, using the selected page timeout capped at2000ms. Owned children verified
that an actual infinite getter stops at50ms on all three exact runtimes, with
subsequent real serialization, evaluation, heap identity queries and disposal.
Raw CDP controls also verified the actual request returns its timeout error and
continues accepting real queries on Node24.22.1 and26.13.0.

A shorter ancestor VM deadline can skip host finally blocks. A separate control
actually observed pending1/record1 after such interruption. Prequeued host-owned
checkpoints restored both to0, cleared the original private value frame, retained
an unrelated callback, and permitted new genuine serialization/heap/invocation
before clean teardown. This passed on all three runtimes. Cleanup tracks actual
operations, restores nested frames in reverse order, and defers inspector
disconnection until active commands unwind. Captured weak parent identities also
unwind a regular invocation entered by a getter when the ancestor deadline skips
its host finally; this additional control passed on all three runtimes. Cleanup
does not restore a previously completed unrelated frame. The child controls use core limit0
and an independent6s process deadline. The checked-in regression fixture exercises
both ordinary and ancestor interruption paths in a separately owned process.

The bound is an exercised JavaScript VM deadline, not a guarantee of forcibly
interruptible OS calls or V8 garbage collection. Current-thread inspector commands
must complete synchronously on the supported runtimes; an incomplete callback
fails explicitly rather than returning an inferred result.

## Executed evidence

- Final49 focused checks passed on Node24.22.1 and26.13.0, including safe
  by-reference metadata, Runtime, private invocation, real utility contexts and
  BiDi. The eight new serializer checks also passed on Node24.19.0.
- The same raw42-case driver compared own/inherited toJSON, accessors, actual
  proxy trap traces, boxed values, platform values, errors, arrays and cycles.
  The serializer-only composition matched41/41 available controls; its42nd
  result correctly reported missing VideoColorSpace. A separate frozen composition
  adding the values owner's real implementation matched all42, including the
  original direct VideoColorSpace result{} mismatch. This additional composition
  is separately hashed and is not relabeled as the49-check source.
- The corrected20-row raw method/realm driver matched Native across calls,
  persisted scripts, awaited promises, serialization failures, genuine foreign
  main values in utility, overwritten public JSON/apply methods and getter
  microtask order. Its initial setup-invalid driver/results remain preserved.
- Exact source, native-addon source, driver, child-control and report hashes are
  recorded. Earlier48-check logs predate timeout recovery; the earlier49-check
  logs predate its final parent-chain refinement. Final parent-chain logs and
  their corresponding raw controls identify the handoff bytes.

Full latest Root regression and the55-check PureScript integration remain parent
integration checks. These finite controls do not establish complete browser or
protocol parity. The actual by-value getter deadline currently reports the V8
timeout message through CDP code-32603; no Native timeout-code parity is claimed.
