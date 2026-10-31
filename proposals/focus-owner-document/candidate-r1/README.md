# Focus eligibility uses the actual owning Document

An authored own ownerDocument getter caused HTMLElement.focus() to enter script before its normal eligibility checks. Native focus/blur ignore that getter: the real element becomes active and matches :focus, then blur clears both states; getter reads stay zero.

integration.patch replaces one context lookup in renderedAndInteractive with the canonical NodeImpl._ownerDocument._defaultView. Existing eligibility, rendering/inert/disabled checks, real focus chains, events and blur logic remain. Apply after the CSS private-owner/selector patch and Attr adoption completion: focus eligibility uses computed style and private selector state from that composition.

The original sixth test failure remains in before-sixth-failure.log. Final unchanged six assertions pass, including positive author :focus stylesheet behavior; the exact three raw Native controls (Attr, computed owner and focus/blur) match, owner getter trace stays zero, and988 captured inputs are unchanged. Only Node24.22.1 focused validation was run; no all-SDK/full/source-deadline/heap/build/renderer/performance claim.
