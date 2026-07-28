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

## BUG-002 — Navigation Limit bypassed by flying steeply upward `[P1]` — Fixed in 1.5.3

**Symptom:** When the player pitches the camera to a steep upward angle (near the 75° pitch clamp) and flies forward, the navigation boundary system never triggers warning or critical states, allowing the player to ascend indefinitely without a forced reset.

**Affected files:**

- `src/engine/navigation.js` — `calculateDistance` (line ~56–58) computes distance as `Math.hypot(position.x - centerX, position.z - centerZ)`, measuring only horizontal (XZ plane) displacement. Vertical (Y axis) distance is ignored entirely.
- `src/engine/flight.js` — forward movement follows both yaw and pitch (line ~191–205). At steep pitch the forward vector is almost entirely vertical: `cos(75°) ≈ 0.259`, so XZ displacement per frame is very small while Y displacement is large. The player's XZ distance from the city center barely changes, keeping them permanently in the `SAFE` state.

**Root cause:** The navigation boundary model was designed as a radial XZ-plane fence. There is no altitude-based boundary or 3D radial check, so vertical flight escapes the navigation envelope without triggering any state transition.

**Fix plan:**

- [x] Extend the navigation distance check to include the vertical axis. Options to evaluate:
  - **Option A — 3D radial distance:** Change `calculateDistance` to `Math.hypot(x - centerX, y - centerY, z - centerZ)` with a configurable center altitude. This treats the boundary as a sphere around the city center.
  - **Option B — Separate altitude cap:** Keep the XZ radial check and add an independent maximum altitude threshold. Crossing either boundary triggers the same warning/critical/reset sequence. ← **selected**
  - **Option C — Cylindrical boundary with height cap:** Keep XZ radial logic but clamp or warn when Y exceeds a configured ceiling. The simplest change with the least risk to existing horizontal boundary behavior.
- [x] Choose an option that preserves the existing horizontal boundary distances (warning 90, critical 120, reset 150) and does not change behavior for players who stay at normal flight altitudes.
- [x] Add altitude values to the navigation configuration defaults.
- [x] Add tests for the vertical escape scenario: verify that flying straight up at maximum pitch eventually triggers WARNING → CRITICAL → forced reset.
- [x] Verify that normal rooftop-level flight does not produce false navigation warnings after the fix.
- [x] Update `README.md` if boundary description changes.

**Fix history:**

- `1.5.3` — implemented Option B (separate altitude cap) in `src/engine/navigation.js`. Added `centerY` (default `10`, matching the player spawn altitude) and altitude thresholds `warningAltitude=90`, `criticalAltitude=120`, `resetAltitude=150` mirroring the radial ladder. `calculateState` and `calculateDegradation` now take both a radial distance and an absolute altitude excess (`|y - centerY|`) and pick the more severe axis; a `hard-limit` forced reset fires as soon as either axis reaches its reset threshold. `y` is optional in `navigation.update`/`reset` (falls back to `centerY`) so existing XZ-only tests keep passing. Added three new deterministic tests in `tests/cases.js` covering vertical ascent (SAFE → WARNING → CRITICAL → hard-limit at `y=160`), descent below the floor (`y=-145` forces reset), and custom altitude configuration + `RangeError` validation. Radial defaults (90 / 120 / 150 / 5s countdown) unchanged; rooftop-level flight at `y ≤ 60` stays SAFE.

---

## BUG-003 — Signal Hunt beacon acquisition range is too large `[P1]` — Fixed in 1.8.1

**Symptom:** The active radio beacon can currently be acquired from up to `80` world units away. This lets the player complete a scan without approaching the transmitter closely enough, reducing the intended search-and-approach challenge.

**Affected files:**

- `src/engine/signal-hunt.js` — `SCAN_MAX_DISTANCE` defaults to `80` and is used by the distance gate and signal-intensity calculation.
- `tests/cases.js` — Signal Hunt model tests need explicit coverage of the default maximum acquisition boundary.
- `index.html` — the visible revision label must receive the patch-version bump required for the implemented fix.

**Root cause:** The default `scanMaxDistance` was tuned too generously for the current city scale and beacon placement. The acquisition cone, two-second lock duration, and minimum distance are otherwise behaving as intended.

**Fix plan:**

