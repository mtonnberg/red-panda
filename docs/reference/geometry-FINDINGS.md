# Independent geometry and pointer observations

These measurements use the official native reference binary whose SHA-256 is
`9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
The probe uses raw CDP and waits for `document.readyState === 'complete'`.
No upstream implementation source was used to implement the independent model.

Valid REA captures:

| File | Evidence ID | Scope |
| --- | --- | --- |
| geometry-evidence.json | ev_b2e5629ba3357f5d8bdc68a54be28fb11c51c83acca4fd2406b0f4dd523f2cdb | Initial boxes and pointer targeting |
| geometry-centers-evidence.json | ev_34cc9685cc96191e71e12e1930b36ce6bf67d0f93534869f4d5ac12e634a7598 | Returned centers and hit tests |
| geometry-flow-verified-evidence.json | ev_3b516df7868ce699894bbee4b6507fcf1532da3225ef3420a108be2d4448fdf4 | Dynamic insertion, whitespace, fractions, scrolling |
| geometry-extended-evidence.json | ev_0c6d0ce72e958f6c79c40128966b20e48ca85c7592bc28de19aee9faa0f15924 | Middle-document scrolling and default element shapes |

Each valid capture exits zero, retains untruncated output, and records cleaned
owned resources. `geometry-flow-partial.json` preserves a failed capture whose
cleanup could not be verified inside its original sandbox; it is not evidence.
The parent subsequently established that its processes had already exited and
its port was closed, then reran the scenario with the required process access.
Scenario files and `geometry-probe.mjs` preserve reproduction instructions.

## Measured behavior

- The fixture's styled button has bounding box `(0,35,240,80)`, despite authored
  absolute left/top, margins, padding and border. Its unstyled sibling is
  `(240,45,5,5)`. A nested button is `(245,75,10,12)`; its DIV parent is
  `(245,70,1920,12)`.
- CDP quads agree with WebAPI bounds. Box model content, padding, border and
  margin all contain the same quad. Fractional quad dimensions survive, while
  model width/height truncate toward zero. Hidden elements and descendants have
  zero bounds/quads and an empty client rectangle list.
- Element Y is five times its current DOM preorder index, counting Document,
  doctype, elements, comments and text. Prepending a two-node button shifts later
  Y values by ten; adding whitespace shifts them by five. Whitespace adds no
  horizontal advance. A longer button label remains five pixels wide.
- Sibling horizontal advance differs from bounding width: a default DIV may
  have viewport-width bounds but advance the following sibling by five pixels.
  Explicit widths advance by their authored value. Text-only and empty DIVs
  have width1920; a SPAN with a B child and a BUTTON with a B child have width5.
  An explicitly inline DIV has width5.
- The captured long documents with default boxes have scrollHeight equal to
  five times all preorder nodes, including hidden nodes. Root scrollHeight is
  at least the viewport height; body scrollHeight follows its synthetic box.
  Root clientHeight is the viewport height. Later inline-sizing probes below
  establish additional document extents and horizontal scrolling.
- A target at document Y1365 with height5 and document height1375 scrolls to
  window.scrollY295, the maximum for a1080px viewport. With500 nodes appended
  after it, the same target scrolls to window.scrollY1365 and viewport Y0.
  Root scrollTop remains zero in both observations.
- Hit testing at returned centers identifies the corresponding button.
  `elementsFromPoint(250,81)` gives nested button, container, BODY, HTML.
  Origin `(0,0)` and negative coordinates have no hit-test result. Input mouse
  events on a nonnegative miss nevertheless target HTML; negative coordinates
  emit no events. These input defaults belong in the Input implementation.
- At fractional center `(242.5,47.5)`, pointer events retain fractional
  coordinates and MouseEvents truncate them. The captured sequence is mousemove,
  pointerdown, mousedown, pointerup, mouseup, click. Press/release/click focus
  the button when their coordinates hit its returned box.

## Independent model and limits

`src/layout.js` exports `createLayout(window, options)` and
`installLayout(page, window, options)`; the latter stores `page.layout` and
installs the relevant WebAPI adapters. The default viewport is1920x1080.
The layout object exposes `rect`, `rects`, `quads`, `boxModel`, `hitTest`,
`elementsFromPoint`, `intersection`, `setViewport`, `scrollTo`, `scrollBy`,
`scrollIntoView`, and the `viewport`, `scroll`, and `documentSize` getters.
`scrollIntoView(node, rect)` accepts an optional local rectangle.

This is a deterministic headless surrogate, not a CSS renderer. Its supported
dimension subset is nonnegative numeric pixel widths and heights. It ignores
CSS positioning, transforms, margin/padding/border geometry, complex sizing,
line wrapping, fonts, tables, flex/grid, pseudo-elements, and nested scrolling.
The block-tag and intrinsic-advance rules generalize the measured fixtures;
they are not established for every HTML element or combination. Visibility and
pointer-events filtering are useful conservative behavior and have not been
exhaustively compared with native. Shadow/frame geometry is not established.
The computed-style adapter changes width/height; other computed values use
jsdom and can differ from native (for example default BUTTON display).
Direct CSSOM insertRule/deleteRule changes can encounter jsdom's computed-style
cache limitation; stylesheet text/attribute changes are covered. Scroll event
timing, scroll options and smooth behavior have not been matched.

Additional owned raw-CDP probes in `geometry-sizing-observations.json` and
`geometry-viewport-observations.json` are black-box observations, not REA Evidence
records. They establish summed intrinsic child heights, different root/body
scroll extents, horizontal scrolling for wide inline boxes, nested inline
overflow, and coordinate rounding before viewport-bound checks. The model
distinguishes computed element boxes from document extents: stylesheet-only
heights do not advance the measured document like inline heights. These rules
fit the retained cases; complete arbitrary-page sizing remains unverified.

`test/layout.test.js` compares the complete static capture and six dynamic
preorder snapshots, plus hit tests, fractional model rounding, default shapes,
scroll extents/alignment, viewport changes, stylesheet updates, replacement
nodes, hidden/detached geometry, and standalone adapter isolation.
