# Direction A — Canonical Vanilla Edition

> [Roadmap index](../../TODO.md) · [Shared constraints and Definition of Done](shared.md)

## Milestone 0 — Preserve the Current Baseline `[P0]`

Goal: create a known-good reference before structural changes.

- [x] Confirm that the deployed GitHub Pages files match the current default branch.
- [x] Create a local annotated `v1.3.4` tag for the current stable baseline if that tag does not already exist; leave remote publication to the repository owner.
- [x] Record the baseline browser test matrix in `README.md` or `docs/testing.md`.
- [x] Capture at least one desktop screenshot of the default state.
- [x] Capture at least one screenshot with Analog Vision and Digital Rain enabled.
- [x] Record the current expected controls, initial camera position, speed modes, and default settings.

### Baseline manual test checklist

- [x] The city renders with 26 structures.
- [x] `W/A/S/D` movement works.
- [x] Arrow-key view control works.
- [x] On-screen pointer/touch controls work.
- [x] Reset restores the documented initial camera state.
- [x] Speed cycling works through Slow, Normal, and Fast.
- [x] City regeneration creates a new city and resets the camera.
- [x] Building wall and rooftop collisions work.
- [x] HUD, Analog Vision, Digital Rain, and Sound toggles work.
- [x] The settings dialog traps and restores keyboard focus correctly.
- [x] Reduced-motion mode disables or simplifies animated overlays.

### Acceptance criteria

- The stable starting point can be restored from a tag.
- Expected visual and gameplay behavior is documented before refactoring.
- No gameplay or visual behavior is changed in this milestone.

---

## Milestone 1 — Split the Engine into Classic JavaScript Files `[P0]`

Goal: split the monolithic script into maintainable, framework-agnostic classic JavaScript files without changing the visible product or the direct-open local workflow.

This milestone explicitly does **not** use native ESM. Do not add `import`, `export`, `<script type="module">`, dynamic module loading, a development server, a bundler, or a build pipeline to the canonical edition.

### 1.1 Define the engine boundary

- [x] Introduce a `createNoseviewEngine()` factory.
- [x] Define the public engine API before moving implementation code.
- [x] Keep WebGL objects, buffers, audio nodes, and animation state private to the engine.
- [x] Expose commands instead of exposing mutable internal objects.
- [x] Add a throttled telemetry callback or subscription for UI data.
- [x] Add a complete `destroy()` path for animation frames, timers, audio, and event listeners.

Suggested public API:

```js
const engine = window.Noseview.createNoseviewEngine(canvas, {
  onTelemetry(snapshot) {},
  onMissionEvent(event) {},
  onError(error) {}
});

engine.start();
engine.destroy();
engine.resetCamera();
engine.regenerateCity();
engine.setControl("forward", true);
engine.cycleSpeed();
engine.setEffect("hud", true);
engine.setEffect("analogVision", false);
engine.setEffect("digitalRain", false);
engine.setSoundEnabled(false);
```

The exact names may change, but the engine must not depend on Vue or direct knowledge of the surrounding page layout. `window.Noseview` should be the only intentional application-level global.

### 1.2 Extract responsibilities into ordered classic scripts

- [x] Create a single `window.Noseview` namespace before loading subsystem files.
- [x] Wrap every file in an IIFE so private implementation details do not leak into the global scope.
- [x] Publish only deliberate subsystem APIs on `window.Noseview`.
- [x] Document the dependency and loading order in `index.html` and `AGENTS.md`.
- [x] Keep all script tags together at the end of `<body>`.
- [x] Use plain ordered `<script src="..."></script>` tags without `async`, `type="module"`, or dynamic injection.
- [x] Ensure every source file can load from a relative path under `file://`.

- [x] Move vector, matrix, projection, normalization, cross-product, and look-at helpers to `src/engine/math.js`.
- [x] Move seeded RNG and procedural city generation to `src/engine/city.js`.
- [x] Return building metadata together with geometry and colliders from the city generator.
- [x] Move collision and camera movement logic to `src/engine/flight.js` or `src/engine/collision.js`.
- [x] Move shader compilation, buffers, draw passes, and WebGL state restoration to `src/engine/renderer.js`.
- [x] Move Analog Vision behavior to `src/effects/analog-vision.js`.
- [x] Move Digital Rain generation and sky-texture updates to `src/effects/digital-rain.js`.
- [x] Move Web Audio synthesis and scheduling to `src/audio/music.js`.
- [x] Move keyboard, pointer, focus, and settings bindings to `src/ui/controls.js`.
- [x] Keep `src/main.js` limited to application bootstrap and subsystem wiring.
- [x] Load `src/main.js` last so every required subsystem is already registered.

Suggested file wrapper:

```js
(function (root) {
  "use strict";

  const Noseview = root.Noseview = root.Noseview || {};

  function privateImplementation() {
    // File-private logic.
  }

  Noseview.math = {
    example: privateImplementation
  };
}(window));
```

Suggested structure:

```text
src/
├── namespace.js
├── main.js
├── engine/
│   ├── engine.js
│   ├── math.js
│   ├── city.js
│   ├── flight.js
│   └── renderer.js
├── effects/
│   ├── analog-vision.js
│   └── digital-rain.js
├── audio/
│   └── music.js
└── ui/
    ├── controls.js
    └── hud.js
```

