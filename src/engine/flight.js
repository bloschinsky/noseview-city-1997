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

    function moveCameraAlongAxis(axis, distance) {
      const start = camera[axis];
      const requestedBelowGround = axis === "y" && start + distance < minimumAltitude;
      let moveDistance = distance;
      if (requestedBelowGround) moveDistance = minimumAltitude - start;
      if (distance !== 0 && moveDistance === 0 && requestedBelowGround) return true;
      if (distance === 0) return false;

      const target = start + moveDistance;
      const radiusSquared = cameraRadius * cameraRadius;
      let safeFraction = 1;

      colliders.forEach(collider => {
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

        if (collisionFraction < safeFraction) {
          safeFraction = Math.max(0, collisionFraction - 0.000001);
        }
      });

      camera[axis] = start + moveDistance * safeFraction;
      if (axis === "y" && camera.y < minimumAltitude) camera.y = minimumAltitude;
      return (requestedBelowGround && distance < 0) || safeFraction < 1;
    }

    function moveCamera(displacementX, displacementY, displacementZ) {
      const distance = Math.hypot(displacementX, displacementY, displacementZ);
      const steps = Math.max(1, Math.ceil(distance / maxCollisionStep));
      const stepX = displacementX / steps;
      const stepY = displacementY / steps;
      const stepZ = displacementZ / steps;
      let blocked = false;
      for (let index = 0; index < steps; index += 1) {
        blocked = moveCameraAlongAxis("x", stepX) || blocked;
        blocked = moveCameraAlongAxis("y", stepY) || blocked;
        blocked = moveCameraAlongAxis("z", stepZ) || blocked;
      }
      return blocked;
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
      const blocked = moveCamera(
        (forward[0] * moveForward + rightX * moveRight) * moveStep,
        forward[1] * moveForward * moveStep,
        (forward[2] * moveForward + rightZ * moveRight) * moveStep
      );
      return { blocked };
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
