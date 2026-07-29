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

  function runMissionTransmitterRendererCase() {
    const canvas = root.document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.className = "test-canvas";
    root.document.body.appendChild(canvas);
    const renderer = Noseview.renderer.createRenderer(canvas, {
      reducedMotion: { matches: true },
      starfield: Noseview.effects.createStarfield({ count: 32 })
    });
    const gl = canvas.getContext("webgl");
    const camera = { x: 0, y: 10, z: 8, yaw: 0, pitch: 0 };
    const activeTarget = { position: { x: 0, y: 10, z: 0 }, status: "ACTIVE" };
    try {
      renderer.render(camera, {
        time: 1000,
        analogVisionEnabled: false,
        skyMode: "starfield",
        missionTargets: [activeTarget]
      });
      assert(gl.getError() === gl.NO_ERROR, "Active transmitter marker produced a WebGL error");
      renderer.render(camera, {
        time: 1000,
        analogVisionEnabled: true,
        skyMode: "none",
        missionTargets: []
      });
      assert(gl.getError() === gl.NO_ERROR, "Clearing terminal mission markers produced a WebGL error");
    } finally {
      renderer.destroy();
      canvas.remove();
    }
  }

  async function runSkyModeCase() {
    const canvas = root.document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.className = "test-canvas";
    root.document.body.appendChild(canvas);
    const telemetry = [];
    const rainCalls = [];
    const digitalRain = {
      setEnabled(enabled) { rainCalls.push(Boolean(enabled)); return Boolean(enabled); },
      update() { return false; },
      getCanvas() { return null; },
      destroy() {}
    };
    const engine = Noseview.createNoseviewEngine(canvas, {
      starfield: Noseview.effects.createStarfield({ count: 32 }),
      digitalRain,
      onTelemetry(snapshot) { telemetry.push(snapshot); }
    });
    try {
      ["digitalRain", "starfield", "none", "starfield", "digitalRain", "starfield", "none"].forEach(mode => engine.setSkyMode(mode));
      assert(telemetry.every(snapshot => ["none", "digitalRain", "starfield"].includes(snapshot.effects.skyMode)), "Telemetry exposed an invalid sky mode");
      assert(telemetry.some(snapshot => snapshot.effects.skyMode === "digitalRain"), "Digital Rain transition was not reported");
      assert(telemetry.some(snapshot => snapshot.effects.skyMode === "starfield"), "Starfield transition was not reported");
      assert(telemetry[telemetry.length - 1].effects.skyMode === "none", "Rapid sky toggling did not finish at NONE");
      assert(rainCalls.filter(enabled => !enabled).length >= 4, "Digital Rain was not disabled during sky-mode switches");
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
    const initialCamera = Noseview.city.getMissionStart(Noseview.city.generateCity(Noseview.city.DEFAULT_SEED));
    const initialDistance = Math.hypot(initialCamera.x, initialCamera.z);
    const engine = Noseview.createNoseviewEngine(canvas, {
      navigation: {
        warningDistance: initialDistance + 0.5,
        criticalDistance: initialDistance + 1,
        resetDistance: initialDistance + 1.5,
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
      assert(Math.abs(latest.position.x - initialCamera.x) < 0.001, "Forced reset changed default X");
      assert(Math.abs(latest.position.y - initialCamera.y) < 0.001, "Forced reset changed default altitude");
      assert(Math.abs(latest.position.z - initialCamera.z) < 0.001, "Forced reset changed default Z");
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

  async function runCollisionIncidentEngineCase() {
    const canvas = root.document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.className = "test-canvas";
    root.document.body.appendChild(canvas);
    const telemetry = [];
    const incidents = [];
    const cues = [];
    const originalFlightFactory = Noseview.flight.createFlightModel;
    const originalRequestAnimationFrame = root.requestAnimationFrame;
    const originalCancelAnimationFrame = root.cancelAnimationFrame;
    let scheduledFrame = null;
    let frameId = 0;
    let updateCount = 0;
    const camera = { x: 0, y: 10, z: 60, yaw: 0, pitch: 0 };
    const flight = {
      setControl() {},
      clearControls() {},
      reset() {},
      setInitialCamera() {},
      setColliders() {},
      resetCollisionIncidents() {},
      cycleSpeed() { return { name: "NORMAL", move: 10, turn: 65 }; },
      update() {
        updateCount += 1;
        return {
          blocked: updateCount === 1,
          incidents: updateCount === 1 ? [{ type: "collision", surface: "STRUCTURE", colliderId: "building-07-base", impactSequence: 1 }] : []
        };
      },
      getSnapshot() { return { camera: { ...camera }, speed: { name: "NORMAL", move: 10, turn: 65 }, minimumAltitude: 0.6 }; }
    };
    const music = {
      setEnabled(value) { return Promise.resolve(Boolean(value)); },
      getState() { return { available: true, enabled: false }; },
      handleNavigationEvent() {},
      handleMissionEvent() {},
      playCollisionCue(incident) { cues.push(incident); },
      stopNavigationCues() {},
      destroy() { return Promise.resolve(); }
    };
    let engine;
    try {
      Noseview.flight.createFlightModel = () => flight;
      engine = Noseview.createNoseviewEngine(canvas, {
        music,
        onTelemetry(snapshot) { telemetry.push(snapshot); },
        onCollisionIncident(incident) { incidents.push(incident); }
      });
      Noseview.flight.createFlightModel = originalFlightFactory;
      root.requestAnimationFrame = callback => {
        scheduledFrame = callback;
        frameId += 1;
        return frameId;
      };
      root.cancelAnimationFrame = () => { scheduledFrame = null; };
      engine.start();
      let frameTime = root.performance.now() + 120;
      let callback = scheduledFrame;
      scheduledFrame = null;
      callback(frameTime);
      callback = scheduledFrame;
      scheduledFrame = null;
      callback(frameTime + 120);
      assert(incidents.length === 1 && cues.length === 1, "One normalized incident did not drive one audio cue and one engine event");
      assert(incidents[0] === cues[0], "Collision audio did not receive the normalized incident object");
      assert(telemetry[telemetry.length - 1].collisionCount === 1, "Collision telemetry did not count the normalized incident once");
      engine.resetCamera();
      assert(telemetry[telemetry.length - 1].collisionCount === 1, "Reset position incorrectly cleared collision count");
      engine.startSignalHunt();
      assert(telemetry[telemetry.length - 1].collisionCount === 0, "Mission start did not begin a fresh collision run");
    } finally {
      Noseview.flight.createFlightModel = originalFlightFactory;
      root.requestAnimationFrame = originalRequestAnimationFrame;
      root.cancelAnimationFrame = originalCancelAnimationFrame;
      if (engine) await engine.destroy();
      canvas.remove();
    }
  }

  async function runHullIntegrityEngineCase() {
    const canvas = root.document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.className = "test-canvas";
    root.document.body.appendChild(canvas);
    const telemetry = [];
    const integrityEvents = [];
    const originalFlightFactory = Noseview.flight.createFlightModel;
    const originalRequestAnimationFrame = root.requestAnimationFrame;
    const originalCancelAnimationFrame = root.cancelAnimationFrame;
    let scheduledFrame = null;
    let frameId = 0;
    let updateCount = 0;
    let clearCount = 0;
    const camera = { x: 0, y: 10, z: 60, yaw: 0, pitch: 0 };
    const flight = {
      setControl() {},
      clearControls() { clearCount += 1; },
      reset() {},
      setInitialCamera() {},
      setColliders() {},
      resetCollisionIncidents() { updateCount = 0; },
      cycleSpeed() { return { name: "NORMAL", move: 10, turn: 65 }; },
      update() {
        updateCount += 1;
        return {
          blocked: true,
          incidents: [{
            type: "collision",
            surface: "STRUCTURE",
            colliderId: `test-contact-${updateCount}`,
            impactSequence: updateCount
          }]
        };
      },
      getSnapshot() {
        return { camera: { ...camera }, speed: { name: "NORMAL", move: 10, turn: 65 }, minimumAltitude: 0.6 };
      }
    };
    let engine;
    try {
      Noseview.flight.createFlightModel = () => flight;
      engine = Noseview.createNoseviewEngine(canvas, {
        onTelemetry(snapshot) { telemetry.push(snapshot); },
        onIntegrityEvent(event) { integrityEvents.push(event); }
      });
      Noseview.flight.createFlightModel = originalFlightFactory;
      root.requestAnimationFrame = callback => {
        scheduledFrame = callback;
        frameId += 1;
        return frameId;
      };
      root.cancelAnimationFrame = () => { scheduledFrame = null; };
      engine.startSignalHunt(101);
      engine.setHullIntegrityEnabled(true);
      engine.start();
      let frameTime = root.performance.now() + 120;
      for (let index = 0; index < 10; index += 1) {
        const callback = scheduledFrame;
        scheduledFrame = null;
        callback(frameTime);
        frameTime += 120;
      }
      const failed = telemetry[telemetry.length - 1];
      assert(failed.integrity.gameOver && failed.integrity.current === 0, "Ten impacts did not produce Hull Game Over");
      assert(failed.collisionCount === 10, "Hull failure changed the normalized collision count");
      assert(failed.mission.mode === "ACTIVE", "Hull failure changed the selected Signal Hunt");
      const pausedTime = failed.mission.timeRemaining;
      const callback = scheduledFrame;
      scheduledFrame = null;
      callback(frameTime);
      const paused = telemetry[telemetry.length - 1];
      assert(paused.mission.timeRemaining === pausedTime, "Mission timing continued after Hull Game Over");
      assert(paused.collisionCount === 10, "Flight continued producing collisions after Hull Game Over");
      assert(integrityEvents.filter(event => event.type === "game-over").length === 1, "Engine emitted Hull Game Over more than once");
      assert(clearCount > 0, "Hull Game Over did not clear held flight controls");
      engine.restartGame();
      const restarted = telemetry[telemetry.length - 1];
      assert(restarted.integrity.current === 100 && !restarted.integrity.gameOver, "Restart did not restore full hull");
      assert(restarted.collisionCount === 0, "Restart did not clear collision records");
      assert(restarted.mission.mode === "ACTIVE" && restarted.mission.timeRemaining === 120, "Restart did not restart the active mission attempt");
      engine.setHullIntegrityEnabled(false);
      const disabled = telemetry[telemetry.length - 1];
      assert(!disabled.integrity.enabled && disabled.mission.mode === "ACTIVE", "Disabling Hull Integrity changed the mission");
    } finally {
      Noseview.flight.createFlightModel = originalFlightFactory;
      root.requestAnimationFrame = originalRequestAnimationFrame;
      root.cancelAnimationFrame = originalCancelAnimationFrame;
      if (engine) await engine.destroy();
      canvas.remove();
    }
  }

  async function runCombinedSurvivalEngineCase() {
    const canvas = root.document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.className = "test-canvas";
    root.document.body.appendChild(canvas);
    const telemetry = [];
    const originalFlightFactory = Noseview.flight.createFlightModel;
    const originalRequestAnimationFrame = root.requestAnimationFrame;
    const originalCancelAnimationFrame = root.cancelAnimationFrame;
    let scheduledFrame = null;
    const camera = { x: 0, y: 2.4, z: 60, yaw: 0, pitch: 0 };
    const flight = {
      setControl() {},
      clearControls() {},
      reset() {},
      setInitialCamera() {},
      setColliders() {},
      resetCollisionIncidents() {},
      cycleSpeed() { return { name: "NORMAL", move: 10, turn: 65 }; },
      descendToGround(deltaTime, speed) {
        camera.y = Math.max(0.6, camera.y - deltaTime * speed);
        return { landed: camera.y === 0.6 };
      },
      update() {
        return {
          blocked: true,
          incidents: [{
            type: "collision",
            surface: "STRUCTURE",
            colliderId: "combined-contact",
            impactSequence: 1
          }]
        };
      },
      getSnapshot() {
        return { camera: { ...camera }, speed: { name: "NORMAL", move: 10, turn: 65 }, minimumAltitude: 0.6 };
      }
    };
    let engine;
    try {
      Noseview.flight.createFlightModel = () => flight;
      engine = Noseview.createNoseviewEngine(canvas, {
        integrity: { damagePerIncident: 100 },
        fuel: {
          maximum: 0.1,
          drainPerSecond: 1,
          lowThreshold: 0.1,
          criticalThreshold: 0.05,
          maximumDeltaSeconds: 1
        },
        onTelemetry(snapshot) { telemetry.push(snapshot); }
      });
      Noseview.flight.createFlightModel = originalFlightFactory;
      root.requestAnimationFrame = callback => {
        scheduledFrame = callback;
        return 1;
      };
      root.cancelAnimationFrame = () => { scheduledFrame = null; };
      engine.startSignalHunt(101);
      engine.setHullIntegrityEnabled(true);
      engine.setFuelEnduranceEnabled(true);
      engine.start();
      const callback = scheduledFrame;
      scheduledFrame = null;
      callback(root.performance.now() + 150);
      const falling = telemetry[telemetry.length - 1];
      assert(falling.survival.falling && !falling.survival.gameOver, "Fuel exhaustion did not begin the controlled descent");
      assert(falling.position.y < 2.4 && falling.position.y > 0.6, "Fuel descent did not lower the camera before Game Over");
      assert(falling.mission.timeRemaining === 120, "Mission timing continued during the fuel descent");
      const landingCallback = scheduledFrame;
      scheduledFrame = null;
      landingCallback(root.performance.now() + 210);
      const failed = telemetry[telemetry.length - 1];
      assert(failed.survival.gameOver, "Combined survival failure did not enter Game Over");
      assert(
        failed.survival.reasonText === "HULL FAILURE + FUEL EXHAUSTED",
        "Simultaneous Hull and Fuel failure order was not deterministic"
      );
      assert(failed.integrity.current === 0 && failed.fuel.current === 0, "Combined failure did not exhaust both resources");
      engine.restartGame();
      const restarted = telemetry[telemetry.length - 1];
      assert(!restarted.survival.gameOver, "Shared restart left survival Game Over active");
      assert(restarted.integrity.current === 100 && restarted.fuel.current === 0.1, "Shared restart did not restore both resources");
      assert(restarted.collisionCount === 0, "Shared restart did not clear collision count");
      assert(restarted.fuel.activePickupCount === 3, "Shared restart did not rebuild fuel barrels");
      assert(restarted.mission.mode === "ACTIVE" && restarted.mission.timeRemaining === 120, "Shared restart did not restart the active mission");
      engine.abortSignalHunt();
      const aborted = telemetry[telemetry.length - 1];
      assert(aborted.fuel.current === 0.1 && aborted.fuel.activePickupCount === 3, "Mission abort changed independent Fuel state");
      engine.startSignalHunt(102);
      const freshMission = telemetry[telemetry.length - 1];
      assert(freshMission.fuel.current === 0.1 && freshMission.fuel.activePickupCount === 3, "Mission start did not begin a fresh Fuel run");
      engine.setFuelEnduranceEnabled(false);
      const disabled = telemetry[telemetry.length - 1];
      assert(!disabled.fuel.enabled && disabled.fuel.activePickupCount === 0, "Disabling Fuel left active pickup state");
      assert(disabled.integrity.enabled && disabled.mission.mode === "ACTIVE", "Disabling Fuel changed Hull Integrity or the mission");
    } finally {
      Noseview.flight.createFlightModel = originalFlightFactory;
      root.requestAnimationFrame = originalRequestAnimationFrame;
      root.cancelAnimationFrame = originalCancelAnimationFrame;
      if (engine) await engine.destroy();
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

  async function runMissionAudioCase() {
    const canvas = root.document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.className = "test-canvas";
    root.document.body.appendChild(canvas);
    const audioEvents = [];
    const telemetry = [];
    const music = {
      setEnabled(value) { return Promise.resolve(Boolean(value)); },
      getState() { return { available: true, enabled: false }; },
      handleNavigationEvent() {},
      handleMissionEvent(event) { audioEvents.push(event && event.type); },
      stopNavigationCues() {},
      destroy() { return Promise.resolve(); }
    };
    const engine = Noseview.createNoseviewEngine(canvas, { music, onTelemetry(snapshot) { telemetry.push(snapshot); } });
    try {
      assert(typeof engine.scanSignal === "undefined", "Manual scan API is still exposed");
      engine.start();
      engine.startSignalHunt();
      await delay(30);
      assert(audioEvents.includes("mission-started"), "Mission start did not reach audio");
      engine.resetCamera();
      await delay(10);
      assert(audioEvents.includes("mission-restarted"), "Mission restart did not reach audio");
      engine.regenerateCity();
      await delay(30);
      const regenerated = telemetry[telemetry.length - 1];
      assert(audioEvents.includes("mission-aborted"), "City generation did not abort the active mission");
      assert(audioEvents.filter(type => type === "mission-restarted").length >= 2, "City generation did not replay the active mission");
      assert(regenerated && regenerated.mission.mode === "ACTIVE", "City generation did not leave a new active mission");
      assert(regenerated.mission.activeTargetId !== null && regenerated.mission.acquiredTargets === 0, "Replayed mission did not create fresh target state");
      const restartCount = audioEvents.filter(type => type === "mission-restarted").length;
      engine.abortSignalHunt();
      engine.regenerateCity();
      await delay(30);
      const inactiveRegenerated = telemetry[telemetry.length - 1];
      assert(inactiveRegenerated && inactiveRegenerated.mission.mode === "IDLE", "City generation left stale inactive mission state");
      assert(audioEvents.filter(type => type === "mission-restarted").length === restartCount, "Inactive city generation emitted a mission restart");
    } finally {
      await engine.destroy();
      canvas.remove();
    }
  }

  async function runNavigationUiCase() {
    const fixture = root.document.createElement("div");
    fixture.innerHTML = `
      <div class="test-navigation-wrap">
        <span id="pos-x"></span><span id="pos-y"></span><span id="pos-z"></span>
        <span id="heading"></span><span id="pitch"></span><span id="speed"></span>
        <span id="fps"></span><span id="building-count"></span><span id="collision-count"></span>
        <div id="hull-status-row" hidden>HULL: <span id="hull-integrity"><span class="hull-meter-fill"></span></span></div>
        <div id="fuel-status-row" hidden>FUEL: <span id="fuel-level"></span><span id="fuel-meter"><span class="fuel-meter-fill"></span></span></div>
        <span id="hud-alt"></span><span id="hud-hdg"></span>
        <span id="mission-mode"></span><span id="mission-timer"></span>
        <span id="mission-progress"></span><span id="mission-lock"></span>
        <div id="mission-lock-frame" hidden></div>
        <div id="mission-feedback" hidden></div>
        <div id="mission-complete" hidden><strong id="mission-complete-title"></strong><span id="mission-complete-stats"></span>
          <button id="mission-replay-button"></button><button id="mission-new-city-button"></button>
        </div>
        <div id="game-over" hidden><span id="game-over-reason"></span><span id="game-over-stats"></span></div>
        <canvas id="navigation-noise-canvas" width="32" height="24"></canvas>
        <div id="navigation-alert" hidden><strong id="navigation-message"></strong><span id="navigation-countdown" hidden></span></div>
        <div id="hull-critical-alert" hidden></div>
        <div id="fuel-alert" hidden><strong id="fuel-alert-text"></strong></div>
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
      collisionCount: 7,
      integrity: { enabled: true, current: 30, maximum: 100, low: true, criticalText: "HULL CRITICAL", gameOver: false },
      fuel: { enabled: true, current: 24.5, maximum: 100, low: true, critical: false, warningText: "LOW FUEL", gameOver: false },
      survival: { gameOver: false, reasons: [], reasonText: "" },
      speed: { name: "NORMAL", move: 10 },
      effects: { hud: false, analogVision: false, digitalRain: false },
      sound: { available: true, enabled: false },
      navigation: { state: "WARNING", distance: 90, degradation: 0, countdownSeconds: null },
      mission: {
        mode: "ACTIVE",
        timeRemaining: 120,
        totalTargets: 5,
        acquiredTargets: 2,
        lock: { active: true, progress: 0.5 },
        completion: null,
        feedback: "SIGNAL ACQUIRED"
      }
    };
    try {
      hud.update(snapshot);
      signal.update(snapshot.navigation);
      assert(fixture.querySelector("#mission-lock").textContent === "50%", "Lock progress formatting changed");
      assert(!fixture.querySelector("#mission-lock-frame").hidden, "Valid lock frame was hidden");
      assert(fixture.querySelector("#mission-lock-frame").style.getPropertyValue("--lock-width") === "48px", "Lock frame did not shrink with progress");
      assert(fixture.querySelector("#mission-feedback").textContent === "SIGNAL ACQUIRED", "Acquisition feedback was not rendered as text");
      assert(!fixture.querySelector("#mission-feedback").hidden, "Acquisition feedback was hidden");
      assert(fixture.querySelector("#collision-count").textContent === "7", "Collision counter was not rendered as persistent text");
      assert(!fixture.querySelector("#hull-status-row").hidden, "Hull meter was hidden while the optional HUD was off");
      assert(fixture.querySelector("#hull-integrity").style.getPropertyValue("--hull-level") === "30%", "Hull meter level changed");
      assert(fixture.querySelector("#hull-integrity").getAttribute("aria-valuetext") === "30 of 100 hull integrity", "Hull meter lost its accessible value");
      assert(!fixture.querySelector("#hull-critical-alert").hidden, "Low hull state lacked a flight-HUD warning");
      assert(!fixture.querySelector("#fuel-status-row").hidden, "Fuel text was hidden while Fuel Endurance was enabled");
      assert(fixture.querySelector("#fuel-level").textContent === "24.5/100", "Fuel telemetry formatting changed");
      assert(fixture.querySelector("#fuel-meter").style.getPropertyValue("--fuel-level") === "24.5%", "Fuel meter level changed");
      assert(fixture.querySelector("#fuel-meter").getAttribute("aria-valuetext") === "24.5 of 100 fuel", "Fuel meter lost its accessible value");
      assert(!fixture.querySelector("#fuel-alert").hidden, "Low fuel lacked a persistent text warning");
      assert(fixture.querySelector("#fuel-alert-text").textContent === "LOW FUEL", "Low-fuel warning text changed");
      assert(!fixture.querySelector("#navigation-alert").hidden, "Warning text was hidden with HUD off");
      assert(fixture.querySelector("#navigation-message").textContent === "NAVIGATION LIMIT", "Warning label changed");
      assert(!fixture.querySelector("#navigation-status").classList.contains("blink"), "Warning status still blinks");
      assert(container.classList.contains("navigation-degraded"), "Warning noise was not enabled");
      assert(container.style.getPropertyValue("--navigation-noise-opacity") === "0.120", "Reduced-motion warning opacity changed");
      const staticFrame = fixture.querySelector("canvas").toDataURL();

      snapshot.integrity = { ...snapshot.integrity, current: 0, gameOver: true };
      snapshot.survival = { gameOver: true, reasons: ["HULL FAILURE"], reasonText: "HULL FAILURE" };
      hud.update(snapshot);
      assert(!fixture.querySelector("#game-over").hidden, "Hull Game Over text was hidden");
      assert(
        fixture.querySelector("#game-over-stats").textContent === "FINAL COLLISIONS: 7 // FUEL: 25/100",
        "Combined survival summary changed"
      );
      assert(fixture.querySelector("#hull-critical-alert").hidden, "Hull Critical remained behind Game Over");
      snapshot.integrity = { ...snapshot.integrity, current: 100, low: false, criticalText: "", gameOver: false };
      snapshot.survival = { gameOver: false, reasons: [], reasonText: "" };

      snapshot.navigation = { state: "CRITICAL", distance: 125, degradation: 0.583, countdownSeconds: 1.25 };
      hud.update(snapshot);
      signal.update(snapshot.navigation);
      assert(fixture.querySelector("#navigation-message").textContent === "OUT OF NAVIGATION AREA", "Critical label changed");
      assert(fixture.querySelector("#navigation-countdown").textContent === "RETURN IN 1.3", "Countdown formatting changed");
      assert(container.style.getPropertyValue("--navigation-noise-opacity") === "0.240", "Reduced-motion critical opacity changed");
      assert(fixture.querySelector("canvas").toDataURL() === staticFrame, "Reduced-motion noise frame animated");

      snapshot.navigation = { state: "SAFE", distance: 58, degradation: 0, countdownSeconds: null };
      snapshot.mission = {
        mode: "COMPLETE",
        timeRemaining: 116.4,
        totalTargets: 5,
        acquiredTargets: 5,
        lock: { active: false, progress: 0 },
        completion: { acquiredTargets: 5, totalTargets: 5, elapsedSeconds: 12.3 },
        feedback: null
      };
      hud.update(snapshot);
      signal.update(snapshot.navigation);
      assert(fixture.querySelector("#mission-lock-frame").hidden, "Lock frame remained visible outside acquisition");
      assert(fixture.querySelector("#mission-lock").textContent === "--", "Inactive lock did not clear its telemetry");
      assert(!fixture.querySelector("#mission-complete").hidden, "Completion overlay was hidden");
      assert(fixture.querySelector("#mission-complete-stats").textContent === "TARGETS: 5/5 // TIME: 12.3 SEC", "Completion summary format changed");
      snapshot.position.x = 90.1;
      hud.update(snapshot);
      assert(!fixture.querySelector("#mission-complete").hidden, "Completion overlay disappeared after movement");
      assert(fixture.querySelector("#navigation-alert").hidden, "Safe state left warning text visible");
      assert(!container.classList.contains("navigation-degraded"), "Safe state left noise enabled");
    } finally {
      signal.destroy();
      hud.destroy();
      fixture.remove();
    }
  }

  async function runMissionCompletionFocusCase() {
    const fixture = root.document.createElement("div");
    fixture.innerHTML = `
      <button id="settings-button"></button>
      <div id="settings-modal" hidden><button id="settings-close"></button></div>
      <button id="hud-button"></button><button id="analog-button"></button>
      <button id="digital-rain-button"></button><button id="starfield-button"></button><button id="speed-button"></button>
      <button id="sound-button"></button><button id="reset-button"></button>
      <button id="regen-button"></button><button id="missions-button"></button><canvas id="gl-canvas" tabindex="-1"></canvas>
      <div id="missions-modal" hidden><button id="missions-close"></button><div id="missions-catalog"></div></div>
      <div id="mission-complete" role="dialog" hidden>
        <button id="mission-replay-button">REPLAY</button>
        <button id="mission-new-city-button">NEW CITY</button>
      </div>`;
    root.document.body.appendChild(fixture);
    const calls = { replay: 0, regenerate: 0 };
    const engine = {
      setControl() {},
      resetCamera() {},
      regenerateCity() { calls.regenerate += 1; },
      startSignalHunt() {},
      abortSignalHunt() {},
      replaySignalHunt() { calls.replay += 1; },
      cycleSpeed() { return { name: "NORMAL" }; },
      setEffect(_name, enabled) { return enabled; },
      setSkyMode(mode) { return mode; },
      setSoundEnabled(enabled) { return Promise.resolve(enabled); }
    };
    const controls = Noseview.ui.createControls({
      documentRoot: root.document,
      windowRoot: root,
      engine,
      hud: { setVisible() {} }
    });
    const missionsButton = fixture.querySelector("#missions-button");
    const dialog = fixture.querySelector("#mission-complete");
    const replay = fixture.querySelector("#mission-replay-button");
    const newCity = fixture.querySelector("#mission-new-city-button");
    const rain = fixture.querySelector("#digital-rain-button");
    const starfield = fixture.querySelector("#starfield-button");
    const baseSnapshot = {
      effects: { hud: true, analogVision: false, skyMode: "none" },
      sound: { available: true, enabled: false },
      speed: { name: "NORMAL" },
      mission: { mode: "ACTIVE" }
    };
    try {
      rain.click();
      assert(rain.getAttribute("aria-pressed") === "true" && starfield.getAttribute("aria-pressed") === "false", "Digital Rain did not set an exclusive sky button state");
      starfield.click();
      assert(rain.getAttribute("aria-pressed") === "false" && starfield.getAttribute("aria-pressed") === "true", "Starfield did not replace Digital Rain in Settings");
      starfield.click();
      assert(rain.getAttribute("aria-pressed") === "false" && starfield.getAttribute("aria-pressed") === "false", "Active Starfield did not return Settings to NONE");
      missionsButton.focus();
      dialog.hidden = false;
      controls.updateTelemetry({ ...baseSnapshot, mission: { mode: "COMPLETE" } });
      assert(root.document.activeElement === replay, "Completion dialog did not focus its first control");
      newCity.focus();
      newCity.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      assert(root.document.activeElement === replay, "Completion dialog did not wrap forward focus");
      replay.focus();
      replay.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
      assert(root.document.activeElement === newCity, "Completion dialog did not wrap backward focus");
      replay.click();
      assert(calls.replay === 1, "Completion replay control did not replay the mission");
      dialog.hidden = true;
      controls.updateTelemetry(baseSnapshot);
      assert(root.document.activeElement === missionsButton, "Completion dialog did not restore focus to Missions");

      fixture.querySelector("#settings-button").click();
      assert(!fixture.querySelector("#settings-modal").hidden, "Settings dialog did not open for completion conflict test");
      dialog.hidden = false;
      controls.updateTelemetry({ ...baseSnapshot, mission: { mode: "COMPLETE" } });
      assert(fixture.querySelector("#settings-modal").hidden, "Completion dialog did not close the settings dialog");
      assert(root.document.activeElement === replay, "Completion dialog did not take focus from settings");
      newCity.click();
      assert(calls.regenerate === 1, "Completion new-city control did not regenerate the city");
    } finally {
      controls.destroy();
      fixture.remove();
    }
  }

  async function runMissionsMenuCase() {
    const fixture = root.document.createElement("div");
    fixture.innerHTML = `
      <button id="settings-button"></button>
      <div id="settings-modal" hidden><button id="settings-close"></button></div>
      <button id="hud-button"></button><button id="analog-button"></button>
      <button id="digital-rain-button"></button><button id="starfield-button"></button><button id="speed-button"></button>
      <button id="sound-button"></button><button id="reset-button"></button><button id="regen-button"></button>
      <button id="missions-button">MISSIONS</button><canvas id="gl-canvas" tabindex="-1"></canvas>
      <div id="missions-modal" role="dialog" hidden><button id="missions-close">CLOSE</button><div id="missions-catalog"></div></div>
      <div id="mission-complete" role="dialog" hidden><button id="mission-replay-button">REPLAY</button><button id="mission-new-city-button">NEW CITY</button></div>
      <div id="game-over" role="dialog" hidden><button id="game-restart-button">RESTART</button></div>`;
    root.document.body.appendChild(fixture);
    const calls = { start: 0, replay: 0, abort: 0 };
    const engine = {
      setControl() {}, resetCamera() {}, regenerateCity() {}, restartGame() {},
      startSignalHunt() { calls.start += 1; },
      replaySignalHunt() { calls.replay += 1; },
      abortSignalHunt() { calls.abort += 1; },
      cycleSpeed() { return { name: "NORMAL" }; },
      setEffect(_name, enabled) { return enabled; }, setSkyMode(mode) { return mode; },
      setSoundEnabled(enabled) { return Promise.resolve(enabled); }
    };
    const controls = Noseview.ui.createControls({ documentRoot: root.document, windowRoot: root, engine, hud: { setVisible() {} } });
    const baseSnapshot = {
      effects: { hud: true, analogVision: false, skyMode: "none" },
      sound: { available: true, enabled: false }, speed: { name: "NORMAL" },
      integrity: { enabled: false, gameOver: false }, fuel: { enabled: false, gameOver: false }, survival: { gameOver: false }
    };
    const missions = fixture.querySelector("#missions-modal");
    const missionsButton = fixture.querySelector("#missions-button");
    const settings = fixture.querySelector("#settings-modal");
    const canvas = fixture.querySelector("#gl-canvas");
    try {
      controls.updateTelemetry({ ...baseSnapshot, mission: { mode: "IDLE", acquiredTargets: 0, totalTargets: 0 } });
      missionsButton.click();
      assert(!missions.hidden, "Missions dialog did not open");
      assert(missions.querySelectorAll(".mission-catalog-entry").length === 1, "Missions dialog did not render the implemented catalog");
      assert(missions.textContent.includes("SIGNAL HUNT") && missions.textContent.includes("READY // FREE FLIGHT"), "Signal Hunt catalog text was incomplete");
      assert(missions.querySelector("[data-mission-action='start']").textContent === "START SIGNAL HUNT", "Idle Signal Hunt action was not available");
      fixture.querySelector("#settings-button").click();
      assert(missions.hidden && !settings.hidden, "Settings and Missions remained open together");
      fixture.querySelector("#settings-close").click();

      missionsButton.click();
      missions.querySelector("[data-mission-action='start']").click();
      assert(calls.start === 1 && missions.hidden, "Missions start action was not routed and closed");
      assert(root.document.activeElement === canvas, "Mission start did not return focus to the flight display");

      controls.updateTelemetry({ ...baseSnapshot, mission: { mode: "ACTIVE", acquiredTargets: 1, totalTargets: 4 } });
      missionsButton.click();
      const abort = missions.querySelector("[data-mission-action='abort']");
      assert(missions.textContent.includes("ACTIVE // TARGETS: 1/4") && abort, "Active Signal Hunt state or abort action was not rendered");
      abort.focus();
      abort.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      assert(root.document.activeElement === fixture.querySelector("#missions-close"), "Missions dialog did not trap forward focus");
      fixture.querySelector("#missions-close").dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
      assert(root.document.activeElement === abort, "Missions dialog did not trap backward focus");
      abort.click();
      assert(calls.abort === 1 && missions.hidden, "Missions abort action was not routed and closed");

      controls.updateTelemetry({ ...baseSnapshot, mission: { mode: "ABORTED", acquiredTargets: 1, totalTargets: 4 } });
      missionsButton.click();
      missions.querySelector("[data-mission-action='replay']").click();
      assert(calls.replay === 1 && missions.hidden, "Missions replay action was not routed and closed");

      missionsButton.click();
      missions.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      assert(missions.hidden && root.document.activeElement === missionsButton, "Missions Escape did not close and restore focus");

      missionsButton.click();
      controls.updateTelemetry({ ...baseSnapshot, mission: { mode: "COMPLETE" }, survival: { gameOver: true, reasonText: "HULL FAILURE" } });
      assert(missions.hidden && fixture.querySelector("#mission-complete").hidden && !fixture.querySelector("#game-over").hidden, "Missions, completion, and Game Over created competing dialogs");
    } finally {
      controls.destroy();
      fixture.remove();
    }
  }

  async function runHullGameOverFocusCase() {
    const fixture = root.document.createElement("div");
    fixture.innerHTML = `
      <button id="settings-button"></button>
      <div id="settings-modal" hidden><button id="settings-close"></button><button id="hull-integrity-button"></button><button id="fuel-endurance-button"></button></div>
      <button id="hud-button"></button><button id="analog-button"></button>
      <button id="digital-rain-button"></button><button id="starfield-button"></button><button id="speed-button"></button>
      <button id="sound-button"></button><button id="reset-button"></button>
      <button id="regen-button"></button><button id="missions-button"></button><canvas id="gl-canvas" tabindex="-1"></canvas>
      <div id="missions-modal" hidden><button id="missions-close"></button><div id="missions-catalog"></div></div>
      <div id="mission-complete" role="dialog" hidden>
        <button id="mission-replay-button">REPLAY</button>
        <button id="mission-new-city-button">NEW CITY</button>
      </div>
      <div id="game-over" role="dialog" hidden><button id="game-restart-button">RESTART GAME</button></div>`;
    root.document.body.appendChild(fixture);
    let restartCalls = 0;
    let fuelToggleCalls = 0;
    const engine = {
      setControl() {},
      resetCamera() {},
      regenerateCity() {},
      startSignalHunt() {},
      abortSignalHunt() {},
      replaySignalHunt() {},
      restartGame() { restartCalls += 1; },
      setHullIntegrityEnabled(enabled) { return enabled; },
      setFuelEnduranceEnabled(enabled) { fuelToggleCalls += 1; return enabled; },
      cycleSpeed() { return { name: "NORMAL" }; },
      setEffect(_name, enabled) { return enabled; },
      setSkyMode(mode) { return mode; },
      setSoundEnabled(enabled) { return Promise.resolve(enabled); }
    };
    const controls = Noseview.ui.createControls({
      documentRoot: root.document,
      windowRoot: root,
      engine,
      hud: { setVisible() {} }
    });
    const baseSnapshot = {
      effects: { hud: true, analogVision: false, skyMode: "none" },
      sound: { available: true, enabled: false },
      speed: { name: "NORMAL" },
      mission: { mode: "ACTIVE" },
      integrity: { enabled: true, gameOver: false },
      fuel: { enabled: false, gameOver: false },
      survival: { gameOver: false }
    };
    const settings = fixture.querySelector("#settings-modal");
    const gameOver = fixture.querySelector("#game-over");
    const restart = fixture.querySelector("#game-restart-button");
    try {
      fixture.querySelector("#fuel-endurance-button").click();
      assert(fuelToggleCalls === 1, "Fuel Endurance toggle did not call the engine");
      fixture.querySelector("#settings-button").click();
      assert(!settings.hidden, "Settings did not open before Hull failure");
      controls.updateTelemetry({
        ...baseSnapshot,
        integrity: { enabled: true, gameOver: true },
        survival: { gameOver: true, reasonText: "HULL FAILURE" }
      });
      assert(settings.hidden && !gameOver.hidden, "Hull Game Over did not replace Settings");
      assert(root.document.activeElement === restart, "Hull Game Over did not focus Restart Game");
      restart.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      assert(root.document.activeElement === restart, "Single Game Over action did not trap forward focus");
      restart.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
      assert(root.document.activeElement === restart, "Single Game Over action did not trap backward focus");
      restart.click();
      assert(restartCalls === 1, "Restart Game control did not call the engine");
      controls.updateTelemetry(baseSnapshot);
      assert(gameOver.hidden, "Restart did not close Hull Game Over");
      assert(root.document.activeElement === fixture.querySelector("#settings-button"), "Game Over did not restore focus");
    } finally {
      controls.destroy();
      fixture.remove();
    }
  }

  async function run() {
    for (const testCase of Noseview.tests.getCases()) {
      await runCase(testCase);
    }
    await runCase({ name: "engine lifecycle stops RAF and telemetry", run: runLifecycleCase });
    await runCase({ name: "signal transmitter marker renders and clears cleanly", run: runMissionTransmitterRendererCase });
    await runCase({ name: "sky modes are exclusive during rapid transitions", run: runSkyModeCase });
    await runCase({ name: "engine hard boundary resets flight and input", run: runForcedNavigationResetCase });
    await runCase({ name: "normalized collision incidents drive audio and run telemetry once", run: runCollisionIncidentEngineCase });
    await runCase({ name: "Hull Integrity failure pauses and restarts an active mission", run: runHullIntegrityEngineCase });
    await runCase({ name: "Hull and Fuel share one deterministic combined Game Over", run: runCombinedSurvivalEngineCase });
    await runCase({ name: "navigation audio stays lazy and schedules procedural cues", run: runNavigationAudioCase });
    await runCase({ name: "navigation warnings remain accessible with reduced motion", run: runNavigationUiCase });
    await runCase({ name: "Missions menu renders and routes Signal Hunt actions", run: runMissionsMenuCase });
    await runCase({ name: "mission completion dialog traps and restores focus", run: runMissionCompletionFocusCase });
    await runCase({ name: "Hull Game Over dialog traps and restores focus", run: runHullGameOverFocusCase });
    await runCase({ name: "mission events reach audio", run: runMissionAudioCase });
    const summary = root.document.getElementById("test-summary");
    summary.textContent = `${passed} passed, ${failed} failed`;
    summary.className = failed === 0 ? "pass" : "fail";
    root.document.title = failed === 0 ? "PASS — NOSEVIEW tests" : "FAIL — NOSEVIEW tests";
    root.__noseviewTestResult = { passed, failed };
  }

  run();
}(window));