Suggested script loading order:

```html
<script src="src/namespace.js"></script>
<script src="src/engine/math.js"></script>
<script src="src/engine/city.js"></script>
<script src="src/engine/flight.js"></script>
<script src="src/engine/renderer.js"></script>
<script src="src/effects/analog-vision.js"></script>
<script src="src/effects/digital-rain.js"></script>
<script src="src/audio/music.js"></script>
<script src="src/ui/hud.js"></script>
<script src="src/ui/controls.js"></script>
<script src="src/engine/engine.js"></script>
<script src="src/main.js"></script>
```

The final order may change when real dependencies are extracted. It must remain explicit and deterministic. Do not split tiny functions into separate files solely to increase the file count.

### 1.3 Add low-cost automated tests

- [x] Add deterministic tests for the seeded RNG.
- [x] Verify that the same seed produces identical building metadata.
- [x] Verify that every generated solid structure has matching collider data.
- [x] Test collision behavior against walls, corners, rooftops, and tiered structures.
- [x] Test camera pitch clamping.
- [x] Test diagonal movement normalization.
- [x] Test heading normalization and HUD formatting.
- [x] Add a dependency-free `tests.html` harness that loads the required classic scripts in order and can run through `file://`.
- [x] Optionally mirror pure-logic tests in Node, but do not make Node a requirement for opening or playing the canonical edition.
- [x] Keep test-only tooling out of the production payload.

### 1.4 Preserve the direct-open development workflow

- [x] Keep `index.html` directly runnable after downloading or cloning the repository.
- [x] Document `Open index.html in a browser` as the primary local run instruction.
- [x] Verify the project from a directory whose path contains spaces.
- [x] Verify that no browser request depends on HTTP-only behavior or absolute server paths.
- [x] Keep all canonical runtime assets local to the repository.
- [x] Keep the source compatible with the existing build-free GitHub Pages deployment; the repository owner handles all pushes and deployment publication manually.
- [x] Update `AGENTS.md` validation commands after `script.js` is removed.

### Acceptance criteria

- Default visuals and controls match the `v1.3.4` baseline.
- The engine has no dependency on Vue or another UI framework.
- The UI does not directly mutate camera, renderer, or audio internals.
- Pure generation, math, formatting, and collision logic can run in tests without a browser.
- Every event listener, timer, audio source, and animation loop has a cleanup path.
- A downloaded or cloned copy works by opening `index.html` directly through `file://`.
- GitHub Pages uses the same source files as the direct-open local version.
- The canonical edition has no bundler, generated bundle, package-install requirement, or mandatory development server.

---

## Milestone 2 — World Safety and Navigation Boundaries `[P1]`

Goal: prevent the player from flying under the world or becoming lost in empty space.

### 2.1 Ground and altitude limits

- [x] Add a configurable minimum camera altitude based on camera collision radius.
- [x] Prevent forward movement from pushing the camera below the ground plane.
- [x] Preserve rooftop collision behavior.
- [x] Clear vertical velocity when reset or ground correction occurs.
- [x] Add tests for steep downward movement at all three speed modes.

### 2.2 Navigation boundary states

- [x] Define configurable warning, critical, and reset boundary distances.
- [x] Start signal degradation before the hard world limit.
- [x] Display `NAVIGATION LIMIT` when the warning boundary is crossed.
- [x] Display `OUT OF NAVIGATION AREA` at the critical boundary.
- [x] Increase visual signal noise as the player moves farther outside the safe area.
- [x] Start a visible return countdown in the critical state.
- [x] Reset the camera if the player remains outside the hard boundary.
- [x] Cancel the countdown when the player returns to the safe area.
- [x] Ensure boundary warnings are available as text, not only as visual noise.
- [x] Keep reduced-motion behavior usable and non-flashing.

### 2.3 Navigation audio cues

- [x] Play a procedural retro attention signal on the first navigation warning.
- [x] Emit deterministic one-second countdown ticks, with a double final tick.
- [x] Play a layered procedural teleport sweep on automatic return.
- [x] Share the lazy Web Audio context and keep all cues silent while `SOUND` is disabled.
- [x] Cancel pending navigation cues when the player leaves the critical area or resets manually.
- [x] Cover navigation events, audio scheduling, cancellation, and lazy initialization with tests.

Suggested state model:

```text
SAFE → WARNING → CRITICAL → FORCED RESET
  ↑        ↑          |
  └────────┴──────────┘ return toward city
```

### Acceptance criteria

- The camera cannot move below the ground plane.
- The player receives clear warning before a forced reset.
- Boundary behavior is deterministic and independent of frame rate.
- Reset clears warning state, countdown state, input state, and motion state.
- When sound is enabled, warning, countdown, and forced-return states have distinct procedural audio cues.

---

## Milestone 3 — Procedural Landmarks `[P1]`

Goal: make generated cities recognizable and easier to navigate without losing the primitive low-poly style.

