# Native font metadata profile

`fonts-probe.mjs` exercises raw CDP against the official reference binary with
SHA-256 `9dec394124212f796724d4d32737ba66fdf0319ae6faaf8a1df8cccb4a70e23f`.
`fonts-observation.json` preserves its bounded local observations, including
exceptions, rather than claiming a full standards conformance result. The probe
waits for document readiness and enables worker resources when checking exposure.
Its context, socket and owned browser process closed successfully. This is a
local CDP observation, not a REA evidence-envelope artifact.

Reproduce with:

```sh
node docs/reference/fonts-probe.mjs /absolute/path/to/verified/lightpanda docs/reference/fonts-observation.json
```

## Observed contracts

- `FontFace` exists in Window and requires family and source arguments. Family
  is string metadata. Source coercion can throw; invalid CSS sources and a
  two-byte ArrayBuffer otherwise construct successfully.
- Status is immediately `loaded`. Defaults are style/weight/stretch/variant/
  featureSettings=`normal`, unicodeRange=`U+0-10FFFF`, display=`auto`.
  Authored descriptors, including a throwing descriptor getter, are ignored.
  Assigning the exposed descriptors does not change them. Other descriptor
  properties such as variationSettings/ascentOverride are absent.
- `face.loaded` and `face.load()` return fresh Promises resolving strictly to
  `undefined`, not the face. No request for the unique missing-font URL appeared
  in the probe's Network events.
- `document.fonts` is a stable FontFaceSet EventTarget. Its status is `loaded`,
  size is zero, and ready returns a fresh Promise resolving strictly to undefined.
  `new FontFaceSet(...)` throws TypeError `Illegal Constructor`.
- `add(face)` validates the FontFace brand and returns the same set. Adding
  distinct or duplicate faces leaves size zero. The native prototype exposes
  no `has`, `delete`, `clear`, `forEach`, values/entries, or Symbol.iterator.
  There are no onloading/onloadingdone/onloadingerror handler attributes.
- `check(font)` requires an argument but returns true even for invalid font
  syntax, null, numbers, Symbols and an unknown family. `load(font)` requires
  an argument and resolves undefined. Before returning, it dispatches plain,
  trusted `loading` then `loadingdone` Events synchronously. Status stays loaded;
  those Events have no fontfaces property. No loadingerror event was observed.
- Wrong receivers throw TypeError `Illegal invocation`; missing arguments and
  invalid add arguments throw TypeError `invalid argument`.
- With `--load-resources worker`, both blob and data-URL dedicated workers ran
  and reported FontFace, FontFaceSet, fonts and self.fonts all undefined.

## Independent implementation

`installFonts(window)` in `src/fonts.js` installs realm-owned constructors and
the document accessor during beforeParse, including actual child-frame realms.
Promises, errors and Events use the page realm. Shared weak registries preserve
FontFace brands across installed Window realms while keeping document font-set
identities distinct. The jsdom private event dispatch path preserves the trusted
flag for browser-generated font loading events.

This implements the measured **metadata-only native profile**. Its loaded status
does not mean a source was downloaded, decoded, selected, rendered or embedded.
Custom font rendering remains unsupported; no download or decoding success is
invented. Native-absent set iteration and membership methods remain absent.
Worker font globals are deliberately not installed because the enabled native
worker probe reported them absent.

`node --test test/fonts.test.js` passes all eight focused tests. The unchanged
upstream `css/font_face.html` and `css/font_face_set.html` both passed their
original `testing.assertOk()` harness with zero reported errors when this adapter
was installed before parsing. These checks establish the measured subset and
the Puppeteer document.fonts.ready contract, not the complete CSS Font Loading
standard. Descriptor validation/selection, font network lifecycle, CSS
font-face integration, real iterable membership and renderer font support are
outside this profile.
