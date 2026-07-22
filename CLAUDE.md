# CLAUDE.md

Guidance for Claude Code when working in this repository.

The canonical contributor guide is **[AGENTS.md](AGENTS.md)** — read it in full before
changing anything. It is the source of truth for structure, script-loading order,
implementation rules, git policy, versioning, and validation. This file only adds a
quick orientation and the rules most likely to trip an agent up.

@AGENTS.md

## What this is

NOSEVIEW 1997 is a dependency-free static WebGL experience: a retro 1997-style terminal
for flying through a procedurally generated 3D city. Plain HTML/CSS/JS + WebGL 1, no
frameworks, no build step, no runtime dependencies. It must keep running directly from
`file://`. Preserve the dark 1990s terminal/CRT aesthetic; keep optional effects
(Analog Vision, Digital Rain, music) disabled by default.

## Layout at a glance

- `index.html` — markup, controls, HUD, settings dialog, and the ordered `<script>` list.
- `styles.css` — retro UI and overlay effects.
- `src/namespace.js` — the single intentional `window.Noseview` global.
- `src/engine/` — `math`, `city`, `flight`, `navigation`, `renderer`, and the
  `engine.js` factory (`window.Noseview.createNoseviewEngine()`).
- `src/effects/` — `analog-vision`, `digital-rain`, `navigation-signal`.
- `src/audio/music.js` — lazy Web Audio synthesis, scheduling, and navigation cues.
- `src/ui/` — `hud` (formatting/rendering) and `controls` (input/settings bindings).
- `src/main.js` — bootstrap; wires the engine to existing page UI only.
- `tests.html` + `tests/` — dependency-free browser and pure-logic test harnesses.
- `TODO.md` + `context/roadmap/` — roadmap index and per-direction milestones.

All `src/` files are IIFEs loaded synchronously (no `async`, no modules). Any change to
the script set must keep `index.html` and `tests.html` in the same dependency order
listed in AGENTS.md.

## Rules that bite

- **Never `git push` or trigger remote deployments** — only the owner publishes. This
  holds even when asked to "finish", "release", or "deploy" a task.
- **Bump the version in the same change set** as any feature change: patch (`X.Y.Z+1`)
  for small work, minor (`X.Y+1.0`) for substantial work; never touch major without the
  owner. The canonical version lives in the `REV. X.Y.Z` label in `index.html` — update
  and verify it before handoff.
- Keep generated building geometry and AABB colliders synchronized.
- Navigation warnings and signal degradation must stay visible even when HUD and Analog
  Vision are off. Boundaries are radial and symmetric (warning 90 / critical 120 / reset
  150, five-second countdown), applied to both horizontal and vertical distance.
- Create audio lazily after user interaction; navigation cues share that context and must
  not run independent timers.
- Preserve keyboard, pointer, responsive, focus-management, and `prefers-reduced-motion`
  behavior. Keep files UTF-8; avoid unrelated formatting churn.

## Validate before handoff or commit

```bash
# syntax-check every source and test file
find src tests -name '*.js' -exec node --check {} \;
node tests/node-runner.js
git diff --check
git status --short
```

Also open `tests.html` through `file://` and confirm all browser tests pass. For visual
changes, manually verify the default state and every affected toggle in a WebGL browser.
