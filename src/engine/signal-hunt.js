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

  function mixSeed(seed) {
    let mixed = seed >>> 0;
    mixed ^= mixed >>> 16;
    mixed = Math.imul(mixed, 0x7feb352d);
    mixed ^= mixed >>> 15;
    mixed = Math.imul(mixed, 0x846ca68b);
    mixed ^= mixed >>> 16;
    return mixed >>> 0;
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

  function pointIntersectsCollider(point, collider, clearance) {
    return point.x >= collider.minX - clearance && point.x <= collider.maxX + clearance &&
      point.y >= collider.minY - clearance && point.y <= collider.maxY + clearance &&
      point.z >= collider.minZ - clearance && point.z <= collider.maxZ + clearance;
  }

  function hasClearScanApproach(anchor, colliders, scanMinDistance, scanMaxDistance) {
    if (scanMaxDistance < scanMinDistance) return false;
    const approachDistance = Math.min(scanMaxDistance, Math.max(scanMinDistance, 10));
    for (let step = 0; step < 8; step += 1) {
      const angle = step / 8 * Math.PI * 2;
      const camera = {
        x: anchor.x + Math.cos(angle) * approachDistance,
        y: anchor.y,
        z: anchor.z + Math.sin(angle) * approachDistance
      };
      if (!colliders.some(collider => pointIntersectsCollider(camera, collider, 0.6))) return true;
    }
    return false;
  }

  function isCompletableAnchor(structure, city, missionStart, minimumSpawnDistance, scanMinDistance, scanMaxDistance) {
    if (!structure || !structure.signalAnchor) return false;
    const anchor = structure.signalAnchor;
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y) || !Number.isFinite(anchor.z)) return false;
    if (Math.hypot(anchor.x - missionStart.x, anchor.z - missionStart.z) < minimumSpawnDistance) return false;
    const colliders = city.colliders || [];
    if (colliders.some(collider => pointIntersectsCollider(anchor, collider, 0.6))) return false;
    return hasClearScanApproach(anchor, colliders, scanMinDistance, scanMaxDistance);
  }

  function pickNTargets(city, count, seed, minimumSpawnDistance, scanMinDistance, scanMaxDistance) {
    const missionStart = Noseview.city.getMissionStart(city);
    const candidates = city.structures.filter(structure =>
      isCompletableAnchor(
        structure,
        city,
        missionStart,
        minimumSpawnDistance,
        scanMinDistance,
        scanMaxDistance
      )
    );
    const shuffled = shuffleDeterministic(candidates, seed ^ 0x6b1f23a9);
    const picked = shuffled.slice(0, Math.min(count, shuffled.length));
    return picked.map((structure, index) => ({
      id: `signal-${String(structure.id || index)}`,
      structureId: structure.id || null,
      hostStructure: {
        id: structure.id || null,
        kind: structure.kind || null,
        type: structure.type || null
      },
      x: structure.signalAnchor.x,
      y: structure.signalAnchor.y,
      z: structure.signalAnchor.z,
      status: "PENDING"
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
    const TARGET_COUNT = Number.isInteger(settings.targetCount) && settings.targetCount > 0 ? settings.targetCount : null;
    const MIN_TARGETS = 3;
    const MAX_TARGETS = 5;
    const MINIMUM_SPAWN_DISTANCE = Number.isFinite(settings.minimumSpawnDistance) && settings.minimumSpawnDistance >= 0
      ? settings.minimumSpawnDistance
      : 14;
    const TIMER_SECONDS = Number.isFinite(settings.timerSeconds) && settings.timerSeconds > 0 ? settings.timerSeconds : 120;
    const SCAN_CONE_DEGREES = Number.isFinite(settings.scanConeDegrees) && settings.scanConeDegrees > 0 ? settings.scanConeDegrees : 10;
    const SCAN_MIN_DISTANCE = Number.isFinite(settings.scanMinDistance) && settings.scanMinDistance >= 0 ? settings.scanMinDistance : 2.5;
    const SCAN_MAX_DISTANCE = Number.isFinite(settings.scanMaxDistance) && settings.scanMaxDistance > 0 ? settings.scanMaxDistance : 40;
    const MAX_DT = 0.25;
    const LOCK_DURATION_SECONDS = 2;
    const FEEDBACK_DURATION_SECONDS = 1.25;

    let mode = "IDLE"; // IDLE | ACTIVE | COMPLETE | FAILED | ABORTED
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
    let feedback = null;
    let feedbackSeconds = 0;
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

    function clearFeedback() {
      feedback = null;
      feedbackSeconds = 0;
    }

    function resolveTargetCount(seed) {
      if (TARGET_COUNT !== null) return TARGET_COUNT;
      return MIN_TARGETS + mixSeed(seed ^ 0x2d9e4b17) % (MAX_TARGETS - MIN_TARGETS + 1);
    }

    function resetTargetStatuses() {
      targets.forEach((target, index) => {
        target.status = index === 0 ? "ACTIVE" : "PENDING";
      });
    }

    function buildTargets(city, seed) {
      return pickNTargets(
        city,
        resolveTargetCount(seed),
        (city.seed ^ seed) >>> 0,
        MINIMUM_SPAWN_DISTANCE,
        SCAN_MIN_DISTANCE,
        SCAN_MAX_DISTANCE
      );
    }

    function copyTarget(target) {
      return {
        id: target.id,
        structureId: target.structureId,
        hostStructure: { ...target.hostStructure },
        position: { x: target.x, y: target.y, z: target.z },
        status: target.status
      };
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
        guidance: { ...lastGuidance },
        feedback
      };
    }

    function isActive() { return mode === "ACTIVE"; }

    function start(city, seed) {
      if (!city || !Array.isArray(city.structures)) throw new TypeError("Signal Hunt start requires a city");
      const normalized = (seed === undefined || seed === null) ? ((city.seed ^ 0x5f3759df) >>> 0) : (seed >>> 0);
      missionCity = city;
      missionSeed = normalized;
      targets = buildTargets(city, normalized);
      totalTargets = targets.length;
      acquiredTargets = 0;
      activeIndex = totalTargets > 0 ? 0 : -1;
      timeRemaining = totalTargets > 0 ? TIMER_SECONDS : null;
      elapsedSeconds = 0;
      completion = null;
      resetTelemetry();
      clearFeedback();
      if (totalTargets === resolveTargetCount(normalized)) {
        resetTargetStatuses();
        mode = "ACTIVE";
      } else {
        mode = "FAILED";
      }
      events.push({ type: "mission-started", missionSeed, totalTargets });
      return getSnapshot();
    }

    function reset() {
      mode = "IDLE";
      missionSeed = null;
      totalTargets = 0;
      acquiredTargets = 0;
      activeIndex = -1;
      timeRemaining = null;
      elapsedSeconds = 0;
      completion = null;
      targets = [];
      missionCity = null;
      resetTelemetry();
      clearFeedback();
      events.push({ type: "mission-reset" });
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
      clearFeedback();
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
      clearFeedback();
      resetTargetStatuses();
      events.push({ type: "mission-restarted" });
      return getSnapshot();
    }

    function replay(nextCity, seed) {
      if (mode !== "COMPLETE" && mode !== "FAILED" && mode !== "ABORTED") return getSnapshot();
      if (nextCity !== undefined) {
        if (!nextCity || !Array.isArray(nextCity.structures)) throw new TypeError("Signal Hunt replay requires a city");
        missionCity = nextCity;
        missionSeed = (seed === undefined || seed === null)
          ? ((nextCity.seed ^ 0x5f3759df) >>> 0)
          : (seed >>> 0);
      }
      if (!missionCity) return getSnapshot();
      targets = buildTargets(missionCity, missionSeed);
      totalTargets = targets.length;
      acquiredTargets = 0;
      activeIndex = totalTargets > 0 ? 0 : -1;
      timeRemaining = totalTargets > 0 ? TIMER_SECONDS : null;
      elapsedSeconds = 0;
      completion = null;
      resetTelemetry();
      clearFeedback();
      if (totalTargets === resolveTargetCount(missionSeed)) {
        resetTargetStatuses();
        mode = "ACTIVE";
      } else {
        mode = "FAILED";
      }
      events.push({ type: "mission-restarted" });
      return getSnapshot();
    }

    function update(camera, dt) {
      if (!isActive()) return getSnapshot();
      const delta = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, MAX_DT));
      elapsedSeconds += delta;
      timeRemaining = Math.max(0, (timeRemaining || 0) - delta);
      if (feedbackSeconds > 0) {
        feedbackSeconds = Math.max(0, feedbackSeconds - delta);
        if (feedbackSeconds === 0) feedback = null;
      }
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
      active.status = "ACQUIRED";
      acquiredTargets += 1;
      events.push({ type: "target-acquired", targetId: String(active.id), acquiredTargets, totalTargets });
      if (acquiredTargets >= totalTargets) {
        mode = "COMPLETE";
        activeIndex = -1;
        timeRemaining = Math.max(0, timeRemaining || 0);
        completion = {
          acquiredTargets,
          totalTargets,
          elapsedSeconds
        };
        resetTelemetry();
        clearFeedback();
        events.push({ type: "mission-complete", ...completion });
      } else {
        activeIndex += 1;
        targets[activeIndex].status = "ACTIVE";
        feedback = "SIGNAL ACQUIRED";
        feedbackSeconds = FEEDBACK_DURATION_SECONDS;
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
      reset,
      abort,
      restartAttempt,
      replay,
      update,
      getSnapshot,
      drainEvents,
      isActive,
      destroy,
      getTargets() {
        return targets.map(copyTarget);
      },
      getActiveTarget() {
        if (mode !== "ACTIVE") return null;
        const target = targets[activeIndex];
        return target ? {
          id: target.id,
          x: target.x,
          y: target.y,
          z: target.z,
          status: target.status
        } : null;
      }
    };
  }

  Noseview.signalHunt = { createSignalHuntModel };
}(window));
