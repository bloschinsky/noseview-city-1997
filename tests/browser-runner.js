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
    const audioEvents = [];
    let stoppedNavigationCues = 0;
    const music = {
      setEnabled(value) { return Promise.resolve(Boolean(value)); },
      getState() { return { available: true, enabled: false }; },
      handleNavigationEvent(event) { audioEvents.push(event); },
      stopNavigationCues() { stoppedNavigationCues += 1; },
      destroy() { return Promise.resolve(); }
    };
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
      music,
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
      for (let frameIndex = 0; frameIndex < 8 && !events.some(event => event.type === "forced-reset"); frameIndex += 1) {
        const callback = scheduledFrame;
        scheduledFrame = null;
        frameTime += 50;
        callback(frameTime);
      }
      const forcedReset = events.find(event => event.type === "forced-reset");
      assert(Boolean(forcedReset), "Hard boundary did not emit a forced-reset event");
      assert(forcedReset.reason === "hard-limit", "Forced reset reported the wrong reason");
      assert(audioEvents.some(event => event.type === "state-change"), "Navigation state changes did not reach audio");
      assert(audioEvents.some(event => event.type === "countdown-tick" && event.secondsRemaining === 5), "Countdown tick did not reach audio");
      assert(audioEvents.some(event => event.type === "forced-reset"), "Forced reset did not reach audio");
      const postResetFrame = scheduledFrame;
      scheduledFrame = null;
      frameTime += 50;
      postResetFrame(frameTime);
      const latest = telemetry[telemetry.length - 1];
      assert(Math.abs(latest.position.x - 7.5) < 0.001, "Forced reset changed default X");
      assert(Math.abs(latest.position.y - 10) < 0.001, "Forced reset changed default altitude");
      assert(Math.abs(latest.position.z - 58) < 0.001, "Forced reset changed default Z");
      assert(latest.navigation.state === "SAFE", "Forced reset left navigation unsafe");
      engine.resetCamera();
      assert(stoppedNavigationCues === 1, "Manual reset did not stop navigation cues");
    } finally {
      await engine.destroy();
      root.requestAnimationFrame = originalRequestAnimationFrame;
      root.cancelAnimationFrame = originalCancelAnimationFrame;
      canvas.remove();
    }
  }

  function createFakeAudioContextHarness() {
    const counters = { contexts: 0, oscillators: 0, bufferSources: 0, stoppedSources: 0 };

    class FakeAudioParam {
      constructor(value) { this.value = value || 0; }
      cancelScheduledValues() {}
      setValueAtTime(value) { this.value = value; }
      linearRampToValueAtTime(value) { this.value = value; }
      exponentialRampToValueAtTime(value) { this.value = value; }
    }

    class FakeNode {
      connect() { return this; }
      disconnect() {}
    }

    class FakeSource extends FakeNode {
      constructor() {
        super();
        this.ended = null;
        this.stopped = false;
      }
      addEventListener(type, listener) {
        if (type === "ended") this.ended = listener;
      }
      start() {}
      stop(time) {
        if (Number.isFinite(time)) {
          this.stopTime = time;
          return;
        }
        if (this.stopped) throw new Error("Source already stopped");
        this.stopped = true;
        counters.stoppedSources += 1;
        if (this.ended) this.ended();
      }
    }

    class FakeAudioContext {
      constructor() {
        counters.contexts += 1;
        this.currentTime = 1;
        this.sampleRate = 8000;
        this.state = "suspended";
        this.destination = new FakeNode();
      }
      createGain() {
        const node = new FakeNode();
        node.gain = new FakeAudioParam();
        return node;
      }
      createDynamicsCompressor() {
        const node = new FakeNode();
        ["threshold", "knee", "ratio", "attack", "release"].forEach(name => {
          node[name] = new FakeAudioParam();
        });
        return node;
      }
      createBuffer(_channels, length) {
        const data = new Float32Array(length);
        return { getChannelData() { return data; } };
      }
      createOscillator() {
        counters.oscillators += 1;
        const source = new FakeSource();
        source.frequency = new FakeAudioParam();
        source.detune = new FakeAudioParam();
        return source;
      }
      createBufferSource() {
        counters.bufferSources += 1;
        return new FakeSource();
      }
      createBiquadFilter() {
        const node = new FakeNode();
        node.frequency = new FakeAudioParam();
        node.Q = new FakeAudioParam();
        return node;
      }
      resume() { this.state = "running"; return Promise.resolve(); }
      suspend() { this.state = "suspended"; return Promise.resolve(); }
      close() { this.state = "closed"; return Promise.resolve(); }
    }

    return { counters, AudioContextClass: FakeAudioContext };
  }

  async function runNavigationAudioCase() {
    const harness = createFakeAudioContextHarness();
    const music = Noseview.audio.createMusic({ AudioContextClass: harness.AudioContextClass });
    music.handleNavigationEvent({ type: "state-change", from: "SAFE", to: "WARNING" });
    assert(harness.counters.contexts === 0, "Navigation cue initialized audio before SOUND was enabled");

    try {
      assert(await music.setEnabled(true), "Fake audio could not be enabled");
      const baselineOscillators = harness.counters.oscillators;
      music.handleNavigationEvent({ type: "state-change", from: "SAFE", to: "WARNING" });
      assert(harness.counters.oscillators === baselineOscillators + 3, "Attention cue did not schedule three tones");
      music.handleNavigationEvent({ type: "countdown-tick", secondsRemaining: 5 });
      assert(harness.counters.oscillators === baselineOscillators + 4, "Countdown tick did not schedule one tone");
      music.handleNavigationEvent({ type: "countdown-tick", secondsRemaining: 1 });
      assert(harness.counters.oscillators === baselineOscillators + 6, "Final countdown tick did not schedule its double tone");

      const stoppedBeforeCancel = harness.counters.stoppedSources;
      music.handleNavigationEvent({ type: "state-change", from: "CRITICAL", to: "WARNING" });
      assert(harness.counters.stoppedSources >= stoppedBeforeCancel + 6, "Leaving critical range did not cancel navigation cues");

      const oscillatorsBeforeTeleport = harness.counters.oscillators;
      const buffersBeforeTeleport = harness.counters.bufferSources;
      music.handleNavigationEvent({ type: "forced-reset", reason: "countdown" });
      assert(harness.counters.oscillators === oscillatorsBeforeTeleport + 2, "Teleport cue did not schedule both tone sweeps");
      assert(harness.counters.bufferSources === buffersBeforeTeleport + 1, "Teleport cue did not schedule its noise sweep");

      await music.setEnabled(false);
      const sourcesAfterDisable = harness.counters.oscillators + harness.counters.bufferSources;
      music.handleNavigationEvent({ type: "countdown-tick", secondsRemaining: 4 });
      assert(harness.counters.oscillators + harness.counters.bufferSources === sourcesAfterDisable, "Disabled SOUND still scheduled a cue");
    } finally {
      await music.destroy();
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
    await runCase({ name: "navigation audio stays lazy and schedules procedural cues", run: runNavigationAudioCase });
    await runCase({ name: "navigation warnings remain accessible with reduced motion", run: runNavigationUiCase });
    const summary = root.document.getElementById("test-summary");
    summary.textContent = `${passed} passed, ${failed} failed`;
    summary.className = failed === 0 ? "pass" : "fail";
    root.document.title = failed === 0 ? "PASS — NOSEVIEW tests" : "FAIL — NOSEVIEW tests";
    root.__noseviewTestResult = { passed, failed };
  }

  run();
}(window));