- [x] Extend city output with structured building and landmark metadata.
- [x] Add at least three landmark types.
- [x] Implement a telecommunications tower.
- [x] Implement a narrow spire or needle tower.
- [x] Implement a rooftop helipad or large antenna complex.
- [x] Give every solid landmark synchronized face, edge, and collider geometry.
- [x] Prevent landmarks from blocking the initial camera spawn corridor.
- [x] Make landmark placement deterministic for a given city seed.
- [x] Ensure landmarks remain visually distinct in default and Analog Vision modes.
- [x] Decide whether landmarks replace ordinary structures or increase the displayed structure count, then document the rule.

Landmarks replace three ordinary structures within the existing 26-structure city total. Every city contains one landmark of each type.

- [x] Spawn the mission on the helipad-complex landing pad and route `RESET POSITION` / `R` to that pad; `GENERATE NEW CITY` regenerates the layout without moving the pilot (`1.5.4`, via `Noseview.city.getMissionStart` and `flight.setInitialCamera`).
- [x] Add a short, dull "bump" sound effect (collision cue) when the camera hits a wall or the floor; use a cooldown to prevent rapid repeats (`1.5.5`, via `flight.update` returning a blocked status and `music.playCollisionCue`).

### Acceptance criteria

- Every generated city contains two or three visually distinct landmarks.
- The same seed produces the same landmark types and positions.
- Landmark geometry does not introduce collision holes.
- Landmarks can later be selected as valid Signal Hunt locations.

---

## Milestone 4 — SIGNAL HUNT Game Mode `[P1]`

Goal: turn free flight into a short replayable game without removing the original exploration mode.

### 4.1 Mission state

- [x] Keep Free Flight as the default mode.
- [x] Add a clear `START SIGNAL HUNT` control.
- [x] Implement explicit mission states: `IDLE`, `ACTIVE`, and `COMPLETE`.
- [x] Start the mission timer only when the player starts Signal Hunt.
- [x] Stop the timer immediately when the final signal is scanned.
- [x] Reset mission state when a new city is generated.
- [x] Decide and document whether camera reset restarts or preserves the active mission.

### 4.2 Signal generation

- [x] Generate between three and five signal beacons per mission.
- [x] Select unique valid buildings or landmarks for beacon placement.
- [x] Place beacons above roofs or landmark platforms, never inside solid geometry.
- [x] Exclude structures too close to the initial camera position.
- [x] Store stable beacon IDs, positions, status, and host-structure metadata.
- [x] Keep beacon generation deterministic for a given city and mission seed.
- [x] Ensure every generated mission is completable.

Default routes deterministically select three to five targets from the city and mission seed. Candidate anchors must be at least 14 horizontal world units from the helipad spawn and clear every solid collider by the camera radius; multi-seed route tests verify that every selected sequence can be completed.

### 4.3 Beacon rendering

- [x] Add a low-poly beacon marker that fits the existing wireframe aesthetic.
- [x] Make the active signal readable against buildings, Digital Rain, and Analog Vision.
- [x] Add restrained pulse or flicker animation.
- [x] Provide a reduced-motion beacon presentation.
- [x] Avoid expensive new per-beacon draw calls when geometry can be batched.

Active waves use a high-contrast color when Digital Rain or Analog Vision is enabled. Reduced motion replaces the pulse with fixed rings, while active and acquired markers are batched by status into at most two draw calls.

### 4.4 Target acquisition and scanning

- [x] Detect when an unscanned beacon is inside the crosshair acquisition cone.
- [x] Require continuous aim for two seconds to complete a scan.
- [x] Show scan progress in the HUD.
- [x] Cancel or decay progress when the target leaves the acquisition cone.
- [x] Prevent multiple beacons from being scanned simultaneously.
- [x] Mark completed beacons visually and exclude them from later acquisition.
- [x] Emit an optional audio cue only after user-enabled sound interaction.
- [x] Keep scan timing independent of frame rate.

Initial tuning values:

```text
Beacon count:       3–5
Scan hold time:     2.0 seconds
Acquisition cone:   approximately 2–3 degrees
Telemetry refresh:  no more than 10 updates per second
```

These values are tuning defaults, not hard-coded architectural constraints.

### 4.5 Mission HUD and completion screen

- [x] Show mission status while Signal Hunt is active.
- [x] Show scanned count, total count, current timer, and scan progress.
- [x] Add `SIGNAL ACQUIRED` feedback after each successful scan.
- [x] Add a `MISSION COMPLETE` overlay after the final scan.
- [x] Show completion time and number of signals.
- [x] Provide controls to replay the mission or generate a new city.
- [x] Trap and restore focus correctly when the completion overlay is open.
- [x] Keep all essential mission information accessible as text.

The completion dialog remains open until the pilot chooses replay or a new city. It traps keyboard focus, restores focus to an available mission control, and exposes the result and both actions as semantic text and buttons.

### Acceptance criteria

- Free Flight still works without starting a mission.
- Every generated mission contains three to five completable signals.
- A scan requires two continuous seconds of valid aim.
- Timer and scan progress behave consistently at low and high frame rates.
- Completion occurs exactly once after the final beacon.
- Regenerating the city cannot leave stale beacon geometry or mission state.

---

## Milestone 5 — Optional WebGL Starfield Sky `[P2]`

