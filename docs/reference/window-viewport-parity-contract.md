# Window viewport and scroll profile

VisualViewport, Screen and ScreenOrientation use actual selected-VM public
constructors, prototypes, accessors and front objects over canonical EventTarget
implementations. Their constructors are illegal, dynamic fields have exact
private brands, and the measured constants retain their actual descriptor shape.
The existing real EventTarget factory initializes the same actual front object.
Backend and factory maps are Host-owned; reflected implementation symbols, fake
prototypes, proxies and authored Symbol.hasInstance hooks cannot authenticate.

Viewport and device metrics come from captured actual Document/layout records
and a separate Host Browser device record. Frames expose the observed shared
main-realm metric objects; isolated worlds have genuine own-VM fronts over the
same backend. No retained metric getter resolves authority through a mutable
public WindowProxy. Device width/height/DPR and optional screen sizes persist
through navigation; zero/omitted dimensions retain the existing override.
The native profile ignores screenOrientation and mobile/scale extras. No
resize/change events are invented for device metric updates.

Window scroll offsets and Element implementation fields are real state. Calls
perform the measured int32 conversion, relative arithmetic and computed extent
clamping. Window writes update VisualViewport page offsets synchronously.
Queued delivery creates new genuine trusted Events and uses actual backend
routing: Document scroll/scrollend bubbles, ordinary Element delivery does not.
The measured two-phase element task changes state before callbacks, preserving
reentrant writes. Tasks belong to the actual owner Document and are canceled
when that document retires. Scroll commands create no synthetic user actions.

The implementation independently uses the observed 10ms/20ms scheduling model;
it does not replay captured event/coordinate vectors or cap event/node counts.
Body explicit height and nested root-tag handling use real style/tree state.
No pinch zoom or fullscreen is implemented: the measured constant viewport
scale and unsupported fullscreen/orientation-lock Promise failures are exposed.

Pinned Native SHA256:
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
Raw expressions and Native records are in window-viewport-parity/. Production
imports no Native engine source; reference-only source digests are archived.

Bounds: the broader direct-Target migration must validate existing messaging
and networking fronts before integration. Window/Node physical implementation
symbol migration is separate. General faux-layout and text-rendering bounds
remain: Page.getLayoutMetrics content size still uses the existing document
extent, whereas Native uses its text renderer's content height. No equality for
that preexisting renderer metric is claimed by these viewport-value controls.
Cross-window borrowed scroll-event scheduling beyond the recorded owner-frame
controls and additional unsupported APIs remain separate compatibility work.
