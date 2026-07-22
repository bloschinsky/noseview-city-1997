(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview) throw new Error("Noseview namespace must load before analog-vision.js");

  function createAnalogVision(options) {
    const container = options.container;
    const glowCanvas = options.glowCanvas;
    const noiseCanvas = options.noiseCanvas;
    const reducedMotion = options.reducedMotion;
    const glowContext = glowCanvas.getContext("2d");
    const noiseContext = noiseCanvas.getContext("2d");
    const noiseImage = noiseContext
      ? noiseContext.createImageData(noiseCanvas.width, noiseCanvas.height)
      : null;
    let enabled = false;
    let destroyed = false;
    let lastNoiseFrame = 0;
    let noisePulse = 1;
    let noisePulseTarget = 1;
    let nextNoisePulseChange = 0;

    function drawNoise() {
      if (!noiseContext || !noiseImage) return;
      const data = noiseImage.data;
      const width = noiseCanvas.width;
      for (let y = 0; y < noiseCanvas.height; y += 1) {
        const rowStrength = Math.random() < 0.08 ? 1.2 : 0.82 + Math.random() * 0.36;
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const intensity = Math.min(255, Math.floor((55 + Math.random() * 200) * rowStrength));
          data[offset] = Math.floor(intensity * 0.12);
          data[offset + 1] = intensity;
          data[offset + 2] = Math.floor(intensity * 0.3);
          data[offset + 3] = 30 + Math.floor(Math.random() * 76);
        }
      }
      noiseContext.putImageData(noiseImage, 0, 0);
    }

    function setEnabled(nextEnabled) {
      if (destroyed) return false;
      enabled = Boolean(nextEnabled);
      container.classList.toggle("analog-vision", enabled);
      if (enabled) {
        lastNoiseFrame = 0;
        noisePulse = 1;
        noisePulseTarget = 0.9 + Math.random() * 0.2;
        nextNoisePulseChange = root.performance.now() + 700 + Math.random() * 1100;
      } else {
        if (glowContext) glowContext.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
        if (noiseContext) noiseContext.clearRect(0, 0, noiseCanvas.width, noiseCanvas.height);
        container.style.removeProperty("--analog-noise-opacity");
      }
      return enabled;
    }

    function update(time, deltaTime, sourceCanvas) {
      if (!enabled || destroyed) return;
      if (glowContext) {
        glowContext.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
        glowContext.drawImage(sourceCanvas, 0, 0, glowCanvas.width, glowCanvas.height);
      }
      if (!noiseContext || !noiseImage) return;
      if (lastNoiseFrame === 0 || (!reducedMotion.matches && time - lastNoiseFrame >= 80)) {
        drawNoise();
        lastNoiseFrame = time;
      }
      if (reducedMotion.matches) {
        noisePulse = 1;
      } else {
        if (time >= nextNoisePulseChange) {
          noisePulseTarget = 0.9 + Math.random() * 0.2;
          nextNoisePulseChange = time + 700 + Math.random() * 1100;
        }
        const smoothing = 1 - Math.exp(-deltaTime * 2.2);
        noisePulse += (noisePulseTarget - noisePulse) * smoothing;
      }
      container.style.setProperty("--analog-noise-opacity", (0.11 * noisePulse).toFixed(4));
    }

    function destroy() {
      if (destroyed) return;
      setEnabled(false);
      destroyed = true;
    }

    return { setEnabled, update, destroy };
  }

  Noseview.effects.createAnalogVision = createAnalogVision;
}(window));