Goal: add a restrained white starfield as an optional WebGL-rendered sky while keeping Digital Rain and the default black sky unchanged and mutually exclusive.

Status: completed in `1.9.1`.

Sequence note: this `[P2]` visual feature is intentionally scheduled before the following `[P1]` gameplay systems. It depends only on the existing renderer/effects boundary and the completed Signal Hunt visuals.

### 5.1 Add an exclusive sky-mode setting

- [x] Add a `STARFIELD` toggle button to the `DISPLAY EFFECTS` group in Settings; keep it disabled by default.
- [x] Replace independent sky booleans at the engine/UI boundary with one explicit sky mode: `NONE`, `DIGITAL_RAIN`, or `STARFIELD`.
- [x] Keep Analog Vision, HUD, sound, and mission state independent of the selected sky mode.
- [x] Enabling Starfield must atomically disable Digital Rain before the next rendered frame.
- [x] Enabling Digital Rain must atomically disable Starfield before the next rendered frame.
- [x] Pressing the active sky-mode button again must return the sky mode to `NONE`.
- [x] Reflect the resolved mode in telemetry and keep both Settings buttons, text labels, active styling, and `aria-pressed` values synchronized.
- [x] Prevent transient frames where both sky effects render during rapid pointer, touch, or keyboard activation.
- [x] Preserve the selected sky mode across camera reset and mission restart; return to `NONE` only through the relevant Settings action or normal application teardown.
- [x] Add pure and browser tests for every `NONE ↔ DIGITAL_RAIN ↔ STARFIELD` transition and for repeated rapid toggling.

Suggested public boundary:

```js
engine.setSkyMode("starfield");

snapshot.effects.skyMode; // "none", "digitalRain", or "starfield"
```

The exact API names may change, but sky exclusivity must be enforced by engine state rather than inferred from two DOM buttons.

### 5.2 Generate a static white starfield

- [x] Implement Starfield as a dedicated effect/renderer subsystem, suggested as `src/effects/starfield.js`, using WebGL point geometry rather than DOM elements or a CSS background.
- [x] Generate a deterministic set of unit-sphere star directions from a named seed so the distribution can be pinned in tests.
- [x] Keep the star layout independent of the city seed, city regeneration, camera position, and mission seed.
- [x] Distribute stars over the surrounding sky without visible grid rows or a dense pole cluster.
- [x] Render every star as pure white with no hue, brightness, or saturation variation.
- [x] Render most stars at one small point size and allow no more than 10% of the total count to use one slightly larger point size.
- [x] Clamp requested point sizes to the device's `ALIASED_POINT_SIZE_RANGE` and keep the large class visibly restrained.
- [x] Keep the starfield static: no twinkle, flicker, trails, rotation, falling motion, or time-dependent random regeneration.
- [x] Use the same static presentation when `prefers-reduced-motion` is active.
- [x] Store size class explicitly or in deterministic vertex data; do not choose large stars randomly every frame.

Initial tuning values:

```text
Star count:            700
Large-star ratio:      0.10 maximum
Normal point size:     1.25 CSS-equivalent pixels
Large point size:      2.25 CSS-equivalent pixels
Color:                 rgba(255, 255, 255, 1)
Animation:             none
```

These are named tuning defaults. The final implementation may reduce the large-star ratio or point sizes after visual testing, but must never exceed the 10% large-star limit.

### 5.3 Add the WebGL star pass

- [x] Create a small dedicated star shader/program and immutable vertex buffer; do not reuse the Digital Rain canvas texture.
- [x] Draw stars with `gl.POINTS` as a sky pass before all world and overlay geometry.
- [x] Use camera rotation but remove camera translation so flying through the city produces no star parallax.
- [x] Keep stars visually behind all world geometry by disabling depth writes for the star pass and restoring them before the main pass.
- [x] Keep the sky background black and avoid an opaque full-screen layer that could hide the city.
- [x] Render only the currently selected sky pass: the Digital Rain sky or the Starfield point pass, never both.
- [x] Restore the main program, depth test, depth mask, blending, buffers, and vertex attributes after drawing stars.
- [x] Avoid buffer uploads, shader compilation, geometry allocation, or random generation during normal frames.
- [x] Delete Starfield buffers, shaders/programs, and other owned resources during renderer teardown.
- [x] Keep the star pass inert when disabled so the default-mode frame cost is effectively unchanged.

### 5.4 Visual validation, documentation, and delivery

- [x] Add the new classic script to `index.html` and `tests.html` in the same deterministic position and synchronize the loading order in `AGENTS.md`.
- [x] Document the Starfield setting and its mutual exclusion with Digital Rain in `README.md`.
- [x] Verify the default `NONE` sky, Digital Rain, and Starfield separately in a WebGL-capable browser.
- [x] Verify that switching between Digital Rain and Starfield never shows a mixed or stale frame.
- [x] Verify Starfield with Analog Vision, navigation degradation, Signal Hunt markers, and the optional HUD.
- [x] Verify all stars remain white and that larger stars never exceed 10% of the generated population.
- [x] Verify desktop, narrow layouts, device-pixel-ratio changes, resize behavior, and WebGL point-size limits.
- [x] Verify Settings keyboard focus, touch activation, active styling, and `aria-pressed` state for both sky buttons.
- [x] Apply the required visible `REV` bump when the feature is implemented.

