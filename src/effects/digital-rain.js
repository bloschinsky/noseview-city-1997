(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview) throw new Error("Noseview namespace must load before digital-rain.js");

  const glyphs = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<>[]{}\\/|:;*+-=";
  const columnWidth = 7;
  const glyphFontSize = 12;
  const glyphHeight = 15;
  const glyphScaleX = 0.58;
  const glyphScaleY = 1.25;

  function createDigitalRain(options) {
    const settings = options || {};
    const documentRoot = settings.documentRoot || root.document;
    const reducedMotion = settings.reducedMotion || root.matchMedia("(prefers-reduced-motion: reduce)");
    const canvas = documentRoot.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    let enabled = false;
    let destroyed = false;
    let columns = [];
    let lastFrame = 0;
    let staticFrameDrawn = false;

    if (context) {
      context.fillStyle = "#000000";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    function makeColumn(index, initial, time) {
      return {
        x: index * columnWidth + columnWidth / 2,
        y: initial ? Math.random() * canvas.height : -Math.random() * canvas.height * 0.6,
        speed: 65 + Math.random() * 105,
        baseTrail: 18 + Math.floor(Math.random() * 13),
        lengthScale: 0.8 + Math.random() * 0.4,
        lengthTarget: 0.8 + Math.random() * 0.4,
        nextLengthChange: time + 900 + Math.random() * 1300,
        active: Math.random() > 0.06
      };
    }

    function initialize() {
      const time = root.performance.now();
      const columnCount = Math.floor(canvas.width / columnWidth);
      columns = Array.from({ length: columnCount }, (_, index) => makeColumn(index, true, time));
      lastFrame = 0;
      staticFrameDrawn = false;
    }

    function randomGlyph() {
      return glyphs[Math.floor(Math.random() * glyphs.length)];
    }

    function draw() {
      if (!context) return;
      context.fillStyle = "#000000";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.setTransform(glyphScaleX, 0, 0, glyphScaleY, 0, 0);
      context.font = `bold ${glyphFontSize}px "Courier New", monospace`;
      context.textAlign = "center";
      context.textBaseline = "top";
      columns.forEach(column => {
        if (!column.active) return;
        const trailLength = Math.max(1, Math.round(column.baseTrail * column.lengthScale));
        for (let trailIndex = trailLength - 1; trailIndex >= 0; trailIndex -= 1) {
          const y = column.y - trailIndex * glyphHeight;
          if (y < -glyphHeight || y > canvas.height) continue;
          if (trailIndex === 0) {
            context.fillStyle = "#c8ffda";
            context.shadowColor = "#00ff66";
            context.shadowBlur = 7;
          } else {
            const strength = Math.pow(1 - trailIndex / trailLength, 1.35);
            context.fillStyle = `rgba(20, 255, 95, ${0.08 + strength * 0.72})`;
            context.shadowBlur = 0;
          }
          context.fillText(randomGlyph(), column.x / glyphScaleX, y / glyphScaleY);
        }
      });
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.shadowBlur = 0;
    }

    function setEnabled(nextEnabled) {
      if (destroyed) return false;
      enabled = Boolean(nextEnabled);
      if (enabled) initialize();
      return enabled;
    }

    function update(time) {
      if (!enabled || destroyed || !context) return false;
      if (reducedMotion.matches && staticFrameDrawn) return false;
      if (!reducedMotion.matches && lastFrame !== 0 && time - lastFrame < 50) return false;
      const elapsed = lastFrame === 0 ? 0 : Math.min((time - lastFrame) / 1000, 0.1);
      if (!reducedMotion.matches) {
        columns = columns.map((column, index) => {
          if (time >= column.nextLengthChange) {
            column.lengthTarget = 0.8 + Math.random() * 0.4;
            column.nextLengthChange = time + 900 + Math.random() * 1300;
          }
          const smoothing = 1 - Math.exp(-elapsed * 1.8);
          column.lengthScale += (column.lengthTarget - column.lengthScale) * smoothing;
          column.y += column.speed * elapsed;
          const trailLength = column.baseTrail * column.lengthScale;
          if (column.y - trailLength * glyphHeight > canvas.height) {
            return makeColumn(index, false, time);
          }
          return column;
        });
      }
      draw();
      if (reducedMotion.matches) staticFrameDrawn = true;
      lastFrame = time;
      return true;
    }

    function getCanvas() {
      return canvas;
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      columns = [];
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    }

    return { setEnabled, update, getCanvas, destroy };
  }

  Noseview.effects.createDigitalRain = createDigitalRain;
}(window));
