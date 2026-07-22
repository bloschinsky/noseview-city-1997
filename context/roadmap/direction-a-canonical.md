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

- [ ] Generate between three and five signal beacons per mission.
- [x] Select unique valid buildings or landmarks for beacon placement.
- [x] Place beacons above roofs or landmark platforms, never inside solid geometry.
- [ ] Exclude structures too close to the initial camera position.
- [x] Store stable beacon IDs, positions, status, and host-structure metadata.
- [x] Keep beacon generation deterministic for a given city and mission seed.
- [ ] Ensure every generated mission is completable.

### 4.3 Beacon rendering

- [x] Add a low-poly beacon marker that fits the existing wireframe aesthetic.
- [ ] Make the active signal readable against buildings, Digital Rain, and Analog Vision.
- [ ] Add restrained pulse or flicker animation.
- [ ] Provide a reduced-motion beacon presentation.
- [ ] Avoid expensive new per-beacon draw calls when geometry can be batched.

### 4.4 Target acquisition and scanning

- [ ] Detect when an unscanned beacon is inside the crosshair acquisition cone.
- [ ] Require continuous aim for two seconds to complete a scan.
- [ ] Show scan progress in the HUD.
- [ ] Cancel or decay progress when the target leaves the acquisition cone.
- [ ] Prevent multiple beacons from being scanned simultaneously.
- [ ] Mark completed beacons visually and exclude them from later acquisition.
- [ ] Emit an optional audio cue only after user-enabled sound interaction.
- [ ] Keep scan timing independent of frame rate.

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
- [ ] Add `SIGNAL ACQUIRED` feedback after each successful scan.
- [ ] Add a `MISSION COMPLETE` overlay after the final scan.
- [ ] Show completion time and number of signals.
- [ ] Provide controls to replay the mission or generate a new city.
- [ ] Trap and restore focus correctly when the completion overlay is open.
- [ ] Keep all essential mission information accessible as text.

### Acceptance criteria

- Free Flight still works without starting a mission.
- Every generated mission contains three to five completable signals.
- A scan requires two continuous seconds of valid aim.
- Timer and scan progress behave consistently at low and high frame rates.
- Completion occurs exactly once after the final beacon.
- Regenerating the city cannot leave stale beacon geometry or mission state.

---

## Milestone 5 — Flight Feel and Camera Polish `[P2]`

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

## Milestone 6 — Canonical Release and Repository Presentation `[P2]`

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