### Acceptance criteria

- Starfield is off by default and can be enabled from Settings as a WebGL-rendered sky.
- Digital Rain and Starfield are mutually exclusive in engine state, UI state, and every rendered frame.
- The sky contains only white point stars, with no more than 10% rendered slightly larger than the rest.
- Stars remain fixed relative to camera rotation without translating or regenerating as the player flies.
- Starfield introduces no animation and remains compatible with reduced-motion preferences.
- World geometry, navigation warnings, and mission markers remain readable over the starfield.
- Disabling or switching the effect leaves no stale star geometry on screen and default-mode performance remains unchanged.
- The direct-open `file://` workflow and explicit classic-script dependency order remain intact.

---

## Milestone 6 — Collision Incident Records `[P1]`

Goal: turn per-frame movement blocking into one stable gameplay incident per physical impact and expose a reliable collision history without changing flight resolution.

### 6.1 Normalize collision incidents

- [x] Replace the engine's UI-facing `blocked` pulse with a structured collision incident while preserving `blocked` internally where it remains useful to flight resolution.
- [x] Classify incidents at minimum as `STRUCTURE` (walls, rooftops, and solid landmark parts) or `GROUND`.
- [x] Count one incident when the camera enters a new blocked contact; do not count every rendered frame while movement remains pressed against the same surface.
- [x] Re-arm incident detection only after contact ends or the camera makes a distinct impact with another collider.
- [x] Collapse simultaneous axis blocks against the same obstacle into one incident while preserving separate impacts against genuinely different obstacles.
- [x] Keep collision counting independent of the audio cue cooldown and independent of whether `SOUND` is enabled.
- [x] Route the existing collision cue from the normalized incident so audio and gameplay rules consume the same source event.
- [x] Add deterministic tests for a single impact, sustained contact, release and re-impact, corners, rooftops, ground contact, and different frame rates.

Suggested incident shape:

```js
{
  type: "collision",
  surface: "STRUCTURE", // or "GROUND"
  colliderId: "building-07-tier-1", // null for the ground plane
  impactSequence: 12
}
```

The exact field names may change. The important constraint is that consumers receive one stable incident per impact episode instead of inferring impacts from per-frame movement blocking.

### 6.2 Add the visible collision counter

- [x] Maintain a `collisionCount` for the current game run and increment it from normalized collision incidents only.
- [x] Include the count in throttled engine telemetry without exposing mutable flight internals.
- [x] Show a simple `COLLISIONS: N` text value in the persistent flight-status panel.
- [x] Keep the count readable when the optional HUD and Analog Vision are disabled.
- [x] Do not reset the count on `RESET POSITION`, navigation forced return, or mission abort.
- [x] Reset the count when a new game run starts: page load, city generation, or mission start/replay.
- [x] Expose one explicit run-reset path that later survival rules can reuse without coupling collision state to those rules.
- [x] Verify that collision audio and the counter each react exactly once to the same incident.

### 6.3 Integration, documentation, and delivery

- [x] Add any new classic script to both `index.html` and `tests.html` in the same deterministic dependency order and update `AGENTS.md` if that order changes. (No new script was required.)
- [x] Document the collision counter and its reset policy in `README.md`.
- [ ] Manually verify wall, rooftop, landmark, and ground impacts at all three speed modes.
- [x] Verify that the collision count remains readable with the HUD and Analog Vision disabled.
- [x] Apply the required visible `REV` patch bump when the feature is implemented.

### Acceptance criteria

- One physical impact episode emits one normalized incident regardless of refresh rate or how long movement remains held.
- Corners and simultaneous axis blocks against one obstacle do not produce duplicate incidents.
- Distinct impacts against different obstacles remain distinguishable.
- `COLLISIONS: N` remains available in Free Flight and Signal Hunt without requiring optional visual effects.
- Collision sound and counting consume the same incident without depending on each other's cooldown or enabled state.
- Reset behavior is explicit, deterministic, and ready for later survival systems to reuse.

---

## Milestone 7 — Optional Hull Integrity `[P1]`

Goal: add an optional collision-driven damage and restart loop on top of the normalized incidents from Milestone 6 without making survival rules mandatory in Free Flight or Signal Hunt.

Depends on: Milestone 6 collision incidents and run-reset contract.

### 7.1 Add the Hull Integrity state model

- [x] Add a `HULL INTEGRITY` gameplay toggle to Settings; keep it disabled by default.
- [x] Allow Hull Integrity to run independently in Free Flight or alongside Signal Hunt.
- [x] Implement the rules as a pure engine-side state model, suggested as `src/engine/integrity.js`, rather than calculating damage in DOM handlers.
- [x] Start a run at `100 HP` and subtract a tunable `10 HP` per normalized collision incident.
- [x] Add a short tunable damage guard only for distinct contacts produced by numerical jitter; never use a repeating timer that drains HP while resting against one surface.
- [x] Expose current HP, maximum HP, enabled state, and game-over state through throttled telemetry.
- [x] Show Hull Integrity as a persistent readable progress bar only while the option is enabled.
- [x] Provide distinct but non-flashing critical styling at low HP and a text equivalent that does not rely on color alone.

