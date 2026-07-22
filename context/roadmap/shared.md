# Deferred Ideas

> [Roadmap index](../../TODO.md) · Shared context for every development direction.

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
