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
    centerY: 10,
    warningDistance: 90,
    criticalDistance: 120,
    resetDistance: 150,
    warningAltitude: 90,
    criticalAltitude: 120,
    resetAltitude: 150,
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
      centerY: readFinite(settings, "centerY"),
      warningDistance: readFinite(settings, "warningDistance"),
      criticalDistance: readFinite(settings, "criticalDistance"),
      resetDistance: readFinite(settings, "resetDistance"),
      warningAltitude: readFinite(settings, "warningAltitude"),
      criticalAltitude: readFinite(settings, "criticalAltitude"),
      resetAltitude: readFinite(settings, "resetAltitude"),
      countdownSeconds: readFinite(settings, "countdownSeconds")
    };
    if (config.warningDistance < 0 ||
        config.criticalDistance <= config.warningDistance ||
        config.resetDistance <= config.criticalDistance) {
      throw new RangeError("Navigation distances must satisfy 0 <= warning < critical < reset");
    }
    if (config.warningAltitude < 0 ||
        config.criticalAltitude <= config.warningAltitude ||
        config.resetAltitude <= config.criticalAltitude) {
      throw new RangeError("Navigation altitudes must satisfy 0 <= warning < critical < reset");
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

    function calculateRadialDistance(position) {
      return Math.hypot(position.x - config.centerX, position.z - config.centerZ);
    }

    function calculateAltitudeExcess(position) {
      const y = Number.isFinite(position.y) ? position.y : config.centerY;
      return Math.abs(y - config.centerY);
    }

    function calculateState(radial, altitude) {
      if (radial >= config.criticalDistance || altitude >= config.criticalAltitude) return STATES.CRITICAL;
      if (radial >= config.warningDistance || altitude >= config.warningAltitude) return STATES.WARNING;
      return STATES.SAFE;
    }

    function calculateDegradation(radial, altitude) {
      const radialRange = config.resetDistance - config.warningDistance;
      const altitudeRange = config.resetAltitude - config.warningAltitude;
      const radialDegradation = Math.max(0, Math.min(1, (radial - config.warningDistance) / radialRange));
      const altitudeDegradation = Math.max(0, Math.min(1, (altitude - config.warningAltitude) / altitudeRange));
      return Math.max(radialDegradation, altitudeDegradation);
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
      if (position) {
        const radial = calculateRadialDistance(position);
        const altitude = calculateAltitudeExcess(position);
        distance = radial;
        degradation = calculateDegradation(radial, altitude);
        state = calculateState(radial, altitude);
      } else {
        distance = 0;
        degradation = 0;
        state = STATES.SAFE;
      }
      countdownSeconds = null;
      lastCountdownTick = null;
      return getSnapshot();
    }

    function update(position, deltaTime) {
      if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
        throw new TypeError("Navigation update requires a finite x/z position");
      }
      if (position.y !== undefined && !Number.isFinite(position.y)) {
        throw new TypeError("Navigation update requires a finite y position when provided");
      }
      if (!Number.isFinite(deltaTime) || deltaTime < 0) {
        throw new RangeError("Navigation deltaTime must be a non-negative finite number");
      }

      const previousState = state;
      const radial = calculateRadialDistance(position);
      const altitude = calculateAltitudeExcess(position);
      distance = radial;
      degradation = calculateDegradation(radial, altitude);
      state = calculateState(radial, altitude);
      let forcedResetReason = null;
      const countdownTicks = [];

      if (radial >= config.resetDistance || altitude >= config.resetAltitude) {
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