### 7.2 Add the Hull Integrity failure and restart flow

- [x] At zero HP, emit game over exactly once, clear held movement, stop mission timing/scanning, and keep the renderer and accessibility UI responsive.
- [x] Show a focus-managed `GAME OVER` dialog with the final collision count and a `RESTART GAME` button.
- [x] Make `RESTART GAME` restore full HP, clear the collision count and transient inputs, reset the camera, and restart the active Signal Hunt attempt if one was active.
- [x] Disabling Hull Integrity removes damage and game-over behavior without disabling the collision counter or changing the selected mission.
- [x] Starting or replaying a mission while Hull Integrity is enabled begins a fresh full-HP run; aborting a mission preserves current HP.
- [x] Generating a new city begins a fresh run, with full HP when Hull Integrity is enabled.
- [x] Add pure-logic tests for damage, sustained contact, the zero-HP boundary, single game-over emission, restart, toggle transitions, mission coexistence, and teardown.

Initial tuning values:

```text
Maximum hull integrity:  100 HP
Damage per incident:      10 HP
Low-integrity threshold:  30 HP
```

These values must be named configuration defaults rather than duplicated UI constants.

### 7.3 Integration, documentation, and delivery

- [x] Add any new classic script to both `index.html` and `tests.html` in the same deterministic dependency order and update `AGENTS.md` if that order changes.
- [x] Document Hull Integrity, its reset policy, and the restart flow in `README.md`.
- [x] Manually verify Free Flight and Signal Hunt with Hull Integrity disabled and enabled.
- [x] Verify wall, rooftop, landmark, and ground damage at all three speed modes.
- [x] Verify the Game Over dialog on desktop and narrow layouts, including keyboard focus restoration.
- [x] Verify that HP, critical state, and Game Over remain readable with the optional HUD and Analog Vision disabled and in every sky mode.
- [x] Apply the required visible `REV` minor bump when the feature is implemented.

### Acceptance criteria

- Hull Integrity is off by default and can run independently in Free Flight or alongside Signal Hunt.
- Damage is gradual, deterministic, and driven only by normalized collision incidents.
- Sustained contact and audio cooldowns cannot cause duplicate damage.
- Zero HP produces one accessible Game Over state and stops gameplay without freezing rendering or UI.
- `RESTART GAME` starts a clean run with full HP, zero collisions, reset input, and a consistent mission attempt.
- Disabling Hull Integrity removes its damage and failure rules without disabling collision records or changing the selected mission.
- The direct-open `file://` workflow, keyboard/touch controls, and navigation safety behavior remain intact.

---

## Milestone 8 — Optional Fuel Endurance `[P1]`

Goal: add an optional time-based fuel survival loop with deterministic recovery pickups while keeping fuel independent of the selected mission and compatible with Hull Integrity.

Depends on: Milestone 7 shared Game Over and restart flow. Fuel depletion itself must remain independent of Hull Integrity state.

### 8.1 Add the Fuel Endurance state model

- [x] Add a `FUEL ENDURANCE` gameplay toggle to Settings; keep it disabled by default.
- [x] Allow Fuel Endurance to run independently in Free Flight, alongside Signal Hunt, alongside Hull Integrity, or with both enabled together.
- [x] Implement fuel state and pickup lifecycle as a pure engine-side model, suggested as `src/engine/fuel.js`, rather than calculating depletion or collection in DOM handlers.
- [x] Start each run with `100 FUEL` and drain fuel continuously from bounded elapsed gameplay time so depletion is independent of frame rate and movement speed.
- [x] Pause depletion after Game Over and while the engine is stopped or destroyed; prevent a large restored-tab delta from emptying the tank instantly.
- [x] Expose current fuel, maximum fuel, low-fuel state, active pickup count, and game-over state through throttled telemetry.
- [x] Show `FUEL: current/max` as persistent readable text only while Fuel Endurance is enabled.
- [x] Add non-flashing `LOW FUEL` and `FUEL CRITICAL` text states that do not rely on color or sound alone.
- [x] Emit optional low-fuel and collection audio cues only through the existing lazy audio context while `SOUND` is enabled.

### 8.2 Generate and collect fuel barrels

- [x] Maintain three active fuel barrels during an enabled run and replace a collected barrel after a short respawn delay.
- [x] Generate barrel locations from the city seed and a run seed so placements are varied between runs but reproducible in tests.
- [x] Select from two explicit placement families: clear ground points and valid building-rooftop or landmark-platform anchors.
- [x] Keep ground barrels inside the navigation warning boundary, outside solid AABBs, away from the initial camera volume, and far enough from other active barrels.
- [x] Place rooftop barrels above a walkable roof or platform surface with enough horizontal margin for the camera collision radius and pickup trigger.
- [x] Exclude roofs, tower parts, and narrow ledges that cannot be approached without intersecting solid geometry.
- [x] Ensure every selected barrel is reachable and never spawn a barrel inside a building, below the ground, outside the navigation area, or directly on a Signal Hunt beacon.
- [x] Give every barrel a stable ID, placement type, position, host-structure metadata when applicable, and collection state.
- [x] Use a proximity trigger for collection; fuel barrels are pickups and must not add solid AABB colliders or increment the collision counter.
- [x] Refill by a tunable amount capped at maximum fuel, remove the collected barrel and its beam exactly once, then schedule one replacement at a different valid location.
- [x] Prevent immediate collection of a replacement by excluding the player's current pickup radius.
- [x] Clear pending respawns and stale pickup state on city generation, restart, disabling Fuel Endurance, and engine teardown.

