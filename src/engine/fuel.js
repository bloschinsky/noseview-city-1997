(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview || !Noseview.city) {
    throw new Error("Noseview city must load before fuel.js");
  }

  const DEFAULTS = Object.freeze({
    maximum: 100,
    drainPerSecond: 1,
    lowThreshold: 25,
    criticalThreshold: 10,
    fuelPerPickup: 35,
    activePickupCount: 3,
    pickupRadius: 2.25,
    replacementDelaySeconds: 5,
    beamHeight: 80,
    maximumDeltaSeconds: 0.25,
    navigationRadius: 90,
    cameraRadius: 0.6,
    minimumSpawnDistance: 8,
    minimumPickupSpacing: 8
  });
  const RUN_SEED_SALT = 0x4655454c;

  function finitePositive(value, fallback, label) {
    const resolved = value === undefined ? fallback : value;
    if (!Number.isFinite(resolved) || resolved <= 0) {
      throw new RangeError(`${label} must be a positive finite number`);
    }
    return resolved;
  }

  function finiteNonNegative(value, fallback, label) {
    const resolved = value === undefined ? fallback : value;
    if (!Number.isFinite(resolved) || resolved < 0) {
      throw new RangeError(`${label} must be a non-negative finite number`);
    }
    return resolved;
  }

  function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return dx * dx + dy * dy + dz * dz;
  }

  function horizontalDistanceSquared(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return dx * dx + dz * dz;
  }

  function pointClearOfCollider(position, collider, margin) {
    return position.x < collider.minX - margin ||
      position.x > collider.maxX + margin ||
      position.z < collider.minZ - margin ||
      position.z > collider.maxZ + margin;
  }

  function isClearOfExclusions(position, exclusions, radius) {
    const limitSquared = radius * radius;
    return !exclusions.some(exclusion => exclusion && horizontalDistanceSquared(position, exclusion) < limitSquared);
  }

  function createFuelModel(options) {
    const settings = options || {};
    const config = {
      maximum: finitePositive(settings.maximum, DEFAULTS.maximum, "Maximum fuel"),
      drainPerSecond: finitePositive(settings.drainPerSecond, DEFAULTS.drainPerSecond, "Fuel drain"),
      lowThreshold: finitePositive(settings.lowThreshold, DEFAULTS.lowThreshold, "Low-fuel threshold"),
      criticalThreshold: finitePositive(settings.criticalThreshold, DEFAULTS.criticalThreshold, "Critical-fuel threshold"),
      fuelPerPickup: finitePositive(settings.fuelPerPickup, DEFAULTS.fuelPerPickup, "Fuel per pickup"),
      activePickupCount: finitePositive(settings.activePickupCount, DEFAULTS.activePickupCount, "Active pickup count"),
      pickupRadius: finitePositive(settings.pickupRadius, DEFAULTS.pickupRadius, "Pickup radius"),
      replacementDelaySeconds: finiteNonNegative(
        settings.replacementDelaySeconds,
        DEFAULTS.replacementDelaySeconds,
        "Replacement delay"
      ),
      beamHeight: finitePositive(settings.beamHeight, DEFAULTS.beamHeight, "Beam height"),
      maximumDeltaSeconds: finitePositive(
        settings.maximumDeltaSeconds,
        DEFAULTS.maximumDeltaSeconds,
        "Maximum fuel delta"
      ),
      navigationRadius: finitePositive(settings.navigationRadius, DEFAULTS.navigationRadius, "Navigation radius"),
      cameraRadius: finitePositive(settings.cameraRadius, DEFAULTS.cameraRadius, "Camera radius"),
      minimumSpawnDistance: finiteNonNegative(
        settings.minimumSpawnDistance,
        DEFAULTS.minimumSpawnDistance,
        "Minimum spawn distance"
      ),
      minimumPickupSpacing: finitePositive(
        settings.minimumPickupSpacing,
        DEFAULTS.minimumPickupSpacing,
        "Minimum pickup spacing"
      )
    };
    if (!Number.isInteger(config.activePickupCount)) {
      throw new RangeError("Active pickup count must be an integer");
    }
    if (config.criticalThreshold > config.lowThreshold || config.lowThreshold > config.maximum) {
      throw new RangeError("Fuel thresholds must not exceed maximum fuel");
    }

    let enabled = Boolean(settings.enabled);
    let current = config.maximum;
    let depleted = false;
    let gameOver = false;
    let destroyed = false;
    let city = null;
    let runSeed = 0;
    let pickupSequence = 0;
    let candidateCursor = 0;
    let candidates = [];
    let pickups = [];
    let pendingRespawns = [];
    let exclusions = [];
    let lastWarning = "";
    const events = [];

    function warningText() {
      if (!enabled || gameOver) return "";
      if (depleted) return "FUEL EXHAUSTED";
      if (current <= config.criticalThreshold) return "FUEL CRITICAL";
      if (current <= config.lowThreshold) return "LOW FUEL";
      return "";
    }

    function getSnapshot() {
      return {
        enabled,
        current,
        maximum: config.maximum,
        low: enabled && current <= config.lowThreshold,
        critical: enabled && current <= config.criticalThreshold,
        depleted,
        warningText: warningText(),
        activePickupCount: pickups.length,
        pendingRespawnCount: pendingRespawns.length,
        gameOver
      };
    }

    function getPickups() {
      return pickups.map(pickup => ({
        id: pickup.id,
        placementType: pickup.placementType,
        position: { ...pickup.position },
        hostStructureId: pickup.hostStructureId,
        hostPartId: pickup.hostPartId,
        collected: false,
        beamHeight: config.beamHeight
      }));
    }

    function makeGroundCandidates(random, spawn) {
      const result = [];
      const maximumRadius = config.navigationRadius - config.pickupRadius - 1;
      for (let attempt = 0; attempt < 320 && result.length < 72; attempt += 1) {
        const angle = random() * Math.PI * 2;
        const radius = Math.sqrt(random()) * maximumRadius;
        const position = {
          x: Math.cos(angle) * radius,
          y: config.cameraRadius + 0.05,
          z: Math.sin(angle) * radius
        };
        if (spawn && distanceSquared(position, spawn) < config.minimumSpawnDistance * config.minimumSpawnDistance) continue;
        if (!city.colliders.every(collider => pointClearOfCollider(position, collider, config.cameraRadius + 0.45))) continue;
        if (!isClearOfExclusions(position, exclusions, config.pickupRadius + 1)) continue;
        result.push({
          key: `ground-${result.length}`,
          placementType: "GROUND",
          position,
          hostStructureId: null,
          hostPartId: null
        });
      }
      return result;
    }

    function makeRooftopCandidates(random, spawn) {
      const result = [];
      city.structures.forEach(structure => {
        const solidParts = (structure.parts || []).filter(part => part.solid && part.bounds);
        solidParts.forEach(part => {
          const bounds = part.bounds;
          const width = bounds.maxX - bounds.minX;
          const depth = bounds.maxZ - bounds.minZ;
          const margin = config.cameraRadius + 0.7;
          if (width < margin * 2 + 1.5 || depth < margin * 2 + 1.5) return;
          const covered = city.colliders.some(collider =>
            collider.partId !== part.id &&
            collider.maxY > bounds.maxY + 0.05 &&
            collider.minX < bounds.maxX - margin &&
            collider.maxX > bounds.minX + margin &&
            collider.minZ < bounds.maxZ - margin &&
            collider.maxZ > bounds.minZ + margin
          );
          if (covered) return;
          const offsetX = (random() - 0.5) * Math.max(0, width - margin * 2);
          const offsetZ = (random() - 0.5) * Math.max(0, depth - margin * 2);
          const position = {
            x: (bounds.minX + bounds.maxX) / 2 + offsetX,
            y: bounds.maxY + config.cameraRadius + 0.05,
            z: (bounds.minZ + bounds.maxZ) / 2 + offsetZ
          };
          if (Math.hypot(position.x, position.z) >= config.navigationRadius - 1) return;
          if (spawn && distanceSquared(position, spawn) < config.minimumSpawnDistance * config.minimumSpawnDistance) return;
          if (!isClearOfExclusions(position, exclusions, config.pickupRadius + 1)) return;
          result.push({
            key: `roof-${part.id}`,
            placementType: structure.type === "helipad-complex" && part.role === "platform"
              ? "PLATFORM"
              : "ROOFTOP",
            position,
            hostStructureId: structure.id,
            hostPartId: part.id
          });
        });
      });
      return result;
    }

    function shuffle(items, random) {
      for (let index = items.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
      }
      return items;
    }

    function buildCandidates(spawn) {
      const random = Noseview.city.createRng((city.seed ^ runSeed ^ RUN_SEED_SALT) >>> 0);
      const ground = makeGroundCandidates(random, spawn);
      const rooftops = makeRooftopCandidates(random, spawn);
      shuffle(ground, random);
      shuffle(rooftops, random);
      const interleaved = [];
      while (ground.length || rooftops.length) {
        if (ground.length) interleaved.push(ground.pop());
        if (rooftops.length) interleaved.push(rooftops.pop());
      }
      candidates = interleaved;
      candidateCursor = 0;
    }

    function candidateIsAvailable(candidate, avoidPosition) {
      const spacingSquared = config.minimumPickupSpacing * config.minimumPickupSpacing;
      if (pickups.some(pickup => horizontalDistanceSquared(pickup.position, candidate.position) < spacingSquared)) return false;
      if (avoidPosition && distanceSquared(avoidPosition, candidate.position) < config.pickupRadius * config.pickupRadius) return false;
      return isClearOfExclusions(candidate.position, exclusions, config.pickupRadius + 1);
    }

    function spawnPickup(avoidPosition) {
      if (candidates.length === 0) return null;
      for (let checked = 0; checked < candidates.length; checked += 1) {
        const candidate = candidates[candidateCursor % candidates.length];
        candidateCursor += 1;
        if (!candidateIsAvailable(candidate, avoidPosition)) continue;
        const pickup = {
          id: `fuel-${runSeed >>> 0}-${pickupSequence}`,
          placementType: candidate.placementType,
          position: { ...candidate.position },
          hostStructureId: candidate.hostStructureId,
          hostPartId: candidate.hostPartId
        };
        pickupSequence += 1;
        pickups.push(pickup);
        return pickup;
      }
      return null;
    }

    function resetRun(nextCity, nextRunSeed, nextExclusions, spawn) {
      if (destroyed) return getSnapshot();
      if (nextCity !== undefined && nextCity !== null) city = nextCity;
      if (!city || !Array.isArray(city.colliders) || !Array.isArray(city.structures)) {
        throw new TypeError("Fuel reset requires generated city metadata");
      }
      runSeed = Number.isFinite(nextRunSeed) ? nextRunSeed >>> 0 : (city.seed ^ RUN_SEED_SALT) >>> 0;
      exclusions = Array.isArray(nextExclusions)
        ? nextExclusions.filter(Boolean).map(position => ({ x: position.x, y: position.y, z: position.z }))
        : [];
      current = config.maximum;
      depleted = false;
      gameOver = false;
      pickupSequence = 0;
      pickups = [];
      pendingRespawns = [];
      lastWarning = "";
      buildCandidates(spawn || null);
      if (enabled) {
        for (let index = 0; index < config.activePickupCount; index += 1) spawnPickup(spawn || null);
      }
      events.push({ type: "fuel-run-reset", runSeed, activePickupCount: pickups.length });
      return getSnapshot();
    }

    function setEnabled(nextEnabled, nextCity, nextRunSeed, nextExclusions, spawn) {
      if (destroyed) return getSnapshot();
      const next = Boolean(nextEnabled);
      if (enabled === next) return getSnapshot();
      enabled = next;
      if (enabled) {
        resetRun(nextCity, nextRunSeed, nextExclusions, spawn);
        events.push({ type: "fuel-enabled" });
      } else {
        current = config.maximum;
        depleted = false;
        gameOver = false;
        pickups = [];
        pendingRespawns = [];
        candidates = [];
        exclusions = [];
        lastWarning = "";
        events.push({ type: "fuel-disabled" });
      }
      return getSnapshot();
    }

    function updateWarningEvent() {
      const nextWarning = warningText();
      if (nextWarning !== lastWarning) {
        if (nextWarning) events.push({ type: "fuel-warning", warning: nextWarning, current });
        lastWarning = nextWarning;
      }
    }

    function collectNearby(camera) {
      if (!camera) return false;
      const radiusSquared = config.pickupRadius * config.pickupRadius;
      const index = pickups.findIndex(pickup => distanceSquared(camera, pickup.position) <= radiusSquared);
      if (index < 0) return false;
      const pickup = pickups.splice(index, 1)[0];
      const before = current;
      current = Math.min(config.maximum, current + config.fuelPerPickup);
      pendingRespawns.push({ remainingSeconds: config.replacementDelaySeconds, avoidPosition: { ...camera } });
      events.push({
        type: "fuel-collected",
        pickupId: pickup.id,
        amount: current - before,
        current,
        maximum: config.maximum
      });
      return true;
    }

    function update(deltaSeconds, camera, options) {
      const updateOptions = options || {};
      if (destroyed || !enabled || depleted || gameOver || updateOptions.paused) return getSnapshot();
      const delta = Math.min(config.maximumDeltaSeconds, Math.max(0, Number(deltaSeconds) || 0));
      collectNearby(camera);
      current = Math.max(0, current - config.drainPerSecond * delta);
      pendingRespawns.forEach(respawn => { respawn.remainingSeconds -= delta; });
      const due = pendingRespawns.filter(respawn => respawn.remainingSeconds <= 0);
      pendingRespawns = pendingRespawns.filter(respawn => respawn.remainingSeconds > 0);
      due.forEach(respawn => {
        const replacement = spawnPickup(respawn.avoidPosition || camera);
        if (!replacement) {
          respawn.remainingSeconds = config.maximumDeltaSeconds;
          pendingRespawns.push(respawn);
        }
      });
      updateWarningEvent();
      if (current === 0 && !depleted) {
        depleted = true;
        lastWarning = "FUEL EXHAUSTED";
        events.push({ type: "fuel-empty", reason: "FUEL EXHAUSTED" });
      }
      return getSnapshot();
    }

    function confirmGameOver() {
      if (destroyed || !enabled || !depleted || gameOver) return getSnapshot();
      gameOver = true;
      events.push({ type: "game-over", reason: "FUEL EXHAUSTED" });
      return getSnapshot();
    }

    function drainEvents() {
      const drained = events.slice();
      events.length = 0;
      return drained;
    }

    function destroy() {
      destroyed = true;
      pickups = [];
      pendingRespawns = [];
      candidates = [];
      exclusions = [];
      events.length = 0;
    }

    return {
      getSnapshot,
      getPickups,
      setEnabled,
      resetRun,
      update,
      confirmGameOver,
      drainEvents,
      destroy
    };
  }

  Noseview.fuel = {
    DEFAULTS,
    createFuelModel
  };
}(window));
