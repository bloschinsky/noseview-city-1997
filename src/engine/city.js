(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview) throw new Error("Noseview namespace must load before city.js");

  const DEFAULT_SEED = 19810001;
  const STRUCTURE_COUNT = 26;
  const LANDMARK_COUNT = 3;
  const BUILDING_COUNT = STRUCTURE_COUNT - LANDMARK_COUNT;
  const LANDMARK_SEED_SALT = 0x4c4d4b33;
  const LANDMARK_TYPES = Object.freeze([
    "telecom-tower",
    "needle-tower",
    "helipad-complex"
  ]);
  const SPAWN_CORRIDOR = Object.freeze({
    centerX: 7.5,
    halfWidth: 1.5,
    minZ: -48,
    maxZ: 58
  });

  function createRng(seed) {
    let state = seed >>> 0;
    return function () {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function addLine(data, a, b) {
    data.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }

  function getBoxBounds(part) {
    return {
      minX: part.x - part.width / 2,
      maxX: part.x + part.width / 2,
      minY: part.baseY,
      maxY: part.baseY + part.height,
      minZ: part.z - part.depth / 2,
      maxZ: part.z + part.depth / 2
    };
  }

  function addSolidBox(faces, edges, colliders, structure, definition) {
    const bounds = getBoxBounds(definition);
    const vertices = [
      [bounds.minX, bounds.minY, bounds.minZ], [bounds.maxX, bounds.minY, bounds.minZ],
      [bounds.maxX, bounds.maxY, bounds.minZ], [bounds.minX, bounds.maxY, bounds.minZ],
      [bounds.minX, bounds.minY, bounds.maxZ], [bounds.maxX, bounds.minY, bounds.maxZ],
      [bounds.maxX, bounds.maxY, bounds.maxZ], [bounds.minX, bounds.maxY, bounds.maxZ]
    ];
    const triangles = [
      0, 1, 2, 0, 2, 3,
      5, 4, 7, 5, 7, 6,
      4, 0, 3, 4, 3, 7,
      1, 5, 6, 1, 6, 2,
      3, 2, 6, 3, 6, 7,
      4, 5, 1, 4, 1, 0
    ];
    const pairs = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
    const faceStart = faces.length / 3;
    const edgeStart = edges.length / 3;

    triangles.forEach(index => {
      const vertex = vertices[index];
      faces.push(vertex[0], vertex[1], vertex[2]);
    });
    pairs.forEach(pair => addLine(edges, vertices[pair[0]], vertices[pair[1]]));

    const part = {
      id: `${structure.id}-${definition.role}`,
      role: definition.role,
      solid: true,
      bounds,
      geometry: {
        faceStart,
        faceCount: faces.length / 3 - faceStart,
        edgeStart,
        edgeCount: edges.length / 3 - edgeStart
      }
    };
    structure.parts.push(part);
    colliders.push({
      structureId: structure.id,
      structureKind: structure.kind,
      partId: part.id,
      part: definition.role,
      ...bounds
    });
    return part;
  }

  function addDecoration(lines, structure, role, segments) {
    const lineStart = lines.length / 3;
    segments.forEach(segment => addLine(lines, segment[0], segment[1]));
    const part = {
      id: `${structure.id}-${role}`,
      role,
      solid: false,
      geometry: {
        lineStart,
        lineCount: lines.length / 3 - lineStart
      }
    };
    structure.parts.push(part);
    return part;
  }

  function createBaseDescriptors(random) {
    const lots = [];
    for (let row = -2; row <= 2; row += 1) {
      for (let col = -3; col <= 2; col += 1) {
        lots.push({ col, row, sort: random() });
      }
    }
    lots.sort((a, b) => a.sort - b.sort);

    return lots.slice(0, STRUCTURE_COUNT).map((lot, index) => {
      const x = lot.col * 15 + (random() - 0.5) * 1.8;
      const z = lot.row * 16 + (random() - 0.5) * 1.8;
      const width = 6.4 + random() * 3.2;
      const depth = 6.2 + random() * 3.5;
      let height = 7 + random() * 20;
      if (index % 9 === 0) height += 11;

      let tier = null;
      let antenna = null;
      if (index % 5 === 0 && height > 17) {
        tier = {
          x,
          z,
          height: 3.5 + random() * 5,
          width: width * (0.48 + random() * 0.18),
          depth: depth * (0.48 + random() * 0.18),
          baseY: height + 0.03
        };
        if (index % 10 === 0) {
          antenna = { x, z, baseY: height + tier.height, height: 5 };
        }
      }

      return {
        index,
        lot: { col: lot.col, row: lot.row },
        x,
        z,
        width,
        depth,
        height,
        tier,
        antenna
      };
    });
  }

  function footprintIntersectsSpawnCorridor(descriptor) {
    const minX = descriptor.x - descriptor.width / 2;
    const maxX = descriptor.x + descriptor.width / 2;
    const minZ = descriptor.z - descriptor.depth / 2;
    const maxZ = descriptor.z + descriptor.depth / 2;
    const corridorMinX = SPAWN_CORRIDOR.centerX - SPAWN_CORRIDOR.halfWidth;
    const corridorMaxX = SPAWN_CORRIDOR.centerX + SPAWN_CORRIDOR.halfWidth;
    return maxX > corridorMinX && minX < corridorMaxX &&
      maxZ > SPAWN_CORRIDOR.minZ && minZ < SPAWN_CORRIDOR.maxZ;
  }

  function selectLandmarks(descriptors, seed) {
    const random = createRng((seed ^ LANDMARK_SEED_SALT) >>> 0);
    const eligible = descriptors
      .filter(descriptor => !footprintIntersectsSpawnCorridor(descriptor))
      .map(descriptor => ({ descriptor, tieBreaker: random() }));
    if (eligible.length < LANDMARK_COUNT) {
      throw new Error("City layout does not contain enough safe landmark lots");
    }

    const selected = [eligible.splice(Math.floor(random() * eligible.length), 1)[0]];
    while (selected.length < LANDMARK_COUNT) {
      eligible.forEach(candidate => {
        candidate.distance = selected.reduce((minimum, chosen) => {
          const colDistance = candidate.descriptor.lot.col - chosen.descriptor.lot.col;
          const rowDistance = candidate.descriptor.lot.row - chosen.descriptor.lot.row;
          return Math.min(minimum, colDistance * colDistance + rowDistance * rowDistance);
        }, Infinity);
      });
      eligible.sort((a, b) => b.distance - a.distance || b.tieBreaker - a.tieBreaker);
      selected.push(eligible.shift());
    }

    const types = LANDMARK_TYPES.slice();
    for (let index = types.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [types[index], types[swapIndex]] = [types[swapIndex], types[index]];
    }

    const selections = {};
    selected.forEach((candidate, index) => {
      selections[candidate.descriptor.index] = types[index];
    });
    return selections;
  }

  function createBuilding(descriptor, geometry, colliders) {
    const structure = {
      id: `building-${descriptor.index}`,
      kind: "building",
      type: "building",
      lot: descriptor.lot,
      x: descriptor.x,
      z: descriptor.z,
      width: descriptor.width,
      depth: descriptor.depth,
      height: descriptor.height,
      roofY: descriptor.height + 0.03,
      visualTopY: descriptor.height + 0.03,
      tier: descriptor.tier,
      antenna: descriptor.antenna,
      parts: [],
      signalAnchor: null
    };

    addSolidBox(geometry.faces, geometry.edges, colliders, structure, {
      role: "base",
      x: descriptor.x,
      z: descriptor.z,
      width: descriptor.width,
      depth: descriptor.depth,
      height: descriptor.height,
      baseY: 0.03
    });

    if (descriptor.tier) {
      const tierPart = addSolidBox(
        geometry.faces,
        geometry.edges,
        colliders,
        structure,
        { role: "tier", ...descriptor.tier }
      );
      structure.roofY = tierPart.bounds.maxY;
      structure.visualTopY = structure.roofY;
    }

    if (descriptor.antenna) {
      const antenna = descriptor.antenna;
      addDecoration(geometry.antennas, structure, "antenna", [
        [[antenna.x, antenna.baseY, antenna.z], [antenna.x, antenna.baseY + antenna.height, antenna.z]],
        [[antenna.x - 1.2, antenna.baseY + 3.3, antenna.z], [antenna.x + 1.2, antenna.baseY + 3.3, antenna.z]]
      ]);
      structure.visualTopY = antenna.baseY + antenna.height;
    }
    structure.signalAnchor = { x: structure.x, y: structure.visualTopY + 0.75, z: structure.z };
    return structure;
  }

  function createLandmarkBase(descriptor, type) {
    return {
      id: `landmark-${type}-${descriptor.index}`,
      kind: "landmark",
      type,
      lot: descriptor.lot,
      x: descriptor.x,
      z: descriptor.z,
      width: descriptor.width,
      depth: descriptor.depth,
      height: 0,
      roofY: 0,
      visualTopY: 0,
      parts: [],
      signalAnchor: null
    };
  }

  function createTelecomTower(descriptor, geometry, colliders) {
    const structure = createLandmarkBase(descriptor, "telecom-tower");
    const baseHeight = clamp(descriptor.height * 0.52, 9, 15);
    const lowerTierHeight = 5.5;
    const upperTierHeight = 4.5;
    addSolidBox(geometry.landmarkFaces, geometry.landmarkEdges, colliders, structure, {
      role: "base", x: structure.x, z: structure.z, width: structure.width,
      depth: structure.depth, height: baseHeight, baseY: 0.03
    });
    addSolidBox(geometry.landmarkFaces, geometry.landmarkEdges, colliders, structure, {
      role: "lower-tier", x: structure.x, z: structure.z, width: structure.width * 0.58,
      depth: structure.depth * 0.58, height: lowerTierHeight, baseY: baseHeight + 0.03
    });
    const upperTier = addSolidBox(geometry.landmarkFaces, geometry.landmarkEdges, colliders, structure, {
      role: "upper-tier", x: structure.x, z: structure.z, width: structure.width * 0.32,
      depth: structure.depth * 0.32, height: upperTierHeight,
      baseY: baseHeight + lowerTierHeight + 0.03
    });
    const mastBaseY = upperTier.bounds.maxY;
    const mastTopY = mastBaseY + 10;
    const armWidth = structure.width * 0.58;
    addDecoration(geometry.landmarkAccents, structure, "mast-array", [
      [[structure.x, mastBaseY, structure.z], [structure.x, mastTopY, structure.z]],
      [[structure.x - armWidth / 2, mastBaseY + 3.5, structure.z], [structure.x + armWidth / 2, mastBaseY + 3.5, structure.z]],
      [[structure.x, mastBaseY + 3.5, structure.z - armWidth / 2], [structure.x, mastBaseY + 3.5, structure.z + armWidth / 2]],
      [[structure.x - armWidth * 0.38, mastBaseY + 6.8, structure.z], [structure.x + armWidth * 0.38, mastBaseY + 6.8, structure.z]],
      [[structure.x - armWidth / 2, mastBaseY + 3.5, structure.z], [structure.x, mastBaseY + 6.8, structure.z]],
      [[structure.x + armWidth / 2, mastBaseY + 3.5, structure.z], [structure.x, mastBaseY + 6.8, structure.z]]
    ]);
    structure.roofY = upperTier.bounds.maxY;
    structure.visualTopY = mastTopY;
    structure.height = mastTopY - 0.03;
    structure.signalAnchor = { x: structure.x, y: mastTopY + 0.75, z: structure.z };
    return structure;
  }

  function createNeedleTower(descriptor, geometry, colliders) {
    const structure = createLandmarkBase(descriptor, "needle-tower");
    const baseHeight = clamp(descriptor.height * 0.48, 8, 13);
    const middleHeight = 9;
    const shaftHeight = 13;
    addSolidBox(geometry.landmarkFaces, geometry.landmarkEdges, colliders, structure, {
      role: "base", x: structure.x, z: structure.z, width: structure.width,
      depth: structure.depth, height: baseHeight, baseY: 0.03
    });
    addSolidBox(geometry.landmarkFaces, geometry.landmarkEdges, colliders, structure, {
      role: "middle", x: structure.x, z: structure.z, width: structure.width * 0.52,
      depth: structure.depth * 0.52, height: middleHeight, baseY: baseHeight + 0.03
    });
    const shaft = addSolidBox(geometry.landmarkFaces, geometry.landmarkEdges, colliders, structure, {
      role: "shaft", x: structure.x, z: structure.z,
      width: Math.max(1.15, structure.width * 0.2),
      depth: Math.max(1.15, structure.depth * 0.2),
      height: shaftHeight, baseY: baseHeight + middleHeight + 0.03
    });
    const needleTopY = shaft.bounds.maxY + 11;
    addDecoration(geometry.landmarkAccents, structure, "needle", [
      [[structure.x, shaft.bounds.maxY, structure.z], [structure.x, needleTopY, structure.z]],
      [[structure.x - 1.2, shaft.bounds.maxY + 2.2, structure.z], [structure.x + 1.2, shaft.bounds.maxY + 2.2, structure.z]]
    ]);
    structure.roofY = shaft.bounds.maxY;
    structure.visualTopY = needleTopY;
    structure.height = needleTopY - 0.03;
    structure.signalAnchor = { x: structure.x, y: needleTopY + 0.75, z: structure.z };
    return structure;
  }

  function createHelipadComplex(descriptor, geometry, colliders) {
    const structure = createLandmarkBase(descriptor, "helipad-complex");
    const baseHeight = clamp(descriptor.height * 0.48, 7.5, 12.5);
    addSolidBox(geometry.landmarkFaces, geometry.landmarkEdges, colliders, structure, {
      role: "base", x: structure.x, z: structure.z, width: structure.width,
      depth: structure.depth, height: baseHeight, baseY: 0.03
    });
    const platform = addSolidBox(geometry.landmarkFaces, geometry.landmarkEdges, colliders, structure, {
      role: "platform", x: structure.x, z: structure.z, width: structure.width * 0.92,
      depth: structure.depth * 0.92, height: 0.55, baseY: baseHeight + 0.03
    });
    const cabinWidth = structure.width * 0.24;
    const cabinDepth = structure.depth * 0.24;
    const cabin = addSolidBox(geometry.landmarkFaces, geometry.landmarkEdges, colliders, structure, {
      role: "control-cabin",
      x: structure.x - structure.width * 0.3,
      z: structure.z - structure.depth * 0.3,
      width: cabinWidth,
      depth: cabinDepth,
      height: 2.4,
      baseY: platform.bounds.maxY
    });
    const markY = platform.bounds.maxY + 0.035;
    const markHalfWidth = structure.width * 0.18;
    const markHalfDepth = structure.depth * 0.18;
    const cornerX = structure.width * 0.36;
    const cornerZ = structure.depth * 0.36;
    const aerialTopY = platform.bounds.maxY + 5;
    addDecoration(geometry.landmarkAccents, structure, "helipad-markings", [
      [[structure.x - markHalfWidth, markY, structure.z - markHalfDepth], [structure.x - markHalfWidth, markY, structure.z + markHalfDepth]],
      [[structure.x + markHalfWidth, markY, structure.z - markHalfDepth], [structure.x + markHalfWidth, markY, structure.z + markHalfDepth]],
      [[structure.x - markHalfWidth, markY, structure.z], [structure.x + markHalfWidth, markY, structure.z]],
      [[structure.x - cornerX, platform.bounds.maxY, structure.z - cornerZ], [structure.x - cornerX, aerialTopY, structure.z - cornerZ]],
      [[structure.x + cornerX, platform.bounds.maxY, structure.z - cornerZ], [structure.x + cornerX, aerialTopY, structure.z - cornerZ]],
      [[structure.x - cornerX, platform.bounds.maxY, structure.z + cornerZ], [structure.x - cornerX, aerialTopY, structure.z + cornerZ]],
      [[structure.x + cornerX, platform.bounds.maxY, structure.z + cornerZ], [structure.x + cornerX, aerialTopY, structure.z + cornerZ]]
    ]);
    structure.roofY = Math.max(platform.bounds.maxY, cabin.bounds.maxY);
    structure.visualTopY = aerialTopY;
    structure.height = aerialTopY - 0.03;
    structure.signalAnchor = { x: structure.x, y: aerialTopY + 0.75, z: structure.z };
    return structure;
  }

  function createLandmark(descriptor, type, geometry, colliders) {
    if (type === "telecom-tower") return createTelecomTower(descriptor, geometry, colliders);
    if (type === "needle-tower") return createNeedleTower(descriptor, geometry, colliders);
    return createHelipadComplex(descriptor, geometry, colliders);
  }

  function generateCity(seed) {
    const normalizedSeed = seed >>> 0;
    const descriptors = createBaseDescriptors(createRng(normalizedSeed));
    const landmarkSelections = selectLandmarks(descriptors, normalizedSeed);
    const geometry = {
      faces: [],
      edges: [],
      antennas: [],
      landmarkFaces: [],
      landmarkEdges: [],
      landmarkAccents: []
    };
    const colliders = [];
    const structures = descriptors.map(descriptor => {
      const landmarkType = landmarkSelections[descriptor.index];
      return landmarkType
        ? createLandmark(descriptor, landmarkType, geometry, colliders)
        : createBuilding(descriptor, geometry, colliders);
    });
    const buildings = structures.filter(structure => structure.kind === "building");
    const landmarks = structures.filter(structure => structure.kind === "landmark");

    return {
      seed: normalizedSeed,
      structures,
      buildings,
      landmarks,
      colliders,
      geometry
    };
  }

  Noseview.city = {
    DEFAULT_SEED,
    STRUCTURE_COUNT,
    BUILDING_COUNT,
    LANDMARK_COUNT,
    LANDMARK_TYPES,
    SPAWN_CORRIDOR,
    createRng,
    generateCity
  };
}(window));
