(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview || !Noseview.city || !Noseview.flight || !Noseview.navigation || !Noseview.renderer) {
    throw new Error("Engine dependencies must load before engine.js");
  }

  function createNoopEffect() {
    return {
      setEnabled(enabled) { return Boolean(enabled); },
      update() { return false; },
      getCanvas() { return null; },
      destroy() {}
    };
  }

  function createNoopMusic() {
    return {
      setEnabled() { return Promise.resolve(false); },
      getState() { return { available: false, enabled: false }; },
      handleNavigationEvent() {},
      stopNavigationCues() {},
      destroy() { return Promise.resolve(); }
    };
  }

  function createNoseviewEngine(canvas, options) {
    if (!canvas) throw new TypeError("A canvas is required to create the NOSEVIEW engine");
    const settings = options || {};
    const analogVision = settings.analogVision || createNoopEffect();
    const digitalRain = settings.digitalRain || createNoopEffect();
    const music = settings.music || createNoopMusic();
    const onTelemetry = typeof settings.onTelemetry === "function" ? settings.onTelemetry : function () {};
    const onMissionEvent = typeof settings.onMissionEvent === "function" ? settings.onMissionEvent : function () {};
    const onNavigationEvent = typeof settings.onNavigationEvent === "function" ? settings.onNavigationEvent : function () {};
    const onError = typeof settings.onError === "function" ? settings.onError : function () {};
    const flight = Noseview.flight.createFlightModel();
    const navigation = Noseview.navigation.createNavigationModel(settings.navigation);
    let renderer;
    let running = false;
    let destroyed = false;
    let contextLost = false;
    let animationFrame = null;
    let previousTime = 0;
    let lastTelemetryTime = 0;
    let smoothedFps = 60;
    let currentSeed = Noseview.city.DEFAULT_SEED;
    let city = null;
    let navigationSnapshot = navigation.reset(flight.getSnapshot().camera);
    const effects = {
      hud: true,
      analogVision: false,
      digitalRain: false
    };

    function reportError(error) {
      try {
        onError(error);
      } catch (_callbackError) {
        // Error reporting must not recursively break the engine lifecycle.
      }
    }

    function reportNavigationEvent(event) {
      try {
        if (typeof music.handleNavigationEvent === "function") music.handleNavigationEvent(event);
      } catch (error) {
        reportError(error);
      }
      try {
        onNavigationEvent(event);
      } catch (error) {
        reportError(error);
      }
    }

    function stopNavigationAudioCues() {
      try {
        if (typeof music.stopNavigationCues === "function") music.stopNavigationCues();
      } catch (error) {
        reportError(error);
      }
    }

    function handleContextLost() {
      contextLost = true;
      running = false;
      if (animationFrame !== null) {
        root.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      const error = new Error("WEBGL CONTEXT DISCONNECTED.");
      error.code = "WEBGL_CONTEXT_LOST";
      reportError(error);
    }

    renderer = Noseview.renderer.createRenderer(canvas, { onContextLost: handleContextLost });

    function installCity(nextCity) {
      renderer.replaceCity(nextCity.geometry);
      flight.setColliders(nextCity.colliders);
      city = nextCity;
      currentSeed = nextCity.seed;
    }
    installCity(Noseview.city.generateCity(currentSeed));

    function assertAlive() {
      if (destroyed) throw new Error("NOSEVIEW engine has been destroyed");
      if (contextLost) throw new Error("NOSEVIEW WebGL context has been lost");
    }

    function createTelemetrySnapshot() {
      const snapshot = flight.getSnapshot();
      const camera = snapshot.camera;
      const sound = music.getState();
      return {
        position: { x: camera.x, y: camera.y, z: camera.z },
        headingDegrees: (camera.yaw * 180 / Math.PI + 3600) % 360,
        pitchDegrees: camera.pitch * 180 / Math.PI,
        fps: Math.min(smoothedFps, 999),
        buildingCount: city.structures.length,
        speed: { ...snapshot.speed },
        effects: { ...effects },
        sound: { available: Boolean(sound.available), enabled: Boolean(sound.enabled) },
        navigation: { ...navigationSnapshot }
      };
    }

    function emitTelemetry(time, force) {
      if (!force && time - lastTelemetryTime < 100) return;
      lastTelemetryTime = time;
      try {
        onTelemetry(createTelemetrySnapshot());
      } catch (error) {
        reportError(error);
      }
    }

    function render(time) {
      if (!running || destroyed || contextLost) return;
      const deltaTime = Math.max(0, Math.min((time - previousTime) / 1000, 0.05));
      previousTime = time;
      flight.update(deltaTime);

      let flightSnapshot = flight.getSnapshot();
      const previousNavigationState = navigationSnapshot.state;
      const navigationResult = navigation.update(flightSnapshot.camera, deltaTime);
      navigationSnapshot = navigationResult.snapshot;
      let navigationReset = false;
      if (navigationResult.forcedResetReason) {
        flight.clearControls();
        flight.reset();
        flightSnapshot = flight.getSnapshot();
        navigationSnapshot = navigation.reset(flightSnapshot.camera);
        navigationReset = true;
        reportNavigationEvent({
          type: "forced-reset",
          reason: navigationResult.forcedResetReason
        });
      } else {
        if (navigationResult.stateChanged) {
          reportNavigationEvent({
            type: "state-change",
            from: previousNavigationState,
            to: navigationSnapshot.state
          });
        }
        navigationResult.countdownTicks.forEach(secondsRemaining => {
          reportNavigationEvent({ type: "countdown-tick", secondsRemaining });
        });
      }

      if (effects.digitalRain && digitalRain.update(time)) {
        const rainCanvas = digitalRain.getCanvas();
        if (rainCanvas) renderer.updateSkyTexture(rainCanvas);
      }

      renderer.render(flightSnapshot.camera, {
        time,
        analogVisionEnabled: effects.analogVision,
        digitalRainEnabled: effects.digitalRain
      });
      if (effects.analogVision) analogVision.update(time, deltaTime, canvas);

      smoothedFps += ((1 / Math.max(deltaTime, 0.001)) - smoothedFps) * 0.08;
      emitTelemetry(time, navigationResult.stateChanged || navigationReset);
      animationFrame = root.requestAnimationFrame(render);
    }

    function start() {
      assertAlive();
      if (running) return;
      running = true;
      previousTime = root.performance.now();
      emitTelemetry(previousTime, true);
      animationFrame = root.requestAnimationFrame(render);
    }

    function resetCamera() {
      assertAlive();
      stopNavigationAudioCues();
      flight.clearControls();
      flight.reset();
      navigationSnapshot = navigation.reset(flight.getSnapshot().camera);
      emitTelemetry(root.performance.now(), true);
    }

    function regenerateCity() {
      assertAlive();
      stopNavigationAudioCues();
      const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      installCity(Noseview.city.generateCity(seed));
      flight.clearControls();
      flight.reset();
      navigationSnapshot = navigation.reset(flight.getSnapshot().camera);
      emitTelemetry(root.performance.now(), true);
    }

    function setControl(action, enabled) {
      assertAlive();
      flight.setControl(action, enabled);
    }

    function cycleSpeed() {
      assertAlive();
      return flight.cycleSpeed();
    }

    function setEffect(name, enabled) {
      assertAlive();
      if (!Object.prototype.hasOwnProperty.call(effects, name)) {
        throw new RangeError(`Unknown NOSEVIEW effect: ${name}`);
      }
      const nextEnabled = Boolean(enabled);
      if (name === "analogVision") {
        effects[name] = analogVision.setEnabled(nextEnabled);
      } else if (name === "digitalRain") {
        effects[name] = digitalRain.setEnabled(nextEnabled);
      } else {
        effects[name] = nextEnabled;
      }
      return effects[name];
    }

    async function setSoundEnabled(enabled) {
      assertAlive();
      try {
        return await music.setEnabled(Boolean(enabled));
      } catch (error) {
        reportError(error);
        return false;
      }
    }

    async function destroy() {
      if (destroyed) return;
      destroyed = true;
      running = false;
      if (animationFrame !== null) {
        root.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      flight.clearControls();
      analogVision.destroy();
      digitalRain.destroy();
      await music.destroy();
      renderer.destroy();
    }

    void onMissionEvent;
    return {
      start,
      destroy,
      resetCamera,
      regenerateCity,
      setControl,
      cycleSpeed,
      setEffect,
      setSoundEnabled
    };
  }

  Noseview.createNoseviewEngine = createNoseviewEngine;
}(window));
