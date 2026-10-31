# Measured Event API parity

The pinned Native binary is SHA256
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
The accompanying expressions and raw records contain 220 observations, including
12 main/utility dispatch rows. They measure constructor exposure and descriptors,
dictionary has/get order, conversion and readonly fields, authentic Promise
identity, modifier state, fractional/nonfinite coordinates, real dispatch,
reinitialization, private brands, cloning, and borrowed factory allocation.

CompositionEvent and InputEvent factories use their canonical generated
implementations. BeforeUnloadEvent is exposed with an illegal constructor;
createEvent allocates an uninitialized genuine Event with a private string
returnValue, which persists through initEvent. SecurityPolicyViolationEvent has
private readonly scalar fields and the observed initial propagation flags.
This event value interface does not implement Content Security Policy enforcement.

PromiseRejectionEvent retains a genuine Promise and the original reason object.
Missing/undefined authored fields default to null. Actual owned promise delivery
preserves the unhandled reason including undefined; both automatic events are
untrusted, and rejectionhandled has a null reason. The existing real async hook,
Promise ownership, cancellation and document retirement remain authoritative.

Mouse constructor coordinates are unrestricted doubles rounded toward negative
infinity, preserving nonfinite values and negative zero. Legacy initMouseEvent
retains its separate long conversions. AltGraph reflects altKey and Accel reflects
ctrlKey or metaKey; unsupported modifier state is false. Mouse which derives from
button, Keyboard which from keyCode, and layer coordinates reflect client values.

New values use the same actual Event wrapper and canonical EventImpl dispatch
backend, with Host-private extension slots and exact receiver identity. Reflected
symbols, inherited prototypes and proxies cannot authenticate. Public functions,
prototypes, getters and values have actual selected-VM creation contexts, verified
through public V8 before and after nulling prototypes. Controller records and
constructor tables remain Host objects; private state is not compiled into VM
CJS tables or returned by scalar public bridges.

Document.createEvent checks the private genuine Document factory record before
conversion, converts once, and uses the existing scoped real factory allocation
in the method's realm. Context/global registration is validated against the actual
VM global. The namespace-composed variant uses one startup capture helper for
both wrapper allocation and factory registry lookup.

This is a bounded Window/frame/utility slice. It retains the prerequisite's
explicit standalone EventTarget composedPath contents difference and genuine JS
function source; it adds no toString, prototype, key, protocol or heap masks.
Worker exposure and other Event APIs are not claimed by these controls.
