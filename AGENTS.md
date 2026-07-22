# Project Guide

## Overview

NOSEVIEW 1997 is a dependency-free static WebGL experience. Preserve its dark 1990s terminal/CRT aesthetic and keep optional effects disabled by default.

## Structure

- `index.html` — page markup, controls, HUD, and settings dialog.
- `styles.css` — responsive retro UI and overlay effects.
- `src/namespace.js` — creates the single intentional `window.Noseview` application namespace.
- `src/engine/` — pure math, city generation, flight/collisions, navigation boundaries, WebGL rendering, and the public engine factory.
- `src/effects/` — Analog Vision, Digital Rain, and navigation signal degradation implementations.
- `src/audio/music.js` — lazy Web Audio synthesis and scheduling.
- `src/ui/` — HUD formatting/rendering and page input/settings bindings.
- `src/main.js` — application bootstrap and subsystem wiring only.
- `tests.html`, `tests/` — dependency-free browser and pure-logic test harnesses.
- `README.md` — concise public project documentation.

## Classic Script Loading Order

All production scripts are IIFEs loaded together at the end of `index.html`, without `async` or modules. Keep this dependency order synchronized with `tests.html`:

1. `src/namespace.js`
2. `src/engine/math.js`
3. `src/engine/city.js`
4. `src/engine/flight.js`
5. `src/engine/navigation.js`
6. `src/engine/renderer.js`
7. `src/effects/analog-vision.js`
8. `src/effects/digital-rain.js`
9. `src/effects/navigation-signal.js`
10. `src/audio/music.js`
11. `src/ui/hud.js`
12. `src/ui/controls.js`
13. `src/engine/engine.js`
14. `src/main.js`

## Implementation Notes

- Use plain HTML, CSS, and JavaScript; do not add dependencies or a build step unless requested.
- Keep generated building geometry and AABB colliders synchronized.
- Camera forward/back movement follows both yaw and pitch; strafing remains horizontal.
- Keep navigation boundaries radial and deterministic. Default distances are warning `90`, critical `120`, and forced reset `150`, with a five-second critical countdown.
- Navigation warnings and signal degradation must remain visible when the optional HUD and Analog Vision are disabled.
- The digital-rain sky uses a separate shader/program. After its pass, restore the main program, depth test, blending, and vertex attributes.
- Create audio lazily after user interaction to satisfy browser autoplay rules. Navigation cues share that context, react only to navigation events, and must not run independent countdown timers.
- Preserve keyboard, pointer, responsive, focus-management, and `prefers-reduced-motion` behavior.
- Keep source files UTF-8 and avoid unrelated formatting changes.

## Git and Remote Repository Policy

- Agents must never run `git push` under any circumstances. This prohibition includes branches, commits, tags, force pushes, and every remote destination.
- Only the repository owner may manually push commits or tags to the remote repository.
- A request to implement, finish, release, deploy, or complete a roadmap item does not grant an agent permission to push.
- Agents may prepare local commits or annotated tags only when the user requests them, but must stop before any remote publication and report the resulting local references to the owner.
- Agents must not trigger or approve remote deployments. They may perform read-only checks of an existing deployment and may verify a new deployment only after the owner has pushed it manually.

## Validation

Run before handoff or commit:

```powershell
Get-ChildItem -Path 'src','tests' -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
node tests/node-runner.js
git diff --check
git status --short
```

Also open `tests.html` directly through `file://` and confirm that all browser tests pass. For visual changes, manually verify the default state and every affected toggle in a WebGL-capable browser.
