# Genuine Event interface realms

Window and frame generated Event/EventTarget interface objects are now allocated
in their actual selected VM. Genuine no-runScripts Host JSDOM origins retain
their original Host interface objects; no VM context is invented. This includes constructors, prototypes, methods,
getters and setters. The same canonical generated exports, original Host
conversion algorithms, private EventImpl state and dispatch algorithms remain.

A strict ordinary VM constructor lets V8 create the actual receiver before its
body runs. The original constructor conversion body initializes that SAME
receiver through canonical setup. This preserves Native's single observable
newTarget.prototype read before conversion, actual selected-VM allocation with a
foreign newTarget, and own/foreign Object.prototype fallback for primitive
prototype values. Calling without new throws the captured VM TypeError. No
constructor Proxy, prototype-only context repair or public Event facade is used.

Public methods/accessors are genuine strict VM functions calling captured Host
operations. The controller/cache tables, original interface objects, conversion
functions and backend references remain Host-private. Event brands retain the
shared private map. EventTarget keeps its existing generated backend authority.
The Host bridge resolves EventTarget's measured unbound/null/undefined Window
receiver behavior and uses the captured VM TypeError for illegal receivers.
Names, lengths, descriptors and hierarchy are installed on the actual objects.
Event/EventTarget properties are physically defined in the measured order.
Nothing filters reflected keys, heap membership, Function.toString or protocol
results. Function.toString reports the actual JavaScript implementation.

Event.composedPath returns a genuine fresh Array in the method's realm with the
actual backend's path entries. Authored MessageEvent.ports returns a fresh
mutable VM Array. Existing frozen producer ports arrays keep their original
receiving-realm identity and profile. Utility interfaces were already generated
in their actual VM; their allocation profile is unchanged and independently
measured alongside Window/frame interfaces.

The raw Native binary SHA256 is
9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f.
Five expressions retain30 Native rows. Candidate matches29 exactly. The one
explicit inherited difference is the actual path content for a standalone
EventTarget: jsdom includes that target while Native omits it. Actual path values
are never replaced by a saved vector or an invented empty path. The controls
cover descriptors, reflection order, borrowed methods, newTarget, conversion
ordering, primitive prototype fallback, hierarchy, subclassing, nonconstructible
methods, illegal receivers, fresh arrays and global calls.

Direct public-V8 proofs cover439 actual constructor/prototype/member/receiver
values per runtime, before and after null prototypes. All are selected-VM,
Host=false and creationGlobal matches. The original baseline retained57 Host
objects among65 sampled public values. These are actual V8 creation-context
checks, independent of factory metadata or prototype appearance.

Scope:20 generated Window/frame Event/EventTarget interfaces. Worker private
Event foundation, custom interface dictionaries, original conversion diagnostic
messages, EventTarget's legacy physical backing, other generated Node interface
realms, and utility constructor ordering remain separate work. The independently
owned private-event utility backend recognition correction is a prerequisite for
correct backend-to-utility callback delivery; it is not duplicated in this patch.

Native Function::New and FunctionTemplate constructor entry experiments are
retained as contrary evidence only. Their actual selected-VM receiver allocation
was positive, but both introduced nonconfigurable arguments/caller properties
absent from Native. No experimental C++ API, source or addon is used here; the
production runtime.cc remains the frozen c9842bf9 source.
