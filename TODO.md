# NOSEVIEW 1997 — Development Roadmap

This file is the implementation roadmap for NOSEVIEW 1997. It is written to be usable by both human contributors and coding agents.

## Project Direction

NOSEVIEW 1997 has three intentionally separate product lines:

| Edition | Purpose | Technology | Status |
| --- | --- | --- | --- |
| **NOSEVIEW 1997** | Canonical game and live GitHub Pages version | Vanilla HTML, CSS, ordered classic JavaScript files, WebGL 1 | Primary |
| **NOSEVIEW 1997 — Vue Terminal** | Vue 3 learning experiment using the same engine concepts | Vue 3, Composition API, Vite, WebGL 1 | Future fork |
| **NOSEVIEW 1997 — Trident Edition** | Museum-grade compatibility experiment | ES5 bundle, IE11-compatible CSS, WebGL 1 | Future fork |

The canonical edition must remain lightweight, dependency-free at runtime, static-host friendly, and visually faithful to its late-1990s terminal/CRT identity.

## Instructions for Coding Agents

1. Work through milestones in order unless the user explicitly selects another task.
2. Pick one coherent unchecked task or one tightly related task group at a time.
3. Read `AGENTS.md` before editing the project.
4. Preserve current behavior during architecture-only milestones.
5. Do not combine refactoring, visual redesign, and gameplay changes in one commit.
6. Keep optional display effects disabled by default unless a task explicitly changes that rule.
7. Keep generated geometry, building metadata, and AABB colliders synchronized.
8. Avoid new runtime dependencies in the canonical edition.
9. Do not introduce Vue, TypeScript, Pinia, a router, or a build framework into the canonical edition.
10. The canonical edition must continue to run when `index.html` is opened directly through `file://`.
11. Do not require a local server, package installation, bundler, build step, or generated bundle for canonical development.
12. Mark a checkbox complete only after its acceptance criteria and the global Definition of Done are satisfied.
13. Update this file when scope or implementation decisions change.
14. Do not start the Vue or Trident editions until the canonical engine API is stable.
15. Never run `git push` for commits, branches, or tags. Only the repository owner publishes local work to the remote repository manually.
16. Do not trigger remote deployments. After local validation, hand off the commit or tag reference to the repository owner; deployment checks may resume only after the owner has pushed it.

## Priority Legend

- **P0** — architecture or correctness work that should happen first
- **P1** — core gameplay work for the next release
- **P2** — polish and presentation work
- **P3** — optional experiment or separate edition

---

# Direction A — Canonical Vanilla Edition

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

- [ ] Add a configurable minimum camera altitude based on camera collision radius.
- [ ] Prevent forward movement from pushing the camera below the ground plane.
- [ ] Preserve rooftop collision behavior.
- [ ] Clear vertical velocity when reset or ground correction occurs.
- [ ] Add tests for steep downward movement at all three speed modes.

### 2.2 Navigation boundary states

- [ ] Define configurable warning, critical, and reset boundary distances.
- [ ] Start signal degradation before the hard world limit.
- [ ] Display `NAVIGATION LIMIT` when the warning boundary is crossed.
- [ ] Display `OUT OF NAVIGATION AREA` at the critical boundary.
- [ ] Increase visual signal noise as the player moves farther outside the safe area.
- [ ] Start a visible return countdown in the critical state.
- [ ] Reset the camera if the player remains outside the hard boundary.
- [ ] Cancel the countdown when the player returns to the safe area.
- [ ] Ensure boundary warnings are available as text, not only as visual noise.
- [ ] Keep reduced-motion behavior usable and non-flashing.

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

---

## Milestone 3 — Procedural Landmarks `[P1]`

Goal: make generated cities recognizable and easier to navigate without losing the primitive low-poly style.

- [ ] Extend city output with structured building and landmark metadata.
- [ ] Add at least three landmark types.
- [ ] Implement a telecommunications tower.
- [ ] Implement a narrow spire or needle tower.
- [ ] Implement a rooftop helipad or large antenna complex.
- [ ] Give every solid landmark synchronized face, edge, and collider geometry.
- [ ] Prevent landmarks from blocking the initial camera spawn corridor.
- [ ] Make landmark placement deterministic for a given city seed.
- [ ] Ensure landmarks remain visually distinct in default and Analog Vision modes.
- [ ] Decide whether landmarks replace ordinary structures or increase the displayed structure count, then document the rule.

