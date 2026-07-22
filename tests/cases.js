(function (root) {
  "use strict";

  const Noseview = root.Noseview;

  function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
  }

  function assertNear(actual, expected, epsilon, message) {
    assert(Math.abs(actual - expected) <= epsilon, `${message}: expected ${expected}, received ${actual}`);
  }

  function sphereDistanceToCollider(camera, collider) {
    function intervalDistance(value, min, max) {
      if (value < min) return min - value;
      if (value > max) return value - max;
      return 0;
    }
    return Math.hypot(
      intervalDistance(camera.x, collider.minX, collider.maxX),
      intervalDistance(camera.y, collider.minY, collider.maxY),
      intervalDistance(camera.z, collider.minZ, collider.maxZ)
    );
  }

  function getCases() {
    return [
      {
        name: "seeded RNG keeps its pinned sequence",
        run() {
          const random = Noseview.city.createRng(19810001);
          const expected = [
            0.6500369301065803,
            0.9571536283474416,
            0.37929299799725413,
            0.9135593522805721,
            0.6169227920472622
          ];
          expected.forEach(value => assertNear(random(), value, Number.EPSILON, "RNG output changed"));
        }
      },
      {
        name: "same seed produces identical city data",
        run() {
          const first = Noseview.city.generateCity(19810001);
          const second = Noseview.city.generateCity(19810001);
          assert(JSON.stringify(first) === JSON.stringify(second), "City output is not deterministic");
        }
      },
      {
        name: "building metadata and colliders stay synchronized",
        run() {
          const city = Noseview.city.generateCity(19810001);
          assert(city.buildings.length === 26, "Expected 26 buildings");
          city.buildings.forEach(building => {
            assert(city.colliders.some(collider => collider.buildingId === building.id && collider.part === "base"), `Missing base collider for ${building.id}`);
            assert(Boolean(building.tier) === city.colliders.some(collider => collider.buildingId === building.id && collider.part === "tier"), `Tier collider mismatch for ${building.id}`);
          });
        }
      },
      {
        name: "wall collision stops the camera radius before an AABB",
        run() {
          const collider = { minX: -2, maxX: 2, minY: 0, maxY: 3, minZ: 0, maxZ: 1 };
          const flight = Noseview.flight.createFlightModel({
            initialCamera: { x: 0, y: 1, z: 3, yaw: 0, pitch: 0 },
            colliders: [collider]
          });
          flight.setControl("forward", true);
          flight.update(1);
          assertNear(flight.getSnapshot().camera.z, 1.6, 0.001, "Wall contact position changed");
        }
      },
      {
        name: "diagonal corner movement never penetrates a collider",
        run() {
          const collider = { minX: 0, maxX: 2, minY: 0, maxY: 3, minZ: 0, maxZ: 2 };
          const flight = Noseview.flight.createFlightModel({
            initialCamera: { x: -1, y: 1, z: 3, yaw: 0, pitch: 0 },
            colliders: [collider]
          });
          flight.setControl("forward", true);
          flight.setControl("strafeRight", true);
          flight.update(0.5);
          assert(sphereDistanceToCollider(flight.getSnapshot().camera, collider) >= 0.599, "Camera penetrated the corner");
        }
      },
      {
        name: "rooftop and tier collisions stop downward movement",
        run() {
          [
            { minX: -10, maxX: 10, minY: 0, maxY: 2, minZ: -10, maxZ: 10 },
            { minX: -10, maxX: 10, minY: 3, maxY: 5, minZ: -10, maxZ: 10 }
          ].forEach((collider, index) => {
            const flight = Noseview.flight.createFlightModel({
              initialCamera: { x: 0, y: collider.maxY + 2, z: 0, yaw: 0, pitch: -75 * Math.PI / 180 },
              colliders: [collider]
            });
            flight.setControl("forward", true);
            flight.update(1);
            assertNear(flight.getSnapshot().camera.y, collider.maxY + 0.6, 0.002, index === 0 ? "Roof collision changed" : "Tier collision changed");
          });
        }
      },
      {
        name: "pitch remains clamped to plus or minus 75 degrees",
        run() {
          const flight = Noseview.flight.createFlightModel();
          flight.setControl("lookUp", true);
          flight.update(10);
          assertNear(flight.getSnapshot().camera.pitch, 75 * Math.PI / 180, 0.000001, "Upper pitch clamp changed");
          flight.setControl("lookUp", false);
          flight.setControl("lookDown", true);
          flight.update(10);
          assertNear(flight.getSnapshot().camera.pitch, -75 * Math.PI / 180, 0.000001, "Lower pitch clamp changed");
        }
      },
      {
        name: "diagonal movement is normalized",
        run() {
          const straight = Noseview.flight.createFlightModel({ initialCamera: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 } });
          straight.setControl("forward", true);
          straight.update(0.1);
          const diagonal = Noseview.flight.createFlightModel({ initialCamera: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 } });
          diagonal.setControl("forward", true);
          diagonal.setControl("strafeRight", true);
          diagonal.update(0.1);
          const straightCamera = straight.getSnapshot().camera;
          const diagonalCamera = diagonal.getSnapshot().camera;
          assertNear(Math.hypot(straightCamera.x, straightCamera.y, straightCamera.z), Math.hypot(diagonalCamera.x, diagonalCamera.y, diagonalCamera.z), 0.000001, "Diagonal speed changed");
        }
      },
      {
        name: "heading normalization and HUD formatting stay stable",
        run() {
          assert(Noseview.ui.formatHeading(0) === "000", "Zero heading changed");
          assert(Noseview.ui.formatHeading(9.6) === "010", "Heading rounding changed");
          assert(Noseview.ui.formatHeading(-1) === "359", "Negative heading normalization changed");
          assert(Noseview.ui.formatHeading(361) === "001", "Positive heading normalization changed");
        }
      }
    ];
  }

  Noseview.tests = { getCases };
}(window));
