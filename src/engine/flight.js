(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview) throw new Error("Noseview namespace must load before flight.js");

  const DEFAULT_CAMERA = Object.freeze({
    x: 7.5,
    y: 10,
    z: 58,
    yaw: 0,
    pitch: -10 * Math.PI / 180
  });
  const SPEED_MODES = Object.freeze([
    Object.freeze({ name: "SLOW", move: 5, turn: 42 }),
    Object.freeze({ name: "NORMAL", move: 10, turn: 65 }),
    Object.freeze({ name: "FAST", move: 19, turn: 92 })
  ]);
  const CONTROL_NAMES = Object.freeze([
    "forward", "backward", "strafeLeft", "strafeRight",
    "turnLeft", "turnRight", "lookUp", "lookDown"
  ]);

  function copyCamera(camera) {
    return {
      x: camera.x,
      y: camera.y,
      z: camera.z,
      yaw: camera.yaw,
      pitch: camera.pitch
    };
  }

  function createFlightModel(options) {
    const settings = options || {};
    const initialCamera = copyCamera(settings.initialCamera || DEFAULT_CAMERA);
    const speedModes = settings.speedModes || SPEED_MODES;
    const cameraRadius = settings.cameraRadius === undefined ? 0.6 : settings.cameraRadius;
    const groundY = settings.groundY === undefined ? 0 : settings.groundY;
    const minimumAltitude = settings.minimumAltitude === undefined
      ? groundY + cameraRadius
      : settings.minimumAltitude;
    const maxCollisionStep = settings.maxCollisionStep === undefined ? 0.2 : settings.maxCollisionStep;
    if (!Number.isFinite(cameraRadius) || cameraRadius <= 0) {
      throw new RangeError("Camera radius must be a positive finite number");
    }
    if (!Number.isFinite(groundY)) {
      throw new TypeError("Ground altitude must be finite");
    }
    if (!Number.isFinite(minimumAltitude)) {
      throw new TypeError("Minimum altitude must be finite");
    }
    if (minimumAltitude < groundY + cameraRadius) {
      throw new RangeError("Minimum altitude cannot place the camera below the ground plane");
    }
    initialCamera.y = Math.max(initialCamera.y, minimumAltitude);
    let camera = copyCamera(initialCamera);
    let colliders = (settings.colliders || []).slice();
    let speedIndex = settings.speedIndex === undefined ? 1 : settings.speedIndex;
    const controls = {};
    let activeContactKeys = new Set();
    let impactSequence = 0;
    CONTROL_NAMES.forEach(name => { controls[name] = false; });

    function assertControl(action) {
      if (!Object.prototype.hasOwnProperty.call(controls, action)) {
        throw new RangeError(`Unknown flight control: ${action}`);
      }
    }

    function setControl(action, active) {
      assertControl(action);
      controls[action] = Boolean(active);
    }

    function clearControls() {
      CONTROL_NAMES.forEach(name => { controls[name] = false; });
    }

    function reset() {
      camera = copyCamera(initialCamera);
      activeContactKeys.clear();
    }

    function setInitialCamera(nextCamera) {
      if (!nextCamera || typeof nextCamera !== "object") {
        throw new TypeError("setInitialCamera requires a camera object");
      }
      const fields = ["x", "y", "z", "yaw", "pitch"];
      for (let index = 0; index < fields.length; index += 1) {
        const field = fields[index];
        if (!Number.isFinite(nextCamera[field])) {
          throw new TypeError(`setInitialCamera requires finite ${field}`);
        }
      }
      const clamped = copyCamera(nextCamera);
      clamped.y = Math.max(clamped.y, minimumAltitude);
      initialCamera.x = clamped.x;
      initialCamera.y = clamped.y;
      initialCamera.z = clamped.z;
      initialCamera.yaw = clamped.yaw;
      initialCamera.pitch = clamped.pitch;
      return copyCamera(initialCamera);
    }

    function setColliders(nextColliders) {
      colliders = nextColliders.slice();
      activeContactKeys.clear();
    }

    function resetCollisionIncidents() {
      activeContactKeys.clear();
      impactSequence = 0;
    }

    function cycleSpeed() {
      speedIndex = (speedIndex + 1) % speedModes.length;
      return { ...speedModes[speedIndex] };
    }

    function getForwardDirection() {
      const cosPitch = Math.cos(camera.pitch);
      return [
        Math.sin(camera.yaw) * cosPitch,
        Math.sin(camera.pitch),
        -Math.cos(camera.yaw) * cosPitch
      ];
    }

    function distanceToInterval(value, min, max) {
      if (value < min) return min - value;
      if (value > max) return value - max;
      return 0;
    }

    function getColliderId(collider, index) {
      return String(collider.partId || collider.id || collider.structureId || `collider-${index}`);
    }

    function createContact(surface, colliderId) {
      return { surface, colliderId, key: `${surface}:${colliderId === null ? "ground" : colliderId}` };
    }

    function moveCameraAlongAxis(axis, distance) {
      const start = camera[axis];
      const requestedBelowGround = axis === "y" && start + distance < minimumAltitude;
      let moveDistance = distance;
      if (requestedBelowGround) moveDistance = minimumAltitude - start;
      if (distance !== 0 && moveDistance === 0 && requestedBelowGround) {
        return { blocked: true, contacts: [createContact("GROUND", null)] };
      }
      if (distance === 0) return { blocked: false, contacts: [] };

      const target = start + moveDistance;
      const radiusSquared = cameraRadius * cameraRadius;
      let safeFraction = 1;
      let nearestCollisionFraction = Infinity;
      const blockingColliders = [];

      colliders.forEach((collider, index) => {
        let perpendicularDistanceSquared;
        let min;
        let max;

        if (axis === "x") {
          const dy = distanceToInterval(camera.y, collider.minY, collider.maxY);
          const dz = distanceToInterval(camera.z, collider.minZ, collider.maxZ);
          perpendicularDistanceSquared = dy * dy + dz * dz;
          min = collider.minX;
          max = collider.maxX;
        } else if (axis === "y") {
          const dx = distanceToInterval(camera.x, collider.minX, collider.maxX);
          const dz = distanceToInterval(camera.z, collider.minZ, collider.maxZ);
          perpendicularDistanceSquared = dx * dx + dz * dz;
          min = collider.minY;
          max = collider.maxY;
        } else {
          const dx = distanceToInterval(camera.x, collider.minX, collider.maxX);
          const dy = distanceToInterval(camera.y, collider.minY, collider.maxY);
          perpendicularDistanceSquared = dx * dx + dy * dy;
          min = collider.minZ;
          max = collider.maxZ;
        }

        if (perpendicularDistanceSquared >= radiusSquared) return;
        const padding = Math.sqrt(radiusSquared - perpendicularDistanceSquared);
        const collisionMin = min - padding;
        const collisionMax = max + padding;
        let collisionFraction = 1;

        if (moveDistance > 0 && start <= collisionMin && target > collisionMin) {
          collisionFraction = (collisionMin - start) / moveDistance;
        } else if (moveDistance < 0 && start >= collisionMax && target < collisionMax) {
          collisionFraction = (collisionMax - start) / moveDistance;
        }

        if (collisionFraction < 1 && collisionFraction < nearestCollisionFraction) {
          nearestCollisionFraction = collisionFraction;
          safeFraction = Math.max(0, collisionFraction - 0.000001);
          blockingColliders.length = 0;
          blockingColliders.push({ collider, index });
        } else if (collisionFraction < 1 && collisionFraction === nearestCollisionFraction) {
          blockingColliders.push({ collider, index });
        }
      });

      camera[axis] = start + moveDistance * safeFraction;
      if (axis === "y" && camera.y < minimumAltitude) camera.y = minimumAltitude;
      const contacts = blockingColliders.map(item => createContact("STRUCTURE", getColliderId(item.collider, item.index)));
      if (requestedBelowGround && distance < 0) contacts.push(createContact("GROUND", null));
      return {
        blocked: contacts.length > 0 || safeFraction < 1,
        contacts
      };
    }

    function moveCamera(displacementX, displacementY, displacementZ) {
      const distance = Math.hypot(displacementX, displacementY, displacementZ);
      const steps = Math.max(1, Math.ceil(distance / maxCollisionStep));
      const stepX = displacementX / steps;
      const stepY = displacementY / steps;
      const stepZ = displacementZ / steps;
      let blocked = false;
      const contacts = new Map();
      for (let index = 0; index < steps; index += 1) {
        [moveCameraAlongAxis("x", stepX), moveCameraAlongAxis("y", stepY), moveCameraAlongAxis("z", stepZ)].forEach(result => {
          blocked = result.blocked || blocked;
          result.contacts.forEach(contact => contacts.set(contact.key, contact));
        });
      }
      return { blocked, contacts: Array.from(contacts.values()) };
    }

    function update(deltaTime) {
      const mode = speedModes[speedIndex];
      const turnStep = mode.turn * Math.PI / 180 * deltaTime;
      const moveStep = mode.move * deltaTime;

      if (controls.turnLeft) camera.yaw -= turnStep;
      if (controls.turnRight) camera.yaw += turnStep;
      if (controls.lookUp) camera.pitch += turnStep * 0.8;
      if (controls.lookDown) camera.pitch -= turnStep * 0.8;

      const pitchLimit = 75 * Math.PI / 180;
      camera.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, camera.pitch));

      const forward = getForwardDirection();
      const rightX = Math.cos(camera.yaw);
      const rightZ = Math.sin(camera.yaw);
      let moveForward = Number(controls.forward) - Number(controls.backward);
      let moveRight = Number(controls.strafeRight) - Number(controls.strafeLeft);
      const magnitude = Math.hypot(moveForward, moveRight);
      if (magnitude > 1) {
        moveForward /= magnitude;
        moveRight /= magnitude;
      }
      const movement = moveCamera(
        (forward[0] * moveForward + rightX * moveRight) * moveStep,
        forward[1] * moveForward * moveStep,
        (forward[2] * moveForward + rightZ * moveRight) * moveStep
      );
      const contacts = movement.contacts;
      const incidents = contacts
        .filter(contact => !activeContactKeys.has(contact.key))
        .map(contact => ({
          type: "collision",
          surface: contact.surface,
          colliderId: contact.colliderId,
          impactSequence: ++impactSequence
        }));
      activeContactKeys = new Set(contacts.map(contact => contact.key));
      return {
        blocked: movement.blocked,
        incidents,
        incident: incidents.length === 1 ? incidents[0] : null
      };
    }

    function getSnapshot() {
      return {
        camera: copyCamera(camera),
        speed: { ...speedModes[speedIndex] },
        minimumAltitude
      };
    }

    return {
      setControl,
      clearControls,
      reset,
      setInitialCamera,
      setColliders,
      resetCollisionIncidents,
      cycleSpeed,
      update,
      getSnapshot
    };
  }

  Noseview.flight = {
    DEFAULT_CAMERA,
    SPEED_MODES,
    CONTROL_NAMES,
    createFlightModel
  };
}(window));