### Acceptance criteria

- Every generated city contains two or three visually distinct landmarks.
- The same seed produces the same landmark types and positions.
- Landmark geometry does not introduce collision holes.
- Landmarks can later be selected as valid Signal Hunt locations.

---

## Milestone 4 — SIGNAL HUNT Game Mode `[P1]`

Goal: turn free flight into a short replayable game without removing the original exploration mode.

### 4.1 Mission state

- [ ] Keep Free Flight as the default mode.
- [ ] Add a clear `START SIGNAL HUNT` control.
- [ ] Implement explicit mission states: `IDLE`, `ACTIVE`, and `COMPLETE`.
- [ ] Start the mission timer only when the player starts Signal Hunt.
- [ ] Stop the timer immediately when the final signal is scanned.
- [ ] Reset mission state when a new city is generated.
- [ ] Decide and document whether camera reset restarts or preserves the active mission.

### 4.2 Signal generation

- [ ] Generate between three and five signal beacons per mission.
- [ ] Select unique valid buildings or landmarks for beacon placement.
- [ ] Place beacons above roofs or landmark platforms, never inside solid geometry.
- [ ] Exclude structures too close to the initial camera position.
- [ ] Store stable beacon IDs, positions, status, and host-structure metadata.
- [ ] Keep beacon generation deterministic for a given city and mission seed.
- [ ] Ensure every generated mission is completable.

### 4.3 Beacon rendering

- [ ] Add a low-poly beacon marker that fits the existing wireframe aesthetic.
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

- [ ] Show mission status while Signal Hunt is active.
- [ ] Show scanned count, total count, current timer, and scan progress.
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

---

# Direction B — Vue 3 Learning Edition

## Milestone 7 — NOSEVIEW 1997: Vue Terminal `[P3]`

Goal: practice Vue 3 architecture without replacing the canonical Vanilla edition.

Start this work only after Milestone 1 stabilizes the framework-agnostic engine API. The Vue fork may convert or adapt the engine to ESM internally, but that decision must not alter the canonical classic-script edition.

### Repository and tooling rules

- [ ] Create a separate branch or duplicate repository for the Vue edition.
- [ ] Do not merge Vue runtime code into the canonical Vanilla edition.
- [ ] Use Vue 3, Composition API, `<script setup>`, and Vite.
- [ ] Do not add Vue Router; the application has one screen.
- [ ] Do not add Pinia unless state complexity later demonstrates a real need.
- [ ] Keep the WebGL engine as plain JavaScript outside Vue reactivity.
- [ ] Do not place `WebGLRenderingContext`, buffers, audio nodes, or large typed arrays in deep reactive state.

### Vue integration

- [ ] Create a `useNoseviewEngine()` composable.
- [ ] Create the engine in `onMounted()`.
- [ ] Destroy the engine in `onBeforeUnmount()`.
- [ ] Store the engine instance with `markRaw()` or `shallowRef()`.
- [ ] Send player commands to the engine through its public methods.
- [ ] Update reactive telemetry no more than approximately 10 times per second.
- [ ] Keep the canvas DOM node stable across component updates.

Suggested components:

```text
src/
├── App.vue
├── composables/
│   └── useNoseviewEngine.js
└── components/
    ├── NavigationDisplay.vue
    ├── FlightStatus.vue
    ├── DPad.vue
    ├── ControlPanel.vue
    ├── SettingsDialog.vue
    ├── MissionOverlay.vue
    └── RetroFooter.vue
```

### Acceptance criteria

- The Vue edition has feature parity with the selected canonical release.
- Vue controls the UI, not the per-frame WebGL render loop.
- Mounting and unmounting the app leaves no animation frames, listeners, timers, or audio running.
- The Vue edition remains a clearly labeled learning fork, not the canonical release.

---

# Direction C — Legacy Compatibility Edition

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

---

# Direction D — Optional Renderer Experiment

## Milestone 9 — Canvas 2D Wireframe Fallback `[P3 / Optional]`

Goal: explore IE9/IE10-era compatibility without forcing the WebGL renderer to support browsers that never implemented WebGL.

Do not start this milestone unless the Trident Edition is complete and the user explicitly approves the experiment.

