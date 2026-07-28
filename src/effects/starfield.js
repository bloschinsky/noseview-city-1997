(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview) throw new Error("Noseview namespace must load before starfield.js");

  const SKY_MODES = Object.freeze({
    NONE: "none",
    DIGITAL_RAIN: "digitalRain",
    STARFIELD: "starfield"
  });
  const DEFAULT_SEED = 19970001;
  const DEFAULT_COUNT = 700;
  const MAX_LARGE_RATIO = 0.10;

  function normalizeSkyMode(mode) {
    if (mode === SKY_MODES.DIGITAL_RAIN || mode === SKY_MODES.STARFIELD) return mode;
    return SKY_MODES.NONE;
  }

  function toggleSkyMode(currentMode, selectedMode) {
    const current = normalizeSkyMode(currentMode);
    const selected = normalizeSkyMode(selectedMode);
    return current === selected ? SKY_MODES.NONE : selected;
  }

  function createRng(seed) {
    let state = (Number(seed) >>> 0) || DEFAULT_SEED;
    return function random() {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  }

  function createStarfield(options) {
    const settings = options || {};
    const seed = Number.isFinite(settings.seed) ? settings.seed >>> 0 : DEFAULT_SEED;
    const count = Number.isInteger(settings.count) && settings.count > 0 ? settings.count : DEFAULT_COUNT;
    const requestedRatio = Number.isFinite(settings.largeStarRatio) ? settings.largeStarRatio : MAX_LARGE_RATIO;
    const largeRatio = Math.min(MAX_LARGE_RATIO, Math.max(0, requestedRatio));
    const largeCount = Math.floor(count * largeRatio);
    const random = createRng(seed);
    const data = new Float32Array(count * 4);
    const indices = Array.from({ length: count }, (_value, index) => index);

    for (let index = count - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      const temporary = indices[index];
      indices[index] = indices[swapIndex];
      indices[swapIndex] = temporary;
    }
    const largeIndices = new Set(indices.slice(0, largeCount));

    for (let index = 0; index < count; index += 1) {
      let x;
      let y;
      let radiusSquared;
      do {
        x = random() * 2 - 1;
        y = random() * 2 - 1;
        radiusSquared = x * x + y * y;
      } while (radiusSquared === 0 || radiusSquared >= 1);
      const scale = Math.sqrt(1 - radiusSquared);
      const offset = index * 4;
      data[offset] = 2 * x * scale;
      data[offset + 1] = 1 - 2 * radiusSquared;
      data[offset + 2] = 2 * y * scale;
      data[offset + 3] = largeIndices.has(index) ? 1 : 0;
    }

    function getGeometry() {
      return { data, count, largeCount, stride: 4 };
    }

    return { getGeometry, destroy() {} };
  }

  Noseview.effects = Noseview.effects || {};
  Noseview.effects.SKY_MODES = SKY_MODES;
  Noseview.effects.normalizeSkyMode = normalizeSkyMode;
  Noseview.effects.toggleSkyMode = toggleSkyMode;
  Noseview.effects.createStarfield = createStarfield;
}(window));
