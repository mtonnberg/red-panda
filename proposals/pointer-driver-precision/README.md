# Pointer precision: actual Native causal controls

Pinned Native was exercised on owned ephemeral HTTP/CDP servers. All children
and ports closed. This is read-only evidence; Root and frozen Event artifacts
were not changed. Source, document, probe and executable hashes are embedded in
the raw records and indexed in `metadata.json`.

Native exposes `PointerEvent`. For input client coordinates 12.75/23.5,
`new MouseEvent('move'|'click', init)` produces 12/23; the corresponding screen
coordinates -2.75/-3.5 produce -3/-4. `new PointerEvent('move', init)` retains
all fractions. Pointer `click`, `auxclick` and `contextmenu` use floor semantics.

Actual `Input.dispatchMouseEvent` mouseMoved/Pressed/Released commands at
12.75/23.5 produce trusted pointermove/down/up at 12.75/23.5 and trusted
mousemove/down/up at 12/23. The resulting click is a trusted PointerEvent at
12/23. Native uses screen coordinates 0/0 in this CDP control. Target IDs in
this document are empty and do not establish hit-test layout parity.

This supports a narrow privileged driver fix: after constructing genuine
pointer move/down/up events, restore their actual private implementation
coordinates from already validated CDP input. Leave click/auxclick/contextmenu
integer paths intact. This avoids authored dictionary rereads or public getter
facades and does not change the proven MouseEvent conversion behavior.

Additional controls guide a later independent PointerEvent implementation:
rounding follows the **current event type**, not destructive initial coordinate
conversion. A fractional pointermove reinitialized to click reads floor values;
a pointer initially constructed as click and then reinitialized to pointermove
recovers its original fractions. PointerEvent.prototype has no own coordinate
getters; borrowing the actual MouseEvent.prototype clientX getter observes the
same dynamic result. The narrow driver fix does not claim to implement this
wider public constructor/reinitialization behavior.
