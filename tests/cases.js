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
            assert(result.blocked, `Ground correction was not reported for speed ${speedIndex}`);
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
      },
      {
        name: "helipad landmark exposes a landing pad surface",
        run() {
          const city = Noseview.city.generateCity(19810001);
          const helipad = city.landmarks.find(landmark => landmark.type === "helipad-complex");
          assert(Boolean(helipad), "Default seed did not produce a helipad landmark");
          const platform = helipad.parts.find(part => part.role === "platform");
          assert(Boolean(platform), "Helipad has no platform part");
          assertNear(helipad.landingPadY, platform.bounds.maxY, Number.EPSILON, "landingPadY does not match the platform top");
          const cabin = helipad.parts.find(part => part.role === "control-cabin");
          if (cabin) {
            assert(cabin.bounds.maxY > helipad.landingPadY, "Control cabin is not above the landing pad surface");
            assertNear(helipad.roofY, Math.max(platform.bounds.maxY, cabin.bounds.maxY), Number.EPSILON, "roofY changed");
          }
        }
      },
      {
        name: "mission start spawns on the helipad pad center facing the city",
        run() {
          const city = Noseview.city.generateCity(19810001);
          const helipad = city.landmarks.find(landmark => landmark.type === "helipad-complex");
          const start = Noseview.city.getMissionStart(city);
          assertNear(start.x, helipad.x, Number.EPSILON, "Mission start x does not match the helipad center");
          assertNear(start.z, helipad.z, Number.EPSILON, "Mission start z does not match the helipad center");
          assertNear(start.y, helipad.landingPadY + 0.61, 0.000001, "Mission start y does not sit slightly above the pad");
          assertNear(start.pitch, -10 * Math.PI / 180, Number.EPSILON, "Mission start pitch changed");
          const forwardX = Math.sin(start.yaw);
          const forwardZ = -Math.cos(start.yaw);
          const distance = Math.hypot(helipad.x, helipad.z);
          assert(distance > 0, "Helipad landed on the world center; yaw direction is undefined");
          const toCenterX = -helipad.x / distance;
          const toCenterZ = -helipad.z / distance;
          const dot = forwardX * toCenterX + forwardZ * toCenterZ;
          assertNear(dot, 1, 0.000001, "Mission start yaw does not face the city center");
          const custom = Noseview.city.getMissionStart(city, { cameraRadius: 1.4, pitchDegrees: 0 });
          assertNear(custom.y, helipad.landingPadY + 1.41, 0.000001, "Custom cameraRadius did not affect mission start altitude");
          assertNear(custom.pitch, 0, Number.EPSILON, "Custom pitchDegrees did not affect mission start pitch");
        }
      },
      {
        name: "flight.setInitialCamera updates the reset target",
        run() {
          const flight = Noseview.flight.createFlightModel();
          const next = { x: 20, y: 15, z: -5, yaw: 1, pitch: -0.3 };
          const returned = flight.setInitialCamera(next);
          assertNear(returned.x, next.x, Number.EPSILON, "Returned camera x mismatch");
          assertNear(returned.y, next.y, Number.EPSILON, "Returned camera y mismatch");
          assertNear(returned.z, next.z, Number.EPSILON, "Returned camera z mismatch");
          assertNear(returned.yaw, next.yaw, Number.EPSILON, "Returned camera yaw mismatch");
          assertNear(returned.pitch, next.pitch, Number.EPSILON, "Returned camera pitch mismatch");
          flight.setControl("forward", true);
          flight.update(0.5);
          flight.reset();
          const camera = flight.getSnapshot().camera;
          assertNear(camera.x, next.x, Number.EPSILON, "Reset x did not return to the new target");
          assertNear(camera.y, next.y, Number.EPSILON, "Reset y did not return to the new target");
          assertNear(camera.z, next.z, Number.EPSILON, "Reset z did not return to the new target");
          assertNear(camera.yaw, next.yaw, Number.EPSILON, "Reset yaw did not return to the new target");
          assertNear(camera.pitch, next.pitch, Number.EPSILON, "Reset pitch did not return to the new target");
          const clamped = flight.setInitialCamera({ x: 0, y: 0.1, z: 0, yaw: 0, pitch: 0 });
          assertNear(clamped.y, 0.6, Number.EPSILON, "setInitialCamera did not enforce minimum altitude");
        }
      },
      {
        name: "flight.setInitialCamera rejects non-finite values",
        run() {
          const flight = Noseview.flight.createFlightModel();
          const invalidValues = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
          ["x", "y", "z", "yaw", "pitch"].forEach(field => {
            invalidValues.forEach(value => {
              const camera = { x: 0, y: 5, z: 0, yaw: 0, pitch: 0 };
              camera[field] = value;
              let threw = false;
              try {
                flight.setInitialCamera(camera);
              } catch (error) {
                threw = error instanceof TypeError;
              }
              assert(threw, `setInitialCamera accepted ${field}=${value}`);
            });
          });
          let missingThrew = false;
          try {
            flight.setInitialCamera({ x: 0, y: 5, z: 0, yaw: 0 });
          } catch (error) {
            missingThrew = error instanceof TypeError;
          }
          assert(missingThrew, "setInitialCamera accepted a camera missing pitch");
          let nullThrew = false;
          try {
            flight.setInitialCamera(null);
          } catch (error) {
            nullThrew = error instanceof TypeError;
          }
          assert(nullThrew, "setInitialCamera accepted a null camera");
        }
      },
      {
        name: "flight.update detects collisions with structures",
        run() {
          const flight = Noseview.flight.createFlightModel({
            initialCamera: { x: 0, y: 10, z: 0, yaw: 0, pitch: 0 },
            colliders: [{ minX: 1, maxX: 2, minY: 0, maxY: 20, minZ: -1, maxZ: 1 }]
          });
          flight.setControl("strafeRight", true);
          const result = flight.update(0.2);
          assert(result.blocked === true, "Collision with wall was not detected");
          assert(flight.getSnapshot().camera.x < 1, "Camera penetrated the collider");
        }
      },
      {
        name: "flight.update detects collisions with the ground",
        run() {
          const flight = Noseview.flight.createFlightModel({
            initialCamera: { x: 0, y: 0.61, z: 0, yaw: 0, pitch: -Math.PI / 4 }
          });
          flight.setControl("forward", true);
          const result = flight.update(0.1);
          assert(result.blocked === true, "Collision with ground was not detected");
          assertNear(flight.getSnapshot().camera.y, 0.6, Number.EPSILON, "Camera went below ground level");
        }
      },
      {
        name: "signal hunt determinism and seed normalization",
        run() {
          const city = Noseview.city.generateCity(19810001);
          const m1 = Noseview.signalHunt.createSignalHuntModel({ targetCount: 5 });
          const m2 = Noseview.signalHunt.createSignalHuntModel({ targetCount: 5 });
          m1.start(city, 1234);
          m2.start(city, 1234);
          const a = m1.getActiveTarget();
          const b = m2.getActiveTarget();
          assert(a && b && a.x === b.x && a.y === b.y && a.z === b.z, "Same city+seed produced different first target");
          const snap = m1.getSnapshot();
          assert((snap.missionSeed >>> 0) === (1234 >>> 0), "Mission seed was not normalized / stored in snapshot");
        }
      },
      {
        name: "aborting signal hunt clears targets and replay rebuilds them for a new city",
        run() {
          const firstCity = Noseview.city.generateCity(19810001);
          const secondCity = Noseview.city.generateCity(19810002);
          const model = Noseview.signalHunt.createSignalHuntModel({ targetCount: 5 });
          model.start(firstCity, 1234);
          assert(model.getActiveTarget(), "Signal Hunt did not create an initial target");
          model.abort();
          const aborted = model.getSnapshot();
          assert(aborted.mode === "ABORTED", "Abort did not end the mission");
          assert(aborted.totalTargets === 0 && aborted.acquiredTargets === 0, "Abort retained mission target counts");
          assert(aborted.activeTargetId === null && model.getActiveTarget() === null, "Abort retained an active target");
          model.replay(secondCity);
          const replayed = model.getSnapshot();
          const target = model.getActiveTarget();
          const belongsToSecondCity = target && secondCity.structures.some(structure => {
            const anchor = structure.signalAnchor;
            return anchor && anchor.x === target.x && anchor.y === target.y && anchor.z === target.z;
          });
          assert(replayed.mode === "ACTIVE", "Replay with a new city did not restart the mission");
          assert(replayed.totalTargets === 5 && replayed.acquiredTargets === 0, "Replay did not reset target progress");
          assert(belongsToSecondCity, "Replay did not create targets from the new city");
        }
      },
      {
        name: "signal hunt locks a target only after two seconds in cone",
        run() {
          const city = Noseview.city.generateCity(19810001);
          const model = Noseview.signalHunt.createSignalHuntModel({ scanConeDegrees: 8, scanMinDistance: 0, scanMaxDistance: 200 });
          model.start(city, 555);
          const t = model.getActiveTarget();
          function yawTo(dx, dz) { return Math.atan2(dx, -dz); }
          function pitchTo(dx, dy, dz) { return Math.atan2(dy, Math.hypot(dx, dz)); }
          // Place camera 10 units east of target, level with it, facing it
          const cam = { x: t.x + 10, y: t.y, z: t.z, yaw: yawTo(-10, 0), pitch: pitchTo(-10, 0, 0) };
          model.update(cam, 1.99);
          let snapshot = model.getSnapshot();
          assert(snapshot.acquiredTargets === 0, "Valid aim acquired before two seconds");
          assertNear(snapshot.lock.progress, 0.04, 0.000001, "Lock progress did not use bounded frame time");
          model.update(cam, 0.01);
          snapshot = model.getSnapshot();
          assert(snapshot.acquiredTargets === 0, "A clamped frame incorrectly completed the lock");
          for (let i = 0; i < 24; i += 1) model.update(cam, 0.08);
          assert(model.getSnapshot().acquiredTargets === 1, "Valid aim did not acquire after two seconds");

          model.restartAttempt();
          const outsideCone = { ...cam, yaw: cam.yaw + (12 * Math.PI / 180) };
          model.update(outsideCone, 2);
          snapshot = model.getSnapshot();
          assert(snapshot.acquiredTargets === 0, "Invalid aim acquired the target");
          assert(snapshot.lock.progress === 0, "Invalid aim left stale lock progress");
        }
      },
      {
        name: "timer expiration fails and replay restarts the mission",
        run() {
          const city = Noseview.city.generateCity(19810001);
          const model = Noseview.signalHunt.createSignalHuntModel({ timerSeconds: 0.5, scanMinDistance: 0, scanMaxDistance: 200 });
          model.start(city, 42);
          const target = model.getActiveTarget();
          const camera = {
            x: 0,
            y: 0,
            z: 0,
            yaw: Math.atan2(target.x, -target.z),
            pitch: Math.atan2(target.y, Math.hypot(target.x, target.z))
          };
          for (let i = 0; i < 8; i += 1) {
            model.update(camera, 0.08);
          }
          const failed = model.getSnapshot();
          assert(failed.mode === "FAILED", "Timer expiration did not fail the mission");
          assert(!failed.lock.active && failed.lock.progress === 0, "Timer expiration left stale lock telemetry");
          model.replay();
          const replayed = model.getSnapshot();
          assert(replayed.mode === "ACTIVE", "Replay did not restart the mission");
        }
      },
      {
        name: "last lock completes the mission with immutable statistics",
        run() {
          const city = Noseview.city.generateCity(19810001);
          const model = Noseview.signalHunt.createSignalHuntModel({ targetCount: 1, scanMinDistance: 0, scanMaxDistance: 200 });
          model.start(city, 9001);
          model.drainEvents();
          const target = model.getActiveTarget();
          const camera = {
            x: target.x + 10,
            y: target.y,
            z: target.z,
            yaw: Math.atan2(-10, 0),
            pitch: 0
          };
          for (let i = 0; i < 25; i += 1) model.update(camera, 0.08);
          const snapshot = model.getSnapshot();
          assert(snapshot.mode === "SUCCESS", "Final lock did not complete the mission");
          assert(snapshot.activeTargetId === null, "Completed mission retained an active target");
          assert(snapshot.completion.acquiredTargets === 1 && snapshot.completion.totalTargets === 1, "Completion counts were incorrect");
          assert(snapshot.completion.elapsedSeconds > 0, "Completion time was not recorded");
          const completeEvent = model.drainEvents().find(event => event.type === "mission-complete");
          assert(completeEvent && completeEvent.acquiredTargets === 1 && completeEvent.totalTargets === 1, "Completion event lacked mission statistics");
          const elapsed = snapshot.completion.elapsedSeconds;
          model.update(camera, 1);
          assert(model.getSnapshot().completion.elapsedSeconds === elapsed, "Completion statistics changed after success");
        }
      },
      {
        name: "reset attempt during active mission restarts progress",
        run() {
          const city = Noseview.city.generateCity(19810001);
          const model = Noseview.signalHunt.createSignalHuntModel({});
          model.start(city, 77);
          const first = model.getSnapshot().activeTargetId;
          const t = model.getActiveTarget();
          const yaw = Math.atan2(t.x - (t.x + 10), -(t.z - t.z));
          const cam = { x: t.x + 10, y: t.y, z: t.z, yaw, pitch: 0 };
          model.update(cam, 0.08);
          assert(model.getSnapshot().lock.progress > 0, "Valid aim did not begin lock progress");
          model.restartAttempt();
          const restarted = model.getSnapshot();
          assert(restarted.acquiredTargets === 0, "Restart did not clear acquired count");
          assert(restarted.activeTargetId === first, "Restart changed the first active target");
          assert(restarted.lock.progress === 0, "Restart left stale lock progress");
        }
      }
    ];
  }

  Noseview.tests = { getCases };
}(window));
