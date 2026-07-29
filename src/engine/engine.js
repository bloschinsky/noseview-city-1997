(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview || !Noseview.city || !Noseview.flight || !Noseview.integrity || !Noseview.fuel || !Noseview.navigation || !Noseview.renderer) {
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

  const FUEL_CRASH_DESCENT_SPEED = 18;

  function createNoopMusic() {
    return {
      setEnabled() { return Promise.resolve(false); },
      getState() { return { available: false, enabled: false }; },
      handleNavigationEvent() {},
      handleMissionEvent() {},
      handleFuelEvent() {},
      playCollisionCue() {},
      stopNavigationCues() {},
      destroy() { return Promise.resolve(); }
    };
  }

  function createNoseviewEngine(canvas, options) {
    if (!canvas) throw new TypeError("A canvas is required to create the NOSEVIEW engine");
    const settings = options || {};
    const analogVision = settings.analogVision || createNoopEffect();
    const digitalRain = settings.digitalRain || createNoopEffect();
    const starfield = settings.starfield || { getGeometry() { return null; }, destroy() {} };
    const music = settings.music || createNoopMusic();
    const onTelemetry = typeof settings.onTelemetry === "function" ? settings.onTelemetry : function () {};
    const onMissionEvent = typeof settings.onMissionEvent === "function" ? settings.onMissionEvent : function () {};
    const onNavigationEvent = typeof settings.onNavigationEvent === "function" ? settings.onNavigationEvent : function () {};
    const onCollisionIncident = typeof settings.onCollisionIncident === "function" ? settings.onCollisionIncident : function () {};
    const onIntegrityEvent = typeof settings.onIntegrityEvent === "function" ? settings.onIntegrityEvent : function () {};
    const onFuelEvent = typeof settings.onFuelEvent === "function" ? settings.onFuelEvent : function () {};
    const onError = typeof settings.onError === "function" ? settings.onError : function () {};
    const flight = Noseview.flight.createFlightModel({ reducedMotion: settings.reducedMotion });
    const integrity = Noseview.integrity.createIntegrityModel(settings.integrity);
    const fuel = Noseview.fuel.createFuelModel(settings.fuel);
    const navigation = Noseview.navigation.createNavigationModel(settings.navigation);
    function createNoopMission() {
      const idle = {
        mode: "IDLE",
        missionSeed: null,
        totalTargets: 0,
        acquiredTargets: 0,
        activeTargetId: null,
        timeRemaining: null,
        scan: { inCone: false, distance: null, intensity: 0, alignment: 0 },
        lock: { active: false, elapsedSeconds: 0, durationSeconds: 2, progress: 0 },
        completion: null,
        guidance: { bearingDeltaDegrees: null, elevationDeltaDegrees: null }
      };
      return {
        start() { return idle; },
        reset() { return idle; },
        abort() { return idle; },
        restartAttempt() { return idle; },
        replay() { return idle; },
        update() { return idle; },
        getSnapshot() { return { ...idle }; },
        drainEvents() { return []; },
        isActive() { return false; },
        getTargets() { return []; },
        destroy() {}
      };
    }
    const mission = (Noseview.signalHunt && typeof Noseview.signalHunt.createSignalHuntModel === "function")
      ? Noseview.signalHunt.createSignalHuntModel(settings.signalHunt)
      : createNoopMission();
    let renderer;
    let running = false;
    let destroyed = false;
    let contextLost = false;
    let animationFrame = null;
    let previousTime = 0;
    let lastTelemetryTime = 0;
    let smoothedFps = 60;
    let collisionCount = 0;
    let currentSeed = Noseview.city.DEFAULT_SEED;
    let runSequence = 0;
    let fuelCrashActive = false;
    let city = null;
    let navigationSnapshot;
    const effects = {
      hud: true,
      analogVision: false,
      skyMode: "none"
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

    function reportMissionEvent(event) {
      try {
        if (typeof music.handleMissionEvent === "function") music.handleMissionEvent(event);
      } catch (error) {
        reportError(error);
      }
      try {
        onMissionEvent(event);
      } catch (error) {
        reportError(error);
      }
    }

    function reportIntegrityEvent(event) {
      try {
        onIntegrityEvent(event);
      } catch (error) {
        reportError(error);
      }
    }

    function reportFuelEvent(event) {
      try {
        if (typeof music.handleFuelEvent === "function") music.handleFuelEvent(event);
      } catch (error) {
        reportError(error);
      }
      try {
        onFuelEvent(event);
      } catch (error) {
        reportError(error);
      }
    }

    function reportCollisionIncident(incident, timeSeconds) {
      collisionCount += 1;
      try {
        if (typeof music.playCollisionCue === "function") music.playCollisionCue(incident);
      } catch (error) {
        reportError(error);
      }
      try {
        onCollisionIncident(incident);
      } catch (error) {
        reportError(error);
      }
      try {
        integrity.handleCollision(incident, timeSeconds, collisionCount);
      } catch (error) {
        reportError(error);
      }
    }

    function getMissionExclusions() {
      if (typeof mission.getTargets !== "function") return [];
      return mission.getTargets()
        .filter(target => target && target.position)
        .map(target => target.position);
    }

    function getSurvivalSnapshot() {
      const integritySnapshot = integrity.getSnapshot();
      const fuelSnapshot = fuel.getSnapshot();
      if (fuelCrashActive) {
        return {
          gameOver: false,
          falling: true,
          reasons: [],
          reasonText: ""
        };
      }
      const reasons = [];
      if (integritySnapshot.enabled && integritySnapshot.gameOver) reasons.push("HULL FAILURE");
      if (fuelSnapshot.enabled && fuelSnapshot.gameOver) reasons.push("FUEL EXHAUSTED");
      return {
        gameOver: reasons.length > 0,
        falling: false,
        reasons,
        reasonText: reasons.join(" + ")
      };
    }

    function resetRun() {
      fuelCrashActive = false;
      collisionCount = 0;
      flight.clearMotion();
      flight.resetCollisionIncidents();
      integrity.resetRun();
      if (fuel.getSnapshot().enabled && city) {
        runSequence += 1;
        fuel.resetRun(
          city,
          (city.seed ^ Math.imul(runSequence, 0x9e3779b1)) >>> 0,
          getMissionExclusions(),
          flight.getSnapshot().camera
        );
        fuel.drainEvents().forEach(reportFuelEvent);
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

    renderer = Noseview.renderer.createRenderer(canvas, {
      onContextLost: handleContextLost,
      reducedMotion: settings.reducedMotion,
      starfield
    });

    function installCity(nextCity) {
      renderer.replaceCity(nextCity.geometry);
      flight.setColliders(nextCity.colliders);
      city = nextCity;
      currentSeed = nextCity.seed;
      flight.setInitialCamera(Noseview.city.getMissionStart(nextCity));
    }
    installCity(Noseview.city.generateCity(currentSeed));
    flight.reset();
    navigationSnapshot = navigation.reset(flight.getSnapshot().camera);

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
        collisionCount,
        integrity: integrity.getSnapshot(),
        fuel: fuel.getSnapshot(),
        survival: getSurvivalSnapshot(),
        navigation: { ...navigationSnapshot },
        mission: mission.getSnapshot()
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
      const elapsedTime = Math.max(0, (time - previousTime) / 1000);
      const deltaTime = Math.min(elapsedTime, 0.05);
      previousTime = time;
      const wasGameOver = getSurvivalSnapshot().gameOver;
      const flightResult = wasGameOver || fuelCrashActive
        ? { blocked: false, incidents: [] }
        : flight.update(deltaTime);
      flightResult.incidents.forEach(incident => reportCollisionIncident(incident, time / 1000));
      const integrityEvents = integrity.drainEvents();
      integrityEvents.forEach(reportIntegrityEvent);

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

      if (effects.skyMode === "digitalRain" && digitalRain.update(time)) {
        const rainCanvas = digitalRain.getCanvas();
        if (rainCanvas) renderer.updateSkyTexture(rainCanvas);
      }

      let fuelEvents = [];
      try {
        fuel.update(elapsedTime, flightSnapshot.camera, { paused: wasGameOver });
        fuelEvents = fuel.drainEvents();
        fuelEvents.forEach(reportFuelEvent);
      } catch (error) {
        reportError(error);
      }
      if (fuelEvents.some(event => event.type === "fuel-empty")) {
        fuelCrashActive = true;
        flight.clearControls();
        flight.clearMotion();
      }
      if (fuelCrashActive && typeof flight.descendToGround === "function") {
        const descent = flight.descendToGround(deltaTime, FUEL_CRASH_DESCENT_SPEED);
        flightSnapshot = flight.getSnapshot();
        if (descent.landed) {
          fuelCrashActive = false;
          fuel.confirmGameOver();
          fuel.drainEvents().forEach(reportFuelEvent);
        }
      }
      const survivalSnapshot = getSurvivalSnapshot();
      const survivalFailed = survivalSnapshot.gameOver && !wasGameOver;
      if (survivalFailed) flight.clearControls();

      // Mission update, target and events
      let missionTargets = [];
      try {
        if (!survivalSnapshot.gameOver && !survivalSnapshot.falling) mission.update(flightSnapshot.camera, elapsedTime);
        // Acquired targets remain visible during a hunt, but terminal states leave no stale beacon markers.
        missionTargets = mission.isActive() && typeof mission.getTargets === "function" ? mission.getTargets() : [];
        const missionEvents = mission.drainEvents();
        missionEvents.forEach(reportMissionEvent);
      } catch (error) {
        reportError(error);
      }

      renderer.render(flightSnapshot.camera, {
        time,
        analogVisionEnabled: effects.analogVision,
        skyMode: effects.skyMode,
        missionTargets,
        fuelPickups: fuel.getPickups()
      });
      if (effects.analogVision) analogVision.update(time, deltaTime, canvas);

      smoothedFps += ((1 / Math.max(deltaTime, 0.001)) - smoothedFps) * 0.08;

      emitTelemetry(time, navigationResult.stateChanged || navigationReset || survivalFailed);
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
      // Reset mission attempt if active per policy
      try {
        if (typeof mission.isActive === "function" && mission.isActive()) {
          mission.restartAttempt();
          mission.drainEvents().forEach(reportMissionEvent);
        }
      } catch (error) {
        reportError(error);
      }
      flight.clearControls();
      flight.reset();
      navigationSnapshot = navigation.reset(flight.getSnapshot().camera);
      emitTelemetry(root.performance.now(), true);
    }

    function regenerateCity() {
      assertAlive();
      const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      let replayMission = false;
      try {
        replayMission = typeof mission.isActive === "function" && mission.isActive();
        if (replayMission) {
          mission.abort();
          mission.drainEvents().forEach(reportMissionEvent);
        }
      } catch (error) {
        reportError(error);
      }
      installCity(Noseview.city.generateCity(seed));
      navigationSnapshot = navigation.reset(flight.getSnapshot().camera);
      if (replayMission) {
        try {
          mission.replay(city);
          mission.drainEvents().forEach(reportMissionEvent);
        } catch (error) {
          reportError(error);
        }
      } else {
        try {
          if (typeof mission.reset === "function") {
            mission.reset();
            mission.drainEvents().forEach(reportMissionEvent);
          }
        } catch (error) {
          reportError(error);
        }
      }
      resetRun();
      emitTelemetry(root.performance.now(), true);
    }

    function setControl(action, enabled) {
      assertAlive();
      flight.setControl(action, getSurvivalSnapshot().gameOver ? false : enabled);
    }

    function clearMotion() {
      assertAlive();
      flight.clearMotion();
    }

    function cycleSpeed() {
      assertAlive();
      return flight.cycleSpeed();
    }

    function setEffect(name, enabled) {
      assertAlive();
      if (name === "digitalRain") return setSkyMode(enabled ? "digitalRain" : "none");
      if (!Object.prototype.hasOwnProperty.call(effects, name)) {
        throw new RangeError(`Unknown NOSEVIEW effect: ${name}`);
      }
      const nextEnabled = Boolean(enabled);
      if (name === "analogVision") {
        effects[name] = analogVision.setEnabled(nextEnabled);
      } else {
        effects[name] = nextEnabled;
      }
      return effects[name];
    }

    function setSkyMode(mode) {
      assertAlive();
      const normalize = Noseview.effects && typeof Noseview.effects.normalizeSkyMode === "function"
        ? Noseview.effects.normalizeSkyMode
        : value => (value === "digitalRain" || value === "starfield" ? value : "none");
      const requestedMode = normalize(mode);
      // Resolve the whole sky state synchronously so one render frame can only select one pass.
      const digitalRainEnabled = requestedMode === "digitalRain" && Boolean(digitalRain.setEnabled(true));
      if (!digitalRainEnabled) digitalRain.setEnabled(false);
      effects.skyMode = digitalRainEnabled ? "digitalRain" : (requestedMode === "starfield" ? "starfield" : "none");
      emitTelemetry(root.performance.now(), true);
      return effects.skyMode;
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
      if (typeof starfield.destroy === "function") starfield.destroy();
      await music.destroy();
      try { if (typeof mission.destroy === "function") mission.destroy(); } catch (_error) {}
      integrity.destroy();
      fuel.destroy();
      renderer.destroy();
    }

    function startSignalHunt(seed) {
      assertAlive();
      if (!city) return mission.getSnapshot();
      try {
        mission.start(city, seed);
        resetRun();
        mission.drainEvents().forEach(reportMissionEvent);
      } catch (error) {
        reportError(error);
      }
      emitTelemetry(root.performance.now(), true);
      return mission.getSnapshot();
    }

    function abortSignalHunt() {
      assertAlive();
      try {
        mission.abort();
        mission.drainEvents().forEach(reportMissionEvent);
      } catch (error) {
        reportError(error);
      }
      emitTelemetry(root.performance.now(), true);
      return mission.getSnapshot();
    }

    function replaySignalHunt() {
      assertAlive();
      try {
        mission.replay();
        resetRun();
        mission.drainEvents().forEach(reportMissionEvent);
      } catch (error) {
        reportError(error);
      }
      emitTelemetry(root.performance.now(), true);
      return mission.getSnapshot();
    }

    function setHullIntegrityEnabled(enabled) {
      assertAlive();
      const snapshot = integrity.setEnabled(enabled);
      integrity.drainEvents().forEach(reportIntegrityEvent);
      if (snapshot.gameOver) flight.clearControls();
      emitTelemetry(root.performance.now(), true);
      return snapshot.enabled;
    }

    function setFuelEnduranceEnabled(enabled) {
      assertAlive();
      const snapshot = fuel.setEnabled(
        enabled,
        city,
        (city.seed ^ Math.imul(runSequence + 1, 0x9e3779b1)) >>> 0,
        getMissionExclusions(),
        flight.getSnapshot().camera
      );
      if (snapshot.enabled) runSequence += 1;
      if (!snapshot.enabled) fuelCrashActive = false;
      fuel.drainEvents().forEach(reportFuelEvent);
      if (getSurvivalSnapshot().gameOver) flight.clearControls();
      emitTelemetry(root.performance.now(), true);
      return snapshot.enabled;
    }

    function restartGame() {
      assertAlive();
      if (!integrity.getSnapshot().enabled && !fuel.getSnapshot().enabled) return getSurvivalSnapshot();
      resetRun();
      try {
        if (typeof mission.isActive === "function" && mission.isActive()) {
          mission.restartAttempt();
          mission.drainEvents().forEach(reportMissionEvent);
        }
      } catch (error) {
        reportError(error);
      }
      flight.clearControls();
      flight.reset();
      navigationSnapshot = navigation.reset(flight.getSnapshot().camera);
      emitTelemetry(root.performance.now(), true);
      return getSurvivalSnapshot();
    }

    return {
      start,
      destroy,
      resetCamera,
      regenerateCity,
      setControl,
      clearMotion,
      cycleSpeed,
      setEffect,
      setSkyMode,
      setSoundEnabled,
      startSignalHunt,
      abortSignalHunt,
      replaySignalHunt,
      setHullIntegrityEnabled,
      setFuelEnduranceEnabled,
      restartGame,
      resetRun
    };
  }

  Noseview.createNoseviewEngine = createNoseviewEngine;
}(window));
