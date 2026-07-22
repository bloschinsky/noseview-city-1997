(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview) throw new Error("Noseview namespace must load before navigation.js");

  const STATES = Object.freeze({
    SAFE: "SAFE",
    WARNING: "WARNING",
    CRITICAL: "CRITICAL"
  });
  const DEFAULT_CONFIG = Object.freeze({
    centerX: 0,
    centerZ: 0,
    warningDistance: 90,
    criticalDistance: 120,
    resetDistance: 150,
    countdownSeconds: 5
  });

  function readFinite(settings, name) {
    const value = settings[name] === undefined ? DEFAULT_CONFIG[name] : settings[name];
    if (!Number.isFinite(value)) throw new TypeError(`Navigation ${name} must be finite`);
    return value;
  }

  function normalizeConfig(options) {
    const settings = options || {};
    const config = {
      centerX: readFinite(settings, "centerX"),
      centerZ: readFinite(settings, "centerZ"),
      warningDistance: readFinite(settings, "warningDistance"),
      criticalDistance: readFinite(settings, "criticalDistance"),
      resetDistance: readFinite(settings, "resetDistance"),
      countdownSeconds: readFinite(settings, "countdownSeconds")
    };
    if (config.warningDistance < 0 ||
        config.criticalDistance <= config.warningDistance ||
        config.resetDistance <= config.criticalDistance) {
      throw new RangeError("Navigation distances must satisfy 0 <= warning < critical < reset");
    }
    if (config.countdownSeconds <= 0) {
      throw new RangeError("Navigation countdownSeconds must be greater than zero");
    }
    return Object.freeze(config);
  }

  function createNavigationModel(options) {
    const config = normalizeConfig(options);
    let state = STATES.SAFE;
    let distance = 0;
    let degradation = 0;
    let countdownSeconds = null;
    let lastCountdownTick = null;

    function calculateDistance(position) {
      return Math.hypot(position.x - config.centerX, position.z - config.centerZ);
    }

    function calculateState(nextDistance) {
      if (nextDistance >= config.criticalDistance) return STATES.CRITICAL;
      if (nextDistance >= config.warningDistance) return STATES.WARNING;
      return STATES.SAFE;
    }

    function calculateDegradation(nextDistance) {
      const range = config.resetDistance - config.warningDistance;
      return Math.max(0, Math.min(1, (nextDistance - config.warningDistance) / range));
    }

    function getSnapshot() {
      return {
        state,
        distance,
        degradation,
        countdownSeconds
      };
    }

    function reset(position) {
      distance = position ? calculateDistance(position) : 0;
      degradation = calculateDegradation(distance);
      state = calculateState(distance);
      countdownSeconds = null;
      lastCountdownTick = null;
      return getSnapshot();
    }

    function update(position, deltaTime) {
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
        throw new TypeError("Navigation update requires a finite x/z position");
      }
      if (!Number.isFinite(deltaTime) || deltaTime < 0) {
        throw new RangeError("Navigation deltaTime must be a non-negative finite number");
      }

      const previousState = state;
      distance = calculateDistance(position);
      degradation = calculateDegradation(distance);
      state = calculateState(distance);
      let forcedResetReason = null;
      const countdownTicks = [];

      if (distance >= config.resetDistance) {
        countdownSeconds = 0;
        lastCountdownTick = null;
        forcedResetReason = "hard-limit";
      } else if (state === STATES.CRITICAL) {
        if (previousState !== STATES.CRITICAL || countdownSeconds === null) {
          countdownSeconds = config.countdownSeconds;
          lastCountdownTick = Math.ceil(countdownSeconds);
          countdownTicks.push(lastCountdownTick);
        } else {
          countdownSeconds = Math.max(0, countdownSeconds - deltaTime);
          const nextCountdownTick = Math.ceil(countdownSeconds);
          for (let second = lastCountdownTick - 1; second >= nextCountdownTick; second -= 1) {
            if (second > 0) countdownTicks.push(second);
          }
          lastCountdownTick = nextCountdownTick;
          if (countdownSeconds <= 0.000001) {
            countdownSeconds = 0;
            forcedResetReason = "countdown";
          }
        }
      } else {
        countdownSeconds = null;
        lastCountdownTick = null;
      }

      return {
        snapshot: getSnapshot(),
        stateChanged: state !== previousState,
        countdownTicks,
        forcedResetReason
      };
    }

    return { update, reset, getSnapshot, getConfig() { return config; } };
  }

  Noseview.navigation = { STATES, DEFAULT_CONFIG, createNavigationModel };
}(window));
