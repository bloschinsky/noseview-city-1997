# Direction D — Optional Renderer Experiment

> [Roadmap index](../../TODO.md) · [Shared constraints and Definition of Done](shared.md)

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