### 8.3 Render barrels and locator beams

- [x] Render a small low-poly fuel barrel that matches the existing primitive wireframe city style and remains distinguishable from Signal Hunt beacons.
- [x] Render one straight bright-red vertical beam from the top of each active barrel toward a capped sky height.
- [x] Keep the beam red and readable against default rendering, Digital Rain, Starfield, navigation degradation, and Analog Vision without turning it into a flashing effect.
- [x] Use a static beam in reduced-motion mode; any optional pulse must be restrained and disabled when reduced motion is requested.
- [x] Batch barrel and beam geometry where practical and avoid allocating WebGL buffers every frame.
- [x] After the pickup pass, restore the main program, depth test, blending, bound buffers, and vertex attributes required by later rendering.
- [x] Remove barrel and beam geometry immediately after collection and rebuild it deterministically after respawn or city generation.

### 8.4 Integrate empty-fuel and combined survival behavior

- [x] At zero fuel, clear held movement and descend to the first solid surface beneath the camera — otherwise ground level — before emitting Game Over exactly once with the text reason `FUEL EXHAUSTED`; mission timing/scanning stop during the descent.
- [x] Reuse the focus-managed Game Over dialog introduced for Hull Integrity rather than creating competing overlays.
- [x] If Hull Integrity and Fuel Endurance reach zero in the same update, show one Game Over state with deterministic combined failure reasons.
- [x] Make `RESTART GAME` restore all enabled survival resources, reset collision count and fuel barrels, reset the camera, and restart the active Signal Hunt attempt if one was active.
- [x] Starting or replaying a mission while Fuel Endurance is enabled begins a fresh full-fuel run with newly generated barrel placements.
- [x] Aborting a mission preserves current fuel and active barrels because Fuel Endurance is independent of the mission.
- [x] Generating a new city begins a fresh full-fuel run and generates pickups only from the new city's surfaces.
- [x] Disabling Fuel Endurance immediately stops depletion and removes all barrels, beams, warnings, and fuel-only Game Over behavior without changing Hull Integrity or the selected mission.
- [x] Add pure-logic tests for depletion, delta-time bounds, refill capping, deterministic placement, valid ground and rooftop anchors, collection, respawn, zero fuel, restart, combined Hull Integrity behavior, disable cleanup, and teardown.

Initial tuning values:

```text
Maximum fuel:           100
Fuel drain:             1 per second
Low-fuel threshold:     25
Fuel per barrel:        35
Active barrels:         3
Pickup radius:          2.25 world units
Replacement delay:      5 seconds
Beam height:            80 world units above the barrel
```

These values are named configuration defaults and must be tuned through playtesting rather than duplicated across the engine, renderer, and UI.

### 8.5 Integration, documentation, and delivery

- [x] Add any new classic script to both `index.html` and `tests.html` in the same deterministic dependency order and update `AGENTS.md` if that order changes.
- [x] Document Fuel Endurance, barrel collection, fuel reset policy, and its use of the shared restart flow in `README.md`.
- [ ] Manually verify Free Flight and Signal Hunt with Fuel Endurance enabled, both with and without Hull Integrity.
- [ ] Manually verify ground and rooftop barrel placement, collection, replacement, low-fuel warnings, and zero-fuel Game Over.
- [ ] Verify red locator beams with default rendering, Digital Rain, Starfield, Analog Vision, navigation degradation, and reduced motion.
- [ ] Verify the Settings and shared Game Over dialogs on desktop and narrow layouts, including keyboard focus restoration.
- [x] Verify that Fuel Endurance remains disabled by default and that fuel, warnings, and game-over text remain readable without the HUD.
- [x] Apply the required visible `REV` minor bump when the feature is implemented.

### Acceptance criteria

- Fuel Endurance is off by default and can be combined independently with Free Flight, Signal Hunt, and Hull Integrity.
- Fuel drains consistently across refresh rates, valid barrels replenish it without exceeding the maximum, and collected barrels are replaced without leaving stale state.
- Every active barrel is reachable on valid ground or rooftop geometry and has a visible straight red beam pointing into the sky.
- Zero fuel produces one accessible `FUEL EXHAUSTED` Game Over state, including deterministic behavior when hull and fuel fail together.
- Fuel, pickup respawn, collision counting, Hull Integrity, mission timing, and restart behavior interact without duplicate reactions or competing Game Over states.
- Disabling Fuel Endurance removes all fuel state and visuals without changing Hull Integrity or the selected mission.
- The direct-open `file://` workflow, keyboard/touch controls, and existing navigation safety behavior remain intact.

---

## Milestone 9 — Missions Menu `[P1]`

Goal: give implemented game modes a dedicated, accessible launch surface without changing Free Flight as the default or introducing gameplay for unimplemented modes.

