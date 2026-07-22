(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  const output = root.document.getElementById("test-output");
  let passed = 0;
  let failed = 0;

  function addResult(name, status, details) {
    const row = root.document.createElement("li");
    row.className = status.toLowerCase();
    row.textContent = `${status} — ${name}${details ? `: ${details}` : ""}`;
    output.appendChild(row);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
  }

  async function runCase(testCase) {
    try {
      await testCase.run();
      passed += 1;
      addResult(testCase.name, "PASS");
    } catch (error) {
      failed += 1;
      addResult(testCase.name, "FAIL", error.message);
    }
  }

  function delay(milliseconds) {
    return new Promise(resolve => root.setTimeout(resolve, milliseconds));
  }

  async function runLifecycleCase() {
    const canvas = root.document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.className = "test-canvas";
    root.document.body.appendChild(canvas);
    const telemetryTimes = [];
    const engine = Noseview.createNoseviewEngine(canvas, {
      onTelemetry() { telemetryTimes.push(root.performance.now()); }
    });
    try {
      engine.start();
      await delay(360);
      assert(telemetryTimes.length >= 1, "Engine did not emit its initial telemetry");
      telemetryTimes.slice(1).forEach((time, index) => {
        assert(time - telemetryTimes[index] >= 90, "Telemetry exceeded the 10 Hz limit");
      });
      await engine.destroy();
      await engine.destroy();
      const countAfterDestroy = telemetryTimes.length;
      await delay(220);
      assert(telemetryTimes.length === countAfterDestroy, "Telemetry continued after destroy()");
      let startFailed = false;
      try {
        engine.start();
      } catch (_error) {
        startFailed = true;
      }
      assert(startFailed, "Destroyed engine started again");
    } finally {
      await engine.destroy();
      canvas.remove();
    }
  }

  async function runForcedNavigationResetCase() {
    const canvas = root.document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.className = "test-canvas";
    root.document.body.appendChild(canvas);
    const telemetry = [];
    const events = [];
    const originalRequestAnimationFrame = root.requestAnimationFrame;
    const originalCancelAnimationFrame = root.cancelAnimationFrame;
    let scheduledFrame = null;
    let frameId = 0;
    const engine = Noseview.createNoseviewEngine(canvas, {
      navigation: {
        warningDistance: 58.5,
        criticalDistance: 59,
        resetDistance: 60,
        countdownSeconds: 5
      },
      onTelemetry(snapshot) { telemetry.push(snapshot); },
      onNavigationEvent(event) { events.push(event); }
    });
    try {
      root.requestAnimationFrame = callback => {
        scheduledFrame = callback;
        frameId += 1;
        return frameId;
      };
      root.cancelAnimationFrame = () => { scheduledFrame = null; };
      engine.start();
      engine.setControl("backward", true);
      let frameTime = root.performance.now();
      for (let frameIndex = 0; frameIndex < 8 && events.length === 0; frameIndex += 1) {
        const callback = scheduledFrame;
        scheduledFrame = null;
        frameTime += 50;
        callback(frameTime);
      }
      assert(events.length === 1, "Hard boundary did not emit a forced-reset event");
      assert(events[0].reason === "hard-limit", "Forced reset reported the wrong reason");
      const postResetFrame = scheduledFrame;
      scheduledFrame = null;
      frameTime += 50;
      postResetFrame(frameTime);
      const latest = telemetry[telemetry.length - 1];
      assert(Math.abs(latest.position.x - 7.5) < 0.001, "Forced reset changed default X");
      assert(Math.abs(latest.position.y - 10) < 0.001, "Forced reset changed default altitude");
      assert(Math.abs(latest.position.z - 58) < 0.001, "Forced reset changed default Z");
      assert(latest.navigation.state === "SAFE", "Forced reset left navigation unsafe");
    } finally {
      await engine.destroy();
      root.requestAnimationFrame = originalRequestAnimationFrame;
      root.cancelAnimationFrame = originalCancelAnimationFrame;
      canvas.remove();
    }
  }

  function runNavigationUiCase() {
    const fixture = root.document.createElement("div");
    fixture.innerHTML = `
      <div class="test-navigation-wrap">
        <span id="pos-x"></span><span id="pos-y"></span><span id="pos-z"></span>
        <span id="heading"></span><span id="pitch"></span><span id="speed"></span>
        <span id="fps"></span><span id="building-count"></span>
        <span id="hud-alt"></span><span id="hud-hdg"></span>
        <canvas id="navigation-noise-canvas" width="32" height="24"></canvas>
        <div id="navigation-alert" hidden><strong id="navigation-message"></strong><span id="navigation-countdown" hidden></span></div>
        <span id="navigation-status" class="blink">ONLINE</span>
      </div>`;
    root.document.body.appendChild(fixture);
    const container = fixture.firstElementChild;
    const hud = Noseview.ui.createHud(root.document, container);
    const signal = Noseview.effects.createNavigationSignal({
      container,
      canvas: fixture.querySelector("#navigation-noise-canvas"),
      reducedMotion: { matches: true }
    });
    const snapshot = {
      position: { x: 90, y: 10, z: 0 },
      headingDegrees: 0,
      pitchDegrees: -10,
      fps: 60,
      buildingCount: 26,
      speed: { name: "NORMAL", move: 10 },
      effects: { hud: false, analogVision: false, digitalRain: false },
      sound: { available: true, enabled: false },
      navigation: { state: "WARNING", distance: 90, degradation: 0, countdownSeconds: null }
    };
    try {
      hud.update(snapshot);
      signal.update(snapshot.navigation);
      assert(!fixture.querySelector("#navigation-alert").hidden, "Warning text was hidden with HUD off");
      assert(fixture.querySelector("#navigation-message").textContent === "NAVIGATION LIMIT", "Warning label changed");
      assert(!fixture.querySelector("#navigation-status").classList.contains("blink"), "Warning status still blinks");
      assert(container.classList.contains("navigation-degraded"), "Warning noise was not enabled");
      assert(container.style.getPropertyValue("--navigation-noise-opacity") === "0.120", "Reduced-motion warning opacity changed");
      const staticFrame = fixture.querySelector("canvas").toDataURL();

      snapshot.navigation = { state: "CRITICAL", distance: 125, degradation: 0.583, countdownSeconds: 1.25 };
      hud.update(snapshot);
      signal.update(snapshot.navigation);
      assert(fixture.querySelector("#navigation-message").textContent === "OUT OF NAVIGATION AREA", "Critical label changed");
      assert(fixture.querySelector("#navigation-countdown").textContent === "RETURN IN 1.3", "Countdown formatting changed");
      assert(container.style.getPropertyValue("--navigation-noise-opacity") === "0.240", "Reduced-motion critical opacity changed");
      assert(fixture.querySelector("canvas").toDataURL() === staticFrame, "Reduced-motion noise frame animated");

      snapshot.navigation = { state: "SAFE", distance: 58, degradation: 0, countdownSeconds: null };
      hud.update(snapshot);
      signal.update(snapshot.navigation);
      assert(fixture.querySelector("#navigation-alert").hidden, "Safe state left warning text visible");
      assert(!container.classList.contains("navigation-degraded"), "Safe state left noise enabled");
    } finally {
      signal.destroy();
      hud.destroy();
      fixture.remove();
    }
  }

  async function run() {
    for (const testCase of Noseview.tests.getCases()) {
      await runCase(testCase);
    }
    await runCase({ name: "engine lifecycle stops RAF and telemetry", run: runLifecycleCase });
    await runCase({ name: "engine hard boundary resets flight and input", run: runForcedNavigationResetCase });
    await runCase({ name: "navigation warnings remain accessible with reduced motion", run: runNavigationUiCase });
    const summary = root.document.getElementById("test-summary");
    summary.textContent = `${passed} passed, ${failed} failed`;
    summary.className = failed === 0 ? "pass" : "fail";
    root.document.title = failed === 0 ? "PASS — NOSEVIEW tests" : "FAIL — NOSEVIEW tests";
    root.__noseviewTestResult = { passed, failed };
  }

  run();
}(window));
