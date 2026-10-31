Event reuse correction, separate from Scheduler

Three additional actual Native Worker controls show that dispatch clears prior
stop flags before and after dispatch, while defaultPrevented survives. Node's
EventTarget retains stopImmediatePropagation between dispatches. The correction
creates a fresh actual private Node Event backend at each public dispatch, copies
actual type/bubbles/cancelable/composed/default-prevention values, and retains
public wrapper identity/timeStamp. It exposes Native's cleared post-dispatch
cancelBubble, while explicit stop calls outside dispatch still set it. Genuine
private abort-event backends continue driving real abort delivery.

Frozen base foundation patch is unchanged. This correction depends only on that
foundation. All previous48 plus new3 Native controls pass; final9 focused Worker
checks pass when Scheduler is also installed. No full suite was run.