- [ ] Define a small renderer interface shared by WebGL and Canvas 2D implementations.
- [ ] Implement CPU transformation of world vertices into clip and screen coordinates.
- [ ] Render the ground grid, road lines, building edges, landmarks, and beacons first.
- [ ] Add near-plane clipping for lines that cross or pass behind the camera.
- [ ] Add simple painter-sorted translucent faces only if wireframe performance is acceptable.
- [ ] Prefer a reduced internal resolution and lower target frame rate for old browsers.
- [ ] Add a renderer selection fallback: WebGL first, Canvas 2D second, failure screen last.
- [ ] Keep collision and mission logic shared between renderers.
- [ ] Treat IE8/VML/Flash support as explicitly out of scope.

### Acceptance criteria

- The Canvas 2D renderer can display and navigate the same generated city metadata.
- Game logic does not depend on which renderer is active.
- The fallback remains optional and does not slow down the WebGL path.

---

# Deferred Ideas

These ideas are intentionally not part of the next release:

- [ ] Optional mouse-look or pointer-lock mode.
- [ ] Shareable city and mission seeds in the URL.
- [ ] Local best-time storage.
- [ ] Multiple mission types beyond Signal Hunt.
- [ ] Additional low-poly structure families.
- [ ] Optional full-screen navigation display.
- [ ] Offline/PWA packaging.
- [ ] Gamepad support.
- [ ] Renderer profiling overlay.

They should not block Milestones 0–6.

---

# Explicit Non-Goals

- Do not replace the canonical renderer with Three.js or another 3D engine.
- Do not add a backend, accounts, analytics, tracking, multiplayer, or online leaderboards.
- Do not turn the canonical edition into a general-purpose game engine.
- Do not rewrite the canonical edition in Vue.
- Do not manually maintain a separate copy of engine logic inside Vue components.
- Do not target ES3 merely to claim older JavaScript compatibility.
- Do not support IE8, ActiveX, VML, Silverlight, or Flash in the canonical or Trident editions.
- Do not enable heavy visual effects by default.
- Do not sacrifice the fast initial load and deliberately primitive visual identity.

---

# Global Definition of Done

A task is complete only when all applicable items below are true.

## Correctness

- [ ] The requested behavior is implemented.
- [ ] Existing unrelated behavior remains unchanged.
- [ ] Generated geometry and colliders remain synchronized.
- [ ] Frame-rate-independent logic uses bounded delta time.
- [ ] Reset paths clear all relevant transient state.
- [ ] No stale WebGL buffers, timers, listeners, or audio sources remain after regeneration or teardown.

## Input and accessibility

- [ ] Keyboard controls work.
- [ ] Pointer/touch controls work.
- [ ] Window blur clears held controls.
- [ ] Modals trap and restore focus.
- [ ] Essential state is available as readable text.
- [ ] Reduced-motion behavior is respected.

## Visual and performance validation

- [ ] Default mode has been checked in a WebGL-capable browser.
- [ ] Every affected toggle has been checked.
- [ ] Desktop and narrow responsive layouts have been checked.
- [ ] Default rendering remains smooth on integrated graphics.
- [ ] New HUD data is throttled and does not trigger per-frame DOM churn.
- [ ] Optional effects do not affect default-mode performance when disabled.

## Code quality

- [ ] File ownership, namespace exports, and dependency order are clear.
- [ ] Public APIs are smaller than internal implementation details.
- [ ] New constants are named and centralized rather than duplicated.
- [ ] Tests cover new pure logic and important edge cases.
- [ ] Comments explain non-obvious WebGL, collision, timing, or compatibility decisions.
- [ ] No unrelated formatting changes are included.

## Required checks

Before handoff, run the checks currently documented in `AGENTS.md`. At minimum:

```text
JavaScript syntax validation
Automated tests, when present
git diff --check
git status --short
Manual browser validation for affected visual and interaction states
```

If the architecture changes, update `AGENTS.md` so these commands remain accurate.

---

# Recommended Delivery Sequence

```text
v1.3.4 baseline
    ↓
Classic-script engine extraction
    ↓
World floor and navigation boundaries
    ↓
Procedural landmarks
    ↓
SIGNAL HUNT
    ↓
Flight feel and camera polish
    ↓
README, media, license, and canonical release
    ↓
Vue Terminal fork
    ↓
Trident Edition fork
    ↓
Optional Canvas 2D renderer experiment
```

The first major target is a polished canonical release with a stable modular classic-script engine and a complete Signal Hunt loop. The Vue and legacy editions must build on that stable design instead of forcing compromises into the primary project.
