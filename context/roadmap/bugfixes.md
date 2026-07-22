# Known Bugs — Tracking and Fix Plan

> [Roadmap index](../../TODO.md) · [Shared constraints and Definition of Done](shared.md)

This document tracks confirmed bugs, their root causes, and the planned fixes.

---

## BUG-001 — Analog Vision turns all visual elements green `[P1]` — Fixed in 1.5.2

**Symptom:** Enabling Analog Vision makes the entire scene uniformly green. HUD elements that normally use distinct colors (the NOSEVIEW title, ALT/HDG readouts) lose their cyan tint and become green. Building antennas, landmark edges, and landmark accent lines also lose their distinguishing colors and become green variants.

**Affected files:**

- `styles.css` — `.canvas-wrap.analog-vision .hud` rule (line ~196) overrides the default HUD `color` from `#00eaff` (cyan) to `#67ff9a` (green) and replaces the blue text-shadow with a green one. All child text elements inherit this single green color.
- `src/engine/renderer.js` — the `render` function (line ~358–373) replaces the cyan/blue wireframe colors of antennas (`[0.0, 0.78, 1.0]`), landmark edges (`[0.0, 0.78, 1.0]`), and landmark accents (`[0.55, 0.96, 1.0]`) with green-only variants when `analogVisionEnabled` is true, eliminating all color variation.

**Root cause:** Analog Vision was designed as a monochrome CRT phosphor overlay but the current implementation applies the green tint too aggressively — both in CSS (overriding all HUD text to a single green) and in the renderer (replacing every accent color with a green channel–dominant value).

**Fix plan:**

- [x] Preserve the base HUD color distinction under Analog Vision. Instead of a blanket green override, apply a subtler green shift or keep the original cyan hue with a slight green bias so that the NOSEVIEW title and flight parameters remain readable against the green noise overlay.
- [x] Keep the crosshair orange/red identity under Analog Vision (currently unaffected, but verify).
- [x] Adjust the renderer antenna and landmark accent colors under Analog Vision to retain some color variation (for example, shift hues toward green-cyan rather than pure green, or preserve a warm accent for landmark accents).
- [x] Verify that navigation alerts (yellow/orange) remain visually distinct when Analog Vision is enabled.
- [x] Test the combined state: Analog Vision + HUD enabled, Analog Vision + HUD disabled, Analog Vision + Digital Rain.

**Fix history:**

- `1.5.1` — first pass: replaced blanket green with a teal HUD (`#4de6bc`) and shifted antenna/landmark hues toward green-cyan. Result was still perceived as insufficiently chromatic: HUD readouts, antennas and landmark accents still read as "greenish" under the green noise overlay.
- `1.5.2` — reinforced pass: NOSEVIEW title now uses an amber identity (`#ffc042` with warm shadow), ALT/HDG readouts stay clearly cyan (`#66f7ff`) with blue shadow, antennas shifted to bright cyan (`[0.25, 0.95, 1.0]`), landmark edges to cyan-teal (`[0.35, 0.95, 0.95]`), and landmark accents to warm amber (`[1.0, 0.75, 0.2]`) to survive the green overlay and remain chromatically distinct.

---

## BUG-002 — Navigation Limit bypassed by flying steeply upward `[P1]`

**Symptom:** When the player pitches the camera to a steep upward angle (near the 75° pitch clamp) and flies forward, the navigation boundary system never triggers warning or critical states, allowing the player to ascend indefinitely without a forced reset.

**Affected files:**

- `src/engine/navigation.js` — `calculateDistance` (line ~56–58) computes distance as `Math.hypot(position.x - centerX, position.z - centerZ)`, measuring only horizontal (XZ plane) displacement. Vertical (Y axis) distance is ignored entirely.
- `src/engine/flight.js` — forward movement follows both yaw and pitch (line ~191–205). At steep pitch the forward vector is almost entirely vertical: `cos(75°) ≈ 0.259`, so XZ displacement per frame is very small while Y displacement is large. The player's XZ distance from the city center barely changes, keeping them permanently in the `SAFE` state.

**Root cause:** The navigation boundary model was designed as a radial XZ-plane fence. There is no altitude-based boundary or 3D radial check, so vertical flight escapes the navigation envelope without triggering any state transition.

**Fix plan:**

- [ ] Extend the navigation distance check to include the vertical axis. Options to evaluate:
  - **Option A — 3D radial distance:** Change `calculateDistance` to `Math.hypot(x - centerX, y - centerY, z - centerZ)` with a configurable center altitude. This treats the boundary as a sphere around the city center.
  - **Option B — Separate altitude cap:** Keep the XZ radial check and add an independent maximum altitude threshold. Crossing either boundary triggers the same warning/critical/reset sequence.
  - **Option C — Cylindrical boundary with height cap:** Keep XZ radial logic but clamp or warn when Y exceeds a configured ceiling. The simplest change with the least risk to existing horizontal boundary behavior.
- [ ] Choose an option that preserves the existing horizontal boundary distances (warning 90, critical 120, reset 150) and does not change behavior for players who stay at normal flight altitudes.
- [ ] Add altitude values to the navigation configuration defaults.
- [ ] Add tests for the vertical escape scenario: verify that flying straight up at maximum pitch eventually triggers WARNING → CRITICAL → forced reset.
- [ ] Verify that normal rooftop-level flight does not produce false navigation warnings after the fix.
- [ ] Update `README.md` if boundary description changes.

---

## Checklist summary

| ID | Bug | Priority | Status |
| --- | --- | --- | --- |
| BUG-001 | Analog Vision makes all elements green | P1 | Fixed in 1.5.2 |
| BUG-002 | Navigation Limit bypassed by steep vertical flight | P1 | Open |
