(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview || !Noseview.city) throw new Error("Noseview namespace and city must load before signal-hunt.js");

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function deg(rad) { return rad * 180 / Math.PI; }
  function rad(degValue) { return degValue * Math.PI / 180; }
  function wrapDegrees180(value) {
    let v = ((value % 360) + 360) % 360; // [0..360)
    if (v > 180) v -= 360;              // (-180..180]
    return v;
  }

  function createRng(seed) {
    let state = seed >>> 0;
    return function () {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function shuffleDeterministic(array, seed) {
    const random = createRng(seed >>> 0);
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function pickNTargets(structures, count, seed) {
    const candidates = structures.filter(s => s && s.signalAnchor && Number.isFinite(s.signalAnchor.x) && Number.isFinite(s.signalAnchor.y) && Number.isFinite(s.signalAnchor.z));
    const shuffled = shuffleDeterministic(candidates, seed ^ 0x6b1f23a9);
    const picked = shuffled.slice(0, Math.min(count, shuffled.length));
    return picked.map((structure, index) => ({
      id: String(structure.id || `target-${index}`),
      structureId: structure.id || null,
      x: structure.signalAnchor.x,
      y: structure.signalAnchor.y,
      z: structure.signalAnchor.z
    }));
  }

  function computeForward(yaw, pitch) {
    const cp = Math.cos(pitch);
    return {
      x: Math.sin(yaw) * cp,
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * cp
    };
  }

  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

  function direction(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { x: dx / len, y: dy / len, z: dz / len, distance: Math.hypot(dx, dy, dz) };
  }

  function bearingYawDegrees(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    return deg(Math.atan2(dx, -dz));
  }

  function elevationPitchDegrees(from, to) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dy = to.y - from.y;
    const planar = Math.hypot(dx, dz) || 0.000001;
    return deg(Math.atan2(dy, planar));
  }

  function createSignalHuntModel(options) {
    const settings = options || {};
    const TARGET_COUNT = Number.isInteger(settings.targetCount) && settings.targetCount > 0 ? settings.targetCount : 5;
    const TIMER_SECONDS = Number.isFinite(settings.timerSeconds) && settings.timerSeconds > 0 ? settings.timerSeconds : 120;
    const SCAN_CONE_DEGREES = Number.isFinite(settings.scanConeDegrees) && settings.scanConeDegrees > 0 ? settings.scanConeDegrees : 10;
    const SCAN_MIN_DISTANCE = Number.isFinite(settings.scanMinDistance) && settings.scanMinDistance >= 0 ? settings.scanMinDistance : 2.5;
    const SCAN_MAX_DISTANCE = Number.isFinite(settings.scanMaxDistance) && settings.scanMaxDistance > 0 ? settings.scanMaxDistance : 80;
    const MAX_DT = 0.08; // match engine-bounded deltas philosophy
    const LOCK_DURATION_SECONDS = 2;

    let mode = "IDLE"; // IDLE | ACTIVE | SUCCESS | FAILED | ABORTED
    let missionSeed = null;
    let totalTargets = 0;
    let acquiredTargets = 0;
    let activeIndex = -1;
    let timeRemaining = null;
    let elapsedSeconds = 0;
    let lockElapsedSeconds = 0;
    let completion = null;
    let targets = [];
    let missionCity = null;
    const events = [];

    function emptyScan() {
      return { inCone: false, distance: null, intensity: 0, alignment: 0 };
    }

    function emptyGuidance() {
      return { bearingDeltaDegrees: null, elevationDeltaDegrees: null };
    }

    function resetLock() {
      lockElapsedSeconds = 0;
    }

    function resetTelemetry() {
      lastScan = emptyScan();
      lastGuidance = emptyGuidance();
      resetLock();
    }

    let lastScan = emptyScan();
    let lastGuidance = emptyGuidance();

    function getSnapshot() {
      return {
        mode,
        missionSeed,
        totalTargets,
        acquiredTargets,
        activeTargetId: targets[activeIndex] ? String(targets[activeIndex].id) : null,
        timeRemaining,
        scan: {
          ...lastScan,
          lock: {
            active: Boolean(lastScan.inCone),
            elapsedSeconds: lockElapsedSeconds,
            durationSeconds: LOCK_DURATION_SECONDS,
            progress: clamp(lockElapsedSeconds / LOCK_DURATION_SECONDS, 0, 1)
          }
        },
        lock: {
          active: Boolean(lastScan.inCone),
          elapsedSeconds: lockElapsedSeconds,
          durationSeconds: LOCK_DURATION_SECONDS,
          progress: clamp(lockElapsedSeconds / LOCK_DURATION_SECONDS, 0, 1)
        },
        completion: completion ? { ...completion } : null,
        guidance: { ...lastGuidance }
      };
    }

    function isActive() { return mode === "ACTIVE"; }

    function start(city, seed) {
      if (!city || !Array.isArray(city.structures)) throw new TypeError("Signal Hunt start requires a city");
      const normalized = (seed === undefined || seed === null) ? ((city.seed ^ 0x5f3759df) >>> 0) : (seed >>> 0);
      missionCity = city;
      missionSeed = normalized;
      targets = pickNTargets(city.structures, TARGET_COUNT, (city.seed ^ normalized) >>> 0);
      totalTargets = targets.length;
      acquiredTargets = 0;
      activeIndex = totalTargets > 0 ? 0 : -1;
      timeRemaining = totalTargets > 0 ? TIMER_SECONDS : null;
      elapsedSeconds = 0;
      completion = null;
      resetTelemetry();
      mode = totalTargets > 0 ? "ACTIVE" : "FAILED";
      events.push({ type: "mission-started", missionSeed, totalTargets });
      return getSnapshot();
    }

    function abort() {
      if (mode !== "ACTIVE") return getSnapshot();
      mode = "ABORTED";
      targets = [];
      totalTargets = 0;
      acquiredTargets = 0;
      activeIndex = -1;
      timeRemaining = null;
      elapsedSeconds = 0;
      completion = null;
      resetTelemetry();
      events.push({ type: "mission-aborted" });
      return getSnapshot();
    }

    function restartAttempt() {
      if (mode !== "ACTIVE") return getSnapshot();
      acquiredTargets = 0;
      activeIndex = totalTargets > 0 ? 0 : -1;
      timeRemaining = totalTargets > 0 ? TIMER_SECONDS : null;
      elapsedSeconds = 0;
      completion = null;
      resetTelemetry();
      events.push({ type: "mission-restarted" });
      return getSnapshot();
    }

    function replay(nextCity, seed) {
      if (mode !== "SUCCESS" && mode !== "FAILED" && mode !== "ABORTED") return getSnapshot();
      if (nextCity !== undefined) {
        if (!nextCity || !Array.isArray(nextCity.structures)) throw new TypeError("Signal Hunt replay requires a city");
        missionCity = nextCity;
        missionSeed = (seed === undefined || seed === null)
          ? ((nextCity.seed ^ 0x5f3759df) >>> 0)
          : (seed >>> 0);
      }
      if (!missionCity) return getSnapshot();
      targets = pickNTargets(missionCity.structures, TARGET_COUNT, (missionCity.seed ^ missionSeed) >>> 0);
      totalTargets = targets.length;
      acquiredTargets = 0;
      activeIndex = totalTargets > 0 ? 0 : -1;
      timeRemaining = totalTargets > 0 ? TIMER_SECONDS : null;
      elapsedSeconds = 0;
      completion = null;
      resetTelemetry();
      mode = totalTargets > 0 ? "ACTIVE" : "FAILED";
      events.push({ type: "mission-restarted" });
      return getSnapshot();
    }

    function update(camera, dt) {
      if (!isActive()) return getSnapshot();
      const delta = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, MAX_DT));
      elapsedSeconds += delta;
      timeRemaining = Math.max(0, (timeRemaining || 0) - delta);
      const active = targets[activeIndex];
      if (active && camera) {
        const fwd = computeForward(camera.yaw || 0, camera.pitch || 0);
        const toTargetDir = direction(camera, active);
        const cosAngle = clamp(dot(fwd, { x: toTargetDir.x, y: toTargetDir.y, z: toTargetDir.z }), -1, 1);
        const angle = deg(Math.acos(cosAngle));
        const inAngle = angle <= SCAN_CONE_DEGREES;
        const inDistance = toTargetDir.distance >= SCAN_MIN_DISTANCE && toTargetDir.distance <= SCAN_MAX_DISTANCE;
        const alignment = clamp((SCAN_CONE_DEGREES - angle) / SCAN_CONE_DEGREES, 0, 1);
        const distanceFactor = clamp(1 - (toTargetDir.distance - SCAN_MIN_DISTANCE) / Math.max(1, SCAN_MAX_DISTANCE - SCAN_MIN_DISTANCE), 0, 1);
        lastScan = {
          inCone: Boolean(inAngle && inDistance),
          distance: toTargetDir.distance,
          intensity: Math.sqrt(alignment * distanceFactor),
          alignment
        };
        const bearing = bearingYawDegrees(camera, active);
        const elevation = elevationPitchDegrees(camera, active);
        lastGuidance = {
          bearingDeltaDegrees: wrapDegrees180(bearing - deg(camera.yaw || 0)),
          elevationDeltaDegrees: wrapDegrees180(elevation - deg(camera.pitch || 0))
        };
      } else {
        lastScan = emptyScan();
        lastGuidance = emptyGuidance();
      }
      if (timeRemaining === 0) {
        mode = "FAILED";
        resetTelemetry();
        events.push({ type: "mission-failed" });
        return getSnapshot();
      }
      if (lastScan.inCone) {
        lockElapsedSeconds = Math.min(LOCK_DURATION_SECONDS, lockElapsedSeconds + delta);
        if (lockElapsedSeconds >= LOCK_DURATION_SECONDS) {
          acquireActiveTarget();
        }
      } else {
        resetLock();
      }
      return getSnapshot();
    }

    function acquireActiveTarget() {
      const active = targets[activeIndex];
      if (!isActive() || !active) return;
      acquiredTargets += 1;
      events.push({ type: "target-acquired", targetId: String(active.id), acquiredTargets, totalTargets });
      if (acquiredTargets >= totalTargets) {
        mode = "SUCCESS";
        activeIndex = -1;
        timeRemaining = Math.max(0, timeRemaining || 0);
        completion = {
          acquiredTargets,
          totalTargets,
          elapsedSeconds
        };
        resetTelemetry();
        events.push({ type: "mission-complete", ...completion });
      } else {
        activeIndex += 1;
        resetTelemetry();
      }
    }

    function drainEvents() {
      const out = events.slice();
      events.length = 0;
      return out;
    }

    function destroy() {
      targets = [];
      missionCity = null;
    }

    return {
      // lifecycle
      start,
      abort,
      restartAttempt,
      replay,
      update,
      getSnapshot,
      drainEvents,
      isActive,
      destroy,
      getActiveTarget() {
        if (mode !== "ACTIVE") return null;
        return targets[activeIndex] ? { x: targets[activeIndex].x, y: targets[activeIndex].y, z: targets[activeIndex].z } : null;
      }
    };
  }

  Noseview.signalHunt = { createSignalHuntModel };
}(window));
