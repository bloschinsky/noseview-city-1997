(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview) throw new Error("Noseview namespace must load before navigation-signal.js");

  function createNavigationSignal(options) {
    const container = options.container;
    const canvas = options.canvas;
    const reducedMotion = options.reducedMotion;
    const context = canvas.getContext("2d");
    const noiseImage = context ? context.createImageData(canvas.width, canvas.height) : null;
    let destroyed = false;
    let staticFrameDrawn = false;

    function drawNoise() {
      if (!context || !noiseImage) return;
      const data = noiseImage.data;
      for (let offset = 0; offset < data.length; offset += 4) {
        const intensity = 45 + Math.floor(Math.random() * 211);
        data[offset] = Math.floor(intensity * 0.18);
        data[offset + 1] = intensity;
        data[offset + 2] = Math.floor(intensity * 0.48);
        data[offset + 3] = 38 + Math.floor(Math.random() * 92);
      }
      context.putImageData(noiseImage, 0, 0);
    }

    function update(navigation) {
      if (destroyed) return;
      const active = navigation.state !== "SAFE";
      container.classList.toggle("navigation-degraded", active);
      if (!active) {
        staticFrameDrawn = false;
        container.style.removeProperty("--navigation-noise-opacity");
        if (context) context.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const opacity = reducedMotion.matches
        ? (navigation.state === "CRITICAL" ? 0.24 : 0.12)
        : Math.min(0.42, 0.06 + navigation.degradation * 0.36);
      container.style.setProperty("--navigation-noise-opacity", opacity.toFixed(3));
      if (!reducedMotion.matches || !staticFrameDrawn) {
        drawNoise();
        staticFrameDrawn = true;
      }
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      container.classList.remove("navigation-degraded");
      container.style.removeProperty("--navigation-noise-opacity");
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);
    }

    return { update, destroy };
  }

  Noseview.effects.createNavigationSignal = createNavigationSignal;
}(window));