Depends on: the existing Signal Hunt actions and the collision, Hull Integrity, Fuel Endurance, and run-reset semantics established in Milestones 6–8.

### 9.1 Move game-mode launch controls into a Missions menu

- [ ] Replace the direct `START SIGNAL HUNT` control in the main panel with a `MISSIONS` button.
- [ ] Add a retro-styled Missions dialog that initially lists Signal Hunt and can accept additional mode descriptors later without duplicating dialog wiring.
- [ ] Move Signal Hunt start, replay, and abort actions into the Missions dialog.
- [ ] Show each mode's name, short objective, current state, and available primary action as readable text.
- [ ] Keep the compact active-mission telemetry visible outside the dialog while a mission is running.
- [ ] Close the dialog after a successful mission start or replay and return focus to the appropriate flight control or canvas.
- [ ] Ensure Missions and Settings cannot be open at the same time.
- [ ] Support keyboard, pointer, and touch operation; close on `Escape` or backdrop click when safe; trap focus and restore it to `MISSIONS`.
- [ ] Keep additional mission types beyond Signal Hunt out of this milestone; add real catalog entries only when their gameplay exists.
- [ ] Cover catalog rendering, action routing, dialog focus behavior, and active-mode button states with browser tests.

Suggested mode descriptor boundary:

```js
{
  id: "signal-hunt",
  label: "SIGNAL HUNT",
  description: "Locate and scan all signals before time expires.",
  getState(snapshot) {},
  getActions(snapshot) {}
}
```

This is a small UI catalog, not a general-purpose plugin or game-mode framework.

### 9.2 Integration, documentation, and delivery

- [ ] Document the Missions menu and Signal Hunt start, replay, and abort flow in `README.md`.
- [ ] Manually verify the Missions dialog in idle, active, and complete Signal Hunt states.
- [ ] Verify desktop and narrow layouts, keyboard focus trapping and restoration, pointer controls, and touch controls.
- [ ] Verify that Settings, the Signal Hunt completion dialog, Game Over, and Missions cannot create competing focus traps.
- [ ] Verify that starting, replaying, and aborting Signal Hunt through the dialog preserves the established Hull Integrity and Fuel Endurance run-reset policies.
- [ ] Apply the required visible `REV` patch bump when the feature is implemented.

### Acceptance criteria

- Signal Hunt can be started, replayed, and aborted from the Missions dialog.
- No direct `START SIGNAL HUNT` control remains in the main panel.
- Free Flight remains the default and does not require opening the dialog.
- Active mission telemetry stays visible outside the dialog.
- The catalog can list future implemented modes without coupling their rules to DOM code.
- Missions actions preserve the existing collision, hull, fuel, and restart semantics.
- Focus management and action availability remain correct for keyboard, pointer, and touch input.

---

## Milestone 10 — Flight Feel and Camera Polish `[P2]`

Goal: make movement feel more like a lightweight vehicle while preserving immediate keyboard and touch control.

- [ ] Separate requested input from current movement velocity.
- [ ] Add light acceleration and damping.
- [ ] Keep the Slow, Normal, and Fast modes meaningfully different.
- [ ] Add a small visual bank while yawing left or right.
- [ ] Smoothly return bank to zero when turning stops.
- [ ] Cap bank angle to prevent disorientation.
- [ ] Clear velocity and bank on reset, mission restart, window blur, and forced boundary reset.
- [ ] Ensure diagonal movement remains normalized.
- [ ] Reduce or disable banking when reduced-motion is requested.
- [ ] Test keyboard, pointer, and multi-touch control after inertia is added.

Suggested starting values:

```text
Maximum visual bank:  3–5 degrees
Acceleration:         quick but visible
Release damping:      under one second to settle
```

### Acceptance criteria

- Movement feels smoother but never sluggish.
- Touch controls remain predictable.
- The player can still make precise two-second beacon scans.
- Motion behavior is independent of refresh rate.
- Reset always returns the exact documented camera state.

---

## Milestone 11 — Canonical Release and Repository Presentation `[P2]`

Goal: make the repository understandable and playable within seconds of opening its GitHub page.

- [ ] Add a prominent `PLAY LIVE` link near the top of `README.md`.
- [ ] Add one strong default-state screenshot.
- [ ] Add a short GIF or video showing movement and Signal Hunt if repository size remains reasonable.
- [ ] Add a concise project description before the long feature list.
- [ ] Document Free Flight and Signal Hunt controls separately.
- [ ] Document the direct-open local workflow: download or clone, then open `index.html`.
- [ ] Document the supported browser baseline.
- [ ] Document the project architecture at a high level.
- [ ] Add a short credits and acknowledgements section.
- [ ] Choose a license with the repository owner; MIT is the recommended default but must not be assumed without approval.
- [ ] Add the approved `LICENSE` file.
- [ ] Add a `CHANGELOG.md` or a concise release-history section.
- [ ] Update visible revision text for the new release.
- [ ] Create a local release tag only after final validation and hand it off for manual publication by the repository owner.

### Acceptance criteria

- A new visitor can launch the game from the first README screen.
- The README shows the product before explaining its implementation.
- Controls, system requirements, local development, and licensing are unambiguous.
- Media files do not materially damage the lightweight repository identity.
