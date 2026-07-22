# NOSEVIEW 1997 — Development Roadmap Index

This file is the lightweight entry point for NOSEVIEW 1997 planning. Detailed milestone state lives in separate files under `context/roadmap/` so contributors and coding agents only load the direction relevant to the current task.

## Development Directions

| Direction | Roadmap | Purpose | Status |
| --- | --- | --- | --- |
| A | [Canonical Vanilla Edition](context/roadmap/direction-a-canonical.md) | Canonical game and live GitHub Pages version using dependency-free classic JavaScript and WebGL 1 | Primary |
| B | [Vue 3 Learning Edition](context/roadmap/direction-b-vue.md) | Vue 3 learning experiment using the stable engine concepts | Future fork |
| C | [Legacy Compatibility Edition](context/roadmap/direction-c-legacy.md) | Museum-grade IE11 compatibility experiment | Future fork |
| D | [Optional Renderer Experiment](context/roadmap/direction-d-renderer.md) | Canvas 2D wireframe fallback research | Optional |

## Known Bugs

| ID | Tracker | Bug | Priority | Status |
| --- | --- | --- | --- | --- |
| BUG-001 | [Bugfixes](context/roadmap/bugfixes.md) | Analog Vision turns all visual elements green | P1 | Fixed in 1.5.2 |
| BUG-002 | [Bugfixes](context/roadmap/bugfixes.md) | Navigation Limit bypassed by steep vertical flight | P1 | Open |

Shared constraints, deferred ideas, the global Definition of Done, required checks, and the recommended delivery sequence live in [Shared Roadmap Context](context/roadmap/shared.md).

## Instructions for Coding Agents

1. Read `AGENTS.md`, this index, the selected direction file, and the shared roadmap context before planning implementation.
2. Work through milestones in order unless the user explicitly selects another task.
3. Pick one coherent unchecked task or one tightly related task group at a time.
4. Preserve current behavior during architecture-only milestones.
5. Do not combine refactoring, visual redesign, and gameplay changes in one commit.
6. Keep optional display effects disabled by default unless a task explicitly changes that rule.
7. Keep generated geometry, building metadata, and AABB colliders synchronized.
8. Avoid new runtime dependencies in the canonical edition.
9. Do not introduce Vue, TypeScript, Pinia, a router, or a build framework into the canonical edition.
10. The canonical edition must continue to run directly through `file://` without installation, a local server, a bundler, or a generated runtime bundle.
11. Mark a checkbox complete only after its acceptance criteria and the shared Definition of Done are satisfied.
12. Update the selected direction file when scope, progress, or implementation decisions change. Update this index only when roadmap navigation changes.
13. Do not start the Vue or Trident editions until the canonical engine API is stable.
14. Never run `git push` or trigger remote deployments. Only the repository owner publishes local work manually.

## Priority Legend

- **P0** — architecture or correctness work that should happen first
- **P1** — core gameplay work for the next release
- **P2** — polish and presentation work
- **P3** — optional experiment or separate edition

## Context Layout

```text
context/roadmap/
├── bugfixes.md
├── direction-a-canonical.md
├── direction-b-vue.md
├── direction-c-legacy.md
├── direction-d-renderer.md
└── shared.md
```

Detailed milestone checkboxes belong only in their direction file. Cross-direction rules and completion criteria belong in `shared.md`; this root file remains an index.