- [x] Reduce the default `SCAN_MAX_DISTANCE` from `80` to `40`, exactly 50% of the current value.
- [x] Keep the configurable `scanMaxDistance` option working so tests and future tuning can still override the default.
- [x] Do not change the acquisition cone, minimum scan distance, two-second lock duration, guidance, or mission timer.
- [x] Verify the signal-intensity falloff still reaches zero at the new maximum distance and remains bounded between `0` and `1`.
- [x] Add deterministic tests proving that a correctly aimed target just inside `40` units can lock, while the same target just beyond `40` units cannot start or advance the lock.
- [x] Verify leaving the new distance boundary clears any partial lock progress and re-entering requires a fresh uninterrupted lock.
- [x] Apply the required patch-version bump to the visible `CITY NAVIGATION TERMINAL // REV. X.Y.Z` label.

**Acceptance criteria:**

- Default Signal Hunt acquisition works only from `2.5` through `40` world units, inclusive.
- A target farther than `40` world units may still provide guidance but cannot report `scan.inCone`, advance lock progress, or be acquired.
- Custom `scanMaxDistance` values retain their existing behavior.
- Existing Signal Hunt lifecycle, timer, event, replay, and completion tests continue to pass.

**Fix history:**

- `1.8.1` — reduced the default acquisition limit to `40` world units while preserving the `scanMaxDistance` override. Added deterministic coverage for the inclusive boundary, out-of-range guidance, zero intensity at/beyond the limit, lock reset on exit, and a fresh lock after re-entry.

---

## BUG-004 — Signal Hunt beacon lacks a visible transmitter body `[P2]` — Fixed in 1.8.3

**Symptom:** The active Signal Hunt beacon is represented only by animated circular signal waves. There is no physical transmitter at the center of those waves, so the target reads as a floating effect rather than a small rooftop radio beacon.

**Affected files:**

- `src/engine/renderer.js` — `drawMissionWaves` currently creates and draws only four circular wave rings around the active target.
- `tests/browser-runner.js` — renderer lifecycle or WebGL smoke coverage may need extension if the marker geometry changes observable rendering calls or buffer use.
- `index.html` — the visible revision label must receive the patch-version bump required for the implemented improvement.

**Root cause:** The first beacon presentation implemented the signal effect but omitted the low-poly transmitter body and antenna described by the visual design.

**Fix plan:**

- [x] Add a small square wireframe transmitter box centered on the existing mission target anchor.
- [x] Add a short vertical antenna rising from the top center of the box.
- [x] Keep the existing circular waves centered on the antenna/transmitter so they clearly read as a signal emitted by the device.
- [x] Match the current cyan wireframe palette and preserve readable color distinction when Analog Vision is enabled.
- [x] Keep the marker lightweight by reusing the existing mission marker buffer or other renderer-owned geometry; do not allocate new WebGL buffers or typed arrays every frame when static box and antenna geometry can be reused.
- [x] Preserve depth testing, blending, active shader program, vertex attributes, and all renderer state expected by subsequent passes.
- [x] Ensure city regeneration, mission abort/completion, context loss, and renderer destruction do not leave stale marker geometry or WebGL resources.
- [x] Respect `prefers-reduced-motion`: the box and antenna remain visible when wave animation is reduced or made static.
- [x] Apply the required patch-version bump to the visible `CITY NAVIGATION TERMINAL // REV. X.Y.Z` label.

**Acceptance criteria:**

- During an active Signal Hunt mission, the target visibly consists of a small square transmitter box, a vertical antenna, and the existing circular signal waves.
- The waves originate from the same target position as the physical transmitter and do not appear offset from it.
- The marker remains legible in the default view and with Analog Vision enabled.
- No beacon marker remains after the mission is aborted or completed.
- Default rendering performance and unrelated city, navigation, HUD, and Digital Rain visuals remain unchanged.
- Manual verification passes in a WebGL-capable browser for default, Analog Vision, Digital Rain, combined effects, and reduced-motion states.

**Fix history:**

- `1.8.2` — replaced the active-target diamond with an immutable local-space cyan wireframe transmitter box and short antenna, positioned at the mission anchor through the main shader's position offset. The existing four animated (or reduced-motion static) wave sets remain centered on that same anchor. The transmitter buffer is allocated once and deleted with the renderer; terminal mission states no longer render stale acquired markers.
- `1.8.3` — moved every signal ring to the transmitter antenna crossbar and removed vertical rings, leaving only circles parallel to the ground plane.

---

## Checklist summary

| ID | Bug | Priority | Status |
| --- | --- | --- | --- |
| BUG-001 | Analog Vision makes all elements green | P1 | Fixed in 1.5.2 |
| BUG-002 | Navigation Limit bypassed by steep vertical flight | P1 | Fixed in 1.5.3 |
| BUG-003 | Signal Hunt beacon acquisition range is too large | P1 | Fixed in 1.8.1 |
| BUG-004 | Signal Hunt beacon lacks a visible transmitter body | P2 | Fixed in 1.8.3 |
