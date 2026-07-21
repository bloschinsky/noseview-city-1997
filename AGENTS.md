# Project Guide

## Overview

NOSEVIEW 1997 is a dependency-free static WebGL experience. Preserve its dark 1990s terminal/CRT aesthetic and keep optional effects disabled by default.

## Structure

- `index.html` — page markup, controls, HUD, and settings dialog.
- `styles.css` — responsive retro UI and overlay effects.
- `script.js` — IIFE containing WebGL rendering, procedural city generation, camera/collisions, digital-rain sky, analog effects, and Web Audio music.
- `README.md` — concise public project documentation.

## Implementation Notes

- Use plain HTML, CSS, and JavaScript; do not add dependencies or a build step unless requested.
- Keep generated building geometry and AABB colliders synchronized.
- Camera forward/back movement follows both yaw and pitch; strafing remains horizontal.
- The digital-rain sky uses a separate shader/program. After its pass, restore the main program, depth test, blending, and vertex attributes.
- Create audio lazily after user interaction to satisfy browser autoplay rules.
- Preserve keyboard, pointer, responsive, focus-management, and `prefers-reduced-motion` behavior.
- Keep source files UTF-8 and avoid unrelated formatting changes.

## Validation

Run before handoff or commit:

```powershell
node --check script.js
git diff --check
git status --short
```

For visual changes, manually verify the default state and every affected toggle in a WebGL-capable browser.
