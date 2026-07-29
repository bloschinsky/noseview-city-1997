(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview) throw new Error("Noseview namespace must load before integrity.js");

  const DEFAULTS = Object.freeze({
    maximum: 100,
    damagePerIncident: 10,
    lowThreshold: 30,
    damageGuardSeconds: 0.2
  });

  function positiveNumber(value, fallback, label) {
    const resolved = value === undefined ? fallback : value;
    if (!Number.isFinite(resolved) || resolved <= 0) {
      throw new RangeError(`${label} must be a positive finite number`);
    }
    return resolved;
  }

  function createIntegrityModel(options) {
    const settings = options || {};
    const maximum = positiveNumber(settings.maximum, DEFAULTS.maximum, "Maximum integrity");
    const damagePerIncident = positiveNumber(
      settings.damagePerIncident,
      DEFAULTS.damagePerIncident,
      "Integrity damage"
    );
    const lowThreshold = positiveNumber(settings.lowThreshold, DEFAULTS.lowThreshold, "Low-integrity threshold");
    const damageGuardSeconds = settings.damageGuardSeconds === undefined
      ? DEFAULTS.damageGuardSeconds
      : settings.damageGuardSeconds;
    if (!Number.isFinite(damageGuardSeconds) || damageGuardSeconds < 0) {
      throw new RangeError("Integrity damage guard must be a non-negative finite number");
    }
    if (lowThreshold > maximum) {
      throw new RangeError("Low-integrity threshold cannot exceed maximum integrity");
    }

    let enabled = Boolean(settings.enabled);
    let current = maximum;
    let gameOver = false;
    let destroyed = false;
    const lastDamageByContact = new Map();
    const events = [];

    function contactKey(incident) {
      const surface = incident && incident.surface ? String(incident.surface) : "UNKNOWN";
      const collider = incident && incident.colliderId !== null && incident.colliderId !== undefined
        ? String(incident.colliderId)
        : "ground";
      return `${surface}:${collider}`;
    }

    function getSnapshot() {
      return {
        enabled,
        current,
        maximum,
        damagePerIncident,
        lowThreshold,
        low: enabled && current <= lowThreshold,
        criticalText: enabled && current <= lowThreshold ? "HULL CRITICAL" : "",
        gameOver
      };
    }

    function resetRun() {
      current = maximum;
      gameOver = false;
      lastDamageByContact.clear();
      return getSnapshot();
    }

    function setEnabled(nextEnabled) {
      const next = Boolean(nextEnabled);
      if (enabled === next) return getSnapshot();
      enabled = next;
      resetRun();
      events.push({ type: enabled ? "integrity-enabled" : "integrity-disabled" });
      return getSnapshot();
    }

    function handleCollision(incident, timeSeconds, collisionCount) {
      if (destroyed || !enabled || gameOver || !incident) {
        return { applied: false, damage: 0, snapshot: getSnapshot() };
      }
      const now = Number.isFinite(timeSeconds) ? timeSeconds : 0;
      const key = contactKey(incident);
      const previous = lastDamageByContact.get(key);
      if (previous !== undefined && now >= previous && now - previous < damageGuardSeconds) {
        return { applied: false, damage: 0, snapshot: getSnapshot() };
      }
      lastDamageByContact.set(key, now);
      const before = current;
      current = Math.max(0, current - damagePerIncident);
      const damage = before - current;
      events.push({ type: "integrity-damaged", damage, current, maximum, incident });
      if (current === 0 && !gameOver) {
        gameOver = true;
        events.push({
          type: "game-over",
          reason: "HULL FAILURE",
          collisionCount: Number.isFinite(collisionCount) ? collisionCount : null
        });
      }
      return { applied: true, damage, snapshot: getSnapshot() };
    }

    function drainEvents() {
      const drained = events.slice();
      events.length = 0;
      return drained;
    }

    function destroy() {
      destroyed = true;
      lastDamageByContact.clear();
      events.length = 0;
    }

    return {
      getSnapshot,
      setEnabled,
      resetRun,
      handleCollision,
      drainEvents,
      destroy
    };
  }

  Noseview.integrity = {
    DEFAULTS,
    createIntegrityModel
  };
}(window));
