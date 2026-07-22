# Direction B — Vue 3 Learning Edition

> [Roadmap index](../../TODO.md) · [Shared constraints and Definition of Done](shared.md)

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
