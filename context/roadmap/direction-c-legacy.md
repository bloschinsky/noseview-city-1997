# Direction C — Legacy Compatibility Edition

> [Roadmap index](../../TODO.md) · [Shared constraints and Definition of Done](shared.md)

## Milestone 8 — NOSEVIEW 1997: Trident Edition `[P3]`

Goal: produce a museum-grade Internet Explorer 11 build without degrading the canonical edition.

### Scope

- [ ] Target Internet Explorer 11 and ES5.
- [ ] Keep WebGL 1 as the primary renderer.
- [ ] Do not target ES3 or Internet Explorer 8 in this milestone.
- [ ] Do not use Vue 3; Vue 3 does not support IE11.
- [ ] Treat the edition as an isolated retro experiment, not a security recommendation.

### Build output

- [ ] Use the canonical classic-script source layout as the starting point.
- [ ] Transpile modern syntax for IE11 with Babel `preset-env`.
- [ ] Include only required ES5-era polyfills.
- [ ] Either preserve the ordered multi-file layout or create a Trident-only concatenated IIFE bundle for distribution.
- [ ] Ensure IE11 receives only classic scripts and never receives a native module entry point.
- [ ] Keep source maps available for debugging but out of the default page payload if unnecessary.

Likely transforms or polyfills include:

```text
const / let
arrow functions
template literals
for...of
async / await or Promise removal
Set
Array.from
Math.hypot
Math.imul
String.padStart
Promise, if any legacy feature still requires it
```

### CSS compatibility

- [ ] Add a fallback for `aspect-ratio`.
- [ ] Replace or progressively enhance modern CSS Grid usage.
- [ ] Add fixed-value fallbacks before `clamp()` declarations.
- [ ] Add opacity fallbacks before CSS custom-property declarations.
- [ ] Simplify unsupported blend and filter effects without hiding essential UI.
- [ ] Verify that all buttons and status fields remain usable at desktop widths.
- [ ] Preserve the deliberately retro visual style.

### Feature degradation

- [ ] Disable procedural Web Audio cleanly when the API is unavailable.
- [ ] Optionally provide a pre-rendered audio file through `<audio>`.
- [ ] Keep HUD, movement, collision, regeneration, boundaries, and Signal Hunt functional.
- [ ] Provide an explicit WebGL failure screen for unsupported GPU or driver configurations.

### Validation

- [ ] Test in an isolated Windows virtual machine with standalone IE11.
- [ ] Test with hardware acceleration enabled and disabled.
- [ ] Confirm that shader compilation succeeds on IE11 WebGL 1.
- [ ] Confirm keyboard and pointer controls.
- [ ] Confirm that the ES5 bundle contains no syntax that causes an IE11 parse error.
- [ ] Document known visual differences from the canonical edition.
- [ ] Add a security notice recommending an isolated VM and no personal browsing.

### Acceptance criteria

- The default city renders in IE11 through WebGL 1.
- Core flight, collision, mission, and reset behavior works.
- Unsupported optional features fail visibly and safely.
- No Vue 3 or native module script is shipped to IE11.
- The canonical edition remains unaffected by legacy compatibility code.
