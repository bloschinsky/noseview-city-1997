(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview) throw new Error("Noseview namespace must load before city.js");

  const DEFAULT_SEED = 19810001;
  const BUILDING_COUNT = 26;

  function createRng(seed) {
    let state = seed >>> 0;
    return function () {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function addLine(data, a, b) {
    data.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }

  function addBox(faces, edges, part, buildingId, kind) {
    const x0 = part.x - part.width / 2;
    const x1 = part.x + part.width / 2;
    const z0 = part.z - part.depth / 2;
    const z1 = part.z + part.depth / 2;
    const y0 = part.baseY;
    const y1 = part.baseY + part.height;
    const vertices = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
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

    triangles.forEach(index => {
      const vertex = vertices[index];
      faces.push(vertex[0], vertex[1], vertex[2]);
    });
    pairs.forEach(pair => addLine(edges, vertices[pair[0]], vertices[pair[1]]));

    return {
      buildingId,
      part: kind,
      minX: x0,
      maxX: x1,
      minY: y0,
      maxY: y1,
      minZ: z0,
      maxZ: z1
    };
  }

  function generateCity(seed) {
    const normalizedSeed = seed >>> 0;
    const random = createRng(normalizedSeed);
    const lots = [];
    for (let row = -2; row <= 2; row += 1) {
      for (let col = -3; col <= 2; col += 1) {
        lots.push({ col, row, sort: random() });
      }
    }
    lots.sort((a, b) => a.sort - b.sort);

    const faces = [];
    const edges = [];
    const antennas = [];
    const colliders = [];
    const buildings = [];

    lots.slice(0, BUILDING_COUNT).forEach((lot, index) => {
      const id = `building-${index}`;
      const x = lot.col * 15 + (random() - 0.5) * 1.8;
      const z = lot.row * 16 + (random() - 0.5) * 1.8;
      const width = 6.4 + random() * 3.2;
      const depth = 6.2 + random() * 3.5;
      let height = 7 + random() * 20;
      if (index % 9 === 0) height += 11;

      const base = { x, z, width, depth, height, baseY: 0.03 };
      const baseCollider = addBox(faces, edges, base, id, "base");
      colliders.push(baseCollider);

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
        const tierCollider = addBox(faces, edges, tier, id, "tier");
        colliders.push(tierCollider);
        if (index % 10 === 0) {
          const antennaBaseY = height + tier.height;
          antenna = { x, z, baseY: antennaBaseY, height: 5 };
          addLine(antennas, [x, antennaBaseY, z], [x, antennaBaseY + 5, z]);
          addLine(antennas, [x - 1.2, antennaBaseY + 3.3, z], [x + 1.2, antennaBaseY + 3.3, z]);
        }
      }

      buildings.push({
        id,
        lot: { col: lot.col, row: lot.row },
        x,
        z,
        width,
        depth,
        height,
        roofY: base.baseY + height,
        tier,
        antenna
      });
    });

    return {
      seed: normalizedSeed,
      buildings,
      colliders,
      geometry: { faces, edges, antennas }
    };
  }

  Noseview.city = { DEFAULT_SEED, BUILDING_COUNT, createRng, generateCity };
}(window));
