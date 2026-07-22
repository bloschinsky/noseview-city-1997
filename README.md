# NOSEVIEW 1997

```text
 _   _  ___  ____  _____ _   _ ___ _____ _    _
| \ | |/ _ \/ ___|| ____| | | |_ _| ____| |  | |
|  \| | | | \___ \|  _| | | | || ||  _| | |  | |
| |\  | |_| |___) | |___ \ V / | || |___| |__| |
|_| \_|\___/|____/|_____| \_/ |___|_____|\____/
             C I T Y   T E R M I N A L   1 9 9 7
```

A retro-futuristic navigation terminal for exploring a procedurally generated 3D city in the spirit of the 1997 web. Built without frameworks or dependencies using only HTML, CSS, JavaScript, and WebGL.

## Features

- Free flight through a three-dimensional city
- Three deterministic procedural landmarks in every 26-structure city
- Solid collisions with building walls and rooftops
- Ground-floor protection and automatic navigation-boundary recovery
- Three speed modes and procedural city regeneration
- HUD with position, altitude, heading, pitch, and FPS data
- Optional `ANALOG VISION` with scanlines, a sweeping beam, glow, and signal noise
- Configurable green digital-rain background for the empty city space
- Optional procedurally synthesized AdLib-style background music
- Procedural retro attention, countdown, and automatic-return audio cues
- Responsive keyboard and on-screen controls

## System Requirements

NOSEVIEW 1997 has no operating-system-specific code. The practical minimum is a browser that supports WebGL 1.0, Canvas 2D, Pointer Events, modern JavaScript, and CSS `aspect-ratio`. Web Audio is optional and is only required for music.

### Browser Compatibility

| Platform | Browser | Minimum version |
| --- | --- | ---: |
| Desktop | Google Chrome | 88 |
| Desktop | Microsoft Edge (Chromium) | 88 |
| Desktop | Mozilla Firefox | 89 |
| Desktop | Apple Safari | 15 |
| Desktop | Other Chromium-based browsers | Chromium 88 engine |
| Android | Google Chrome / Android System WebView | 88 |
| Android | Mozilla Firefox | 89 |
| Android | Samsung Internet | 15 |
| iPhone / iPad | Safari and other WebKit-based browsers | iOS / iPadOS 15 |

These versions are a feature-derived compatibility baseline rather than an exhaustive test matrix. Use the latest browser version available for security, driver compatibility, and performance. Internet Explorer and legacy EdgeHTML are not supported.

### Hardware and Environment

- A GPU and driver capable of WebGL 1.0 (OpenGL ES 2.0-class graphics or equivalent); hardware acceleration should be enabled.
- Any CPU and memory configuration capable of running one supported browser tab. Integrated graphics are sufficient; no discrete GPU is required.
- JavaScript enabled and a viewport at least 320 CSS pixels wide.
- A keyboard on desktop or a pointer/touchscreen on mobile.
- An audio output device and Web Audio support only if music is enabled.
- No installation, build tools, web server, or network connection is required after the project files are available.

The browser floor is primarily set by CSS `aspect-ratio`: it arrived in [Chrome 88](https://developer.chrome.com/blog/new-in-chrome-88), [Firefox 89](https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/89), and [Safari 15](https://webkit.org/blog/11989/new-webkit-features-in-safari-15/). Samsung Internet 15 is based on [Chromium 90](https://developer.samsung.com/internet/blog/en/2021/07/20/introducing-samsung-internet-150-beta). The device must also expose a working [WebGL context](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API), while touchscreen controls rely on [Pointer Events and pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture).

## Controls

- `W / A / S / D` — move
- `Arrow keys` — look around
- `R` — reset position
- `F` — cycle speed

## Navigation Safety

The camera remains at least `0.6` world units above the ground. Signal degradation begins 90 units from the world center, `OUT OF NAVIGATION AREA` and a five-second return countdown begin at 120 units, and crossing 150 units immediately restores the initial camera position. Returning below the critical boundary cancels the countdown. With `SOUND` enabled, these transitions use generated retro attention, timer, and teleport cues; no sample files are loaded.

## Run

Open `index.html` in a modern browser with WebGL support. No installation or build step is required.

## Architecture

The canonical edition uses ordered classic scripts under `src/`, with no native modules, dependencies, bundler, or generated runtime bundle. The framework-agnostic engine is created through `window.Noseview.createNoseviewEngine()`; rendering, city generation, flight/collisions, navigation boundaries, effects, audio, HUD, and page controls remain separate subsystems behind that API.

City generation returns unified structure metadata together with separate building and landmark collections. Every seed promotes three of the 26 structure lots into a telecommunications tower, needle tower, and helipad/antenna complex, so landmarks do not increase the displayed structure count. Solid landmark parts generate their render geometry and AABB colliders together, and each landmark exposes a stable future Signal Hunt anchor.

`window.Noseview` is the only intentional application-level global. `src/main.js` loads last and only wires the engine to the existing page UI.

## Roadmap

See the [development roadmap](TODO.md) for the current planning index and links to the separate TODO files for each development direction.

## Tests

Open `tests.html` directly in a WebGL-capable browser to run the browser and lifecycle suite through `file://`. If Node.js is available, the same pure generation, collision, movement, and formatting cases can also be run with:

```powershell
node tests/node-runner.js
```

Node.js is optional and is not required to open or play the canonical edition.

The tested `v1.3.4` behavior, browser matrix, and reference screenshots are
recorded in [`docs/testing.md`](docs/testing.md).
