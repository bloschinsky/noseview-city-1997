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
        name: "city keeps 26 structures and all landmark types",
        run() {
          const city = Noseview.city.generateCity(19810001);
          assert(city.structures.length === 26, "Expected 26 structures");
          assert(city.buildings.length === 23, "Expected 23 ordinary buildings");
          assert(city.landmarks.length === 3, "Expected three landmarks");
          assert(
            JSON.stringify(city.landmarks.map(landmark => landmark.type).sort()) ===
              JSON.stringify(Noseview.city.LANDMARK_TYPES.slice().sort()),
            "Every city must contain each landmark type"
          );
          assert(
            new Set(city.structures.map(structure => structure.id)).size === city.structures.length,
            "Structure IDs are not unique"
          );
          assert(
            new Set(city.landmarks.map(landmark => `${landmark.lot.col},${landmark.lot.row}`)).size === 3,
            "Landmarks do not use unique lots"
          );
        }
      },
      {
        name: "default seed pins landmark types and positions",
        run() {
          const city = Noseview.city.generateCity(19810001);
          const actual = city.landmarks.map(landmark => ({
            type: landmark.type,
            col: landmark.lot.col,
            row: landmark.lot.row
          }));
          const expected = [
            { type: "helipad-complex", col: -2, row: 2 },
            { type: "needle-tower", col: 1, row: -1 },
            { type: "telecom-tower", col: -3, row: -2 }
          ];
          assert(JSON.stringify(actual) === JSON.stringify(expected), "Pinned landmark layout changed");
        }
      },
      {
        name: "solid structure parts keep geometry and colliders synchronized",
        run() {
          const city = Noseview.city.generateCity(19810001);
          let buildingSolidParts = 0;
          let landmarkSolidParts = 0;
          let buildingLineVertices = 0;
          let landmarkLineVertices = 0;
          city.structures.forEach(structure => {
            const solidParts = structure.parts.filter(part => part.solid);
            const highestSolidY = solidParts.reduce((maximum, part) => Math.max(maximum, part.bounds.maxY), 0);
            assert(structure.signalAnchor.y > highestSolidY, `Signal anchor is not clear of ${structure.id}`);
            solidParts.forEach(part => {
              const collider = city.colliders.find(candidate => candidate.partId === part.id);
              assert(Boolean(collider), `Missing collider for ${part.id}`);
              ["minX", "maxX", "minY", "maxY", "minZ", "maxZ"].forEach(name => {
                assertNear(collider[name], part.bounds[name], Number.EPSILON, `${part.id} ${name} mismatch`);
              });
              assert(part.geometry.faceCount === 36, `Face geometry mismatch for ${part.id}`);
              assert(part.geometry.edgeCount === 24, `Edge geometry mismatch for ${part.id}`);
            });
            const decorationVertices = structure.parts
              .filter(part => !part.solid)
              .reduce((total, part) => total + part.geometry.lineCount, 0);
            if (structure.kind === "landmark") {
              landmarkSolidParts += solidParts.length;
              landmarkLineVertices += decorationVertices;
            } else {
              buildingSolidParts += solidParts.length;
              buildingLineVertices += decorationVertices;
            }
          });
          assert(city.geometry.faces.length / 3 === buildingSolidParts * 36, "Building face buffer is out of sync");
          assert(city.geometry.edges.length / 3 === buildingSolidParts * 24, "Building edge buffer is out of sync");
          assert(city.geometry.landmarkFaces.length / 3 === landmarkSolidParts * 36, "Landmark face buffer is out of sync");
          assert(city.geometry.landmarkEdges.length / 3 === landmarkSolidParts * 24, "Landmark edge buffer is out of sync");
          assert(city.geometry.antennas.length / 3 === buildingLineVertices, "Building accent buffer is out of sync");
          assert(city.geometry.landmarkAccents.length / 3 === landmarkLineVertices, "Landmark accent buffer is out of sync");
        }
      },
      {
        name: "landmark colliders stay outside the initial spawn corridor",
        run() {
          const corridor = Noseview.city.SPAWN_CORRIDOR;
          [0, 1, 19810001, 123456789, 0xffffffff].forEach(seed => {
            const city = Noseview.city.generateCity(seed);
            city.colliders
              .filter(collider => collider.structureKind === "landmark")
              .forEach(collider => {
                const intersects = collider.maxX > corridor.centerX - corridor.halfWidth &&
                  collider.minX < corridor.centerX + corridor.halfWidth &&
                  collider.maxZ > corridor.minZ && collider.minZ < corridor.maxZ;
                assert(!intersects, `Landmark ${collider.structureId} blocks the spawn corridor for seed ${seed}`);
              });
          });
        }
      },
      {
        name: "different seeds vary landmark placement",
        run() {
          const first = Noseview.city.generateCity(19810001).landmarks
            .map(landmark => `${landmark.type}:${landmark.lot.col},${landmark.lot.row}`);
          const second = Noseview.city.generateCity(19810002).landmarks
            .map(landmark => `${landmark.type}:${landmark.lot.col},${landmark.lot.row}`);
          assert(JSON.stringify(first) !== JSON.stringify(second), "Different seeds reused the same landmark layout");
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
        name: "ground safety clamps steep descent at every speed",
        run() {
          Noseview.flight.SPEED_MODES.forEach((_mode, speedIndex) => {
            const flight = Noseview.flight.createFlightModel({
              initialCamera: { x: 70, y: 1, z: 70, yaw: 0, pitch: -75 * Math.PI / 180 },
              speedIndex
            });
            flight.setControl("forward", true);
            const result = flight.update(1);
            assert(result.groundCorrected, `Ground correction was not reported for speed ${speedIndex}`);
            assertNear(flight.getSnapshot().camera.y, 0.6, 0.000001, `Minimum altitude changed for speed ${speedIndex}`);
            flight.setControl("forward", false);
            flight.update(1);
            assertNear(flight.getSnapshot().camera.y, 0.6, 0.000001, `Vertical drift remained for speed ${speedIndex}`);
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
      },
      {
        name: "navigation thresholds and degradation are deterministic",
        run() {
          const navigation = Noseview.navigation.createNavigationModel();
          let result = navigation.update({ x: 0, z: 89.999 }, 0);
          assert(result.snapshot.state === "SAFE", "Safe boundary changed");
          assert(result.snapshot.degradation === 0, "Safe degradation changed");
          result = navigation.update({ x: 90, z: 0 }, 0);
          assert(result.snapshot.state === "WARNING", "Warning boundary changed");
          result = navigation.update({ x: 120, z: 0 }, 0);
          assert(result.snapshot.state === "CRITICAL", "Critical boundary changed");
          assertNear(result.snapshot.degradation, 0.5, 0.000001, "Critical degradation changed");
          assertNear(result.snapshot.countdownSeconds, 5, 0.000001, "Critical countdown changed");
          result = navigation.update({ x: 150, z: 0 }, 0);
          assert(result.forcedResetReason === "hard-limit", "Hard boundary did not request reset");
          assert(result.snapshot.degradation === 1, "Hard-boundary degradation changed");
        }
      },
      {
        name: "navigation countdown is frame-rate independent",
        run() {
          function runCountdown(step, count) {
            const navigation = Noseview.navigation.createNavigationModel();
            navigation.update({ x: 120, z: 0 }, 0);
            let result;
            for (let index = 0; index < count; index += 1) {
              result = navigation.update({ x: 120, z: 0 }, step);
            }
            return result;
          }
          const coarse = runCountdown(0.5, 10);
          const fine = runCountdown(0.1, 50);
          assert(coarse.forcedResetReason === "countdown", "Coarse countdown did not expire");
          assert(fine.forcedResetReason === "countdown", "Fine countdown did not expire");
          assertNear(coarse.snapshot.countdownSeconds, fine.snapshot.countdownSeconds, 0.000001, "Countdown depends on step size");
        }
      },
      {
        name: "navigation countdown ticks are deterministic and restart cleanly",
        run() {
          function collectTicks(step) {
            const model = Noseview.navigation.createNavigationModel();
            const ticks = model.update({ x: 125, z: 0 }, 0).countdownTicks.slice();
            let result;
            do {
              result = model.update({ x: 125, z: 0 }, step);
              ticks.push(...result.countdownTicks);
            } while (!result.forcedResetReason);
            return ticks;
          }
          assert(collectTicks(0.5).join(",") === "5,4,3,2,1", "Coarse frames changed the tick sequence");
          assert(collectTicks(0.1).join(",") === "5,4,3,2,1", "Fine frames changed the tick sequence");

          const navigation = Noseview.navigation.createNavigationModel();
          let result = navigation.update({ x: 125, z: 0 }, 0);
          assert(result.countdownTicks.join(",") === "5", "Critical entry did not emit tick 5");
          result = navigation.update({ x: 125, z: 0 }, 0.25);
          assert(result.countdownTicks.length === 0, "Countdown repeated a tick within the same second");
          result = navigation.update({ x: 125, z: 0 }, 2.1);
          assert(result.countdownTicks.join(",") === "4,3", "Skipped seconds were not emitted in order");
          result = navigation.update({ x: 110, z: 0 }, 0);
          assert(result.countdownTicks.length === 0, "Leaving critical range emitted a stale tick");
          result = navigation.update({ x: 125, z: 0 }, 0);
          assert(result.countdownTicks.join(",") === "5", "Re-entering critical range did not restart tick 5");
        }
      },
      {
        name: "leaving critical range cancels the countdown",
        run() {
          const navigation = Noseview.navigation.createNavigationModel();
          navigation.update({ x: 125, z: 0 }, 0);
          navigation.update({ x: 125, z: 0 }, 2);
          const warning = navigation.update({ x: 110, z: 0 }, 0);
          assert(warning.snapshot.state === "WARNING", "Critical state did not clear");
          assert(warning.snapshot.countdownSeconds === null, "Countdown was not cancelled");
          const criticalAgain = navigation.update({ x: 125, z: 0 }, 0);
          assertNear(criticalAgain.snapshot.countdownSeconds, 5, 0.000001, "Countdown did not restart from its full duration");
          const safe = navigation.reset({ x: 7.5, z: 58 });
          assert(safe.state === "SAFE" && safe.countdownSeconds === null, "Navigation reset did not restore safe state");
        }
      },
      {
        name: "vertical ascent trips warning, critical and hard limit",
        run() {
          const navigation = Noseview.navigation.createNavigationModel();
          const rooftop = navigation.update({ x: 0, y: 60, z: 0 }, 0);
          assert(rooftop.snapshot.state === "SAFE", "Rooftop-level altitude falsely triggered a warning");
          const warning = navigation.update({ x: 0, y: 100, z: 0 }, 0);
          assert(warning.snapshot.state === "WARNING", "Vertical ascent past warning altitude did not raise WARNING");
          const critical = navigation.update({ x: 0, y: 130, z: 0 }, 0);
          assert(critical.snapshot.state === "CRITICAL", "Vertical ascent past critical altitude did not raise CRITICAL");
          assertNear(critical.snapshot.countdownSeconds, 5, 0.000001, "Vertical critical did not start the countdown");
          const hardLimit = navigation.update({ x: 0, y: 160, z: 0 }, 0);
          assert(hardLimit.forcedResetReason === "hard-limit", "Steep upward flight did not force a reset at the altitude ceiling");
          assert(hardLimit.snapshot.degradation === 1, "Altitude hard-limit degradation did not reach one");
        }
      },
      {
        name: "vertical descent below floor also trips the navigation limit",
        run() {
          const navigation = Noseview.navigation.createNavigationModel();
          const warning = navigation.update({ x: 0, y: -85, z: 0 }, 0);
          assert(warning.snapshot.state === "WARNING", "Descent past warning altitude did not raise WARNING");
          const hardLimit = navigation.update({ x: 0, y: -145, z: 0 }, 0);
          assert(hardLimit.forcedResetReason === "hard-limit", "Descent below the altitude floor did not force a reset");
        }
      },
      {
        name: "altitude thresholds are configurable and validated",
        run() {
          const custom = Noseview.navigation.createNavigationModel({
            centerY: 0,
            warningAltitude: 20,
            criticalAltitude: 40,
            resetAltitude: 60
          });
          assert(custom.update({ x: 0, y: 25, z: 0 }, 0).snapshot.state === "WARNING", "Custom altitude warning threshold ignored");
          assert(custom.update({ x: 0, y: 45, z: 0 }, 0).snapshot.state === "CRITICAL", "Custom altitude critical threshold ignored");
          let threw = false;
          try {
            Noseview.navigation.createNavigationModel({ warningAltitude: 50, criticalAltitude: 40, resetAltitude: 30 });
          } catch (error) {
            threw = error instanceof RangeError;
          }
          assert(threw, "Invalid altitude configuration did not raise RangeError");
        }
      }
    ];
  }

  Noseview.tests = { getCases };
}(window));
