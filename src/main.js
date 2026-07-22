(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  const documentRoot = root.document;
  const canvas = documentRoot.getElementById("gl-canvas");
  const canvasWrap = documentRoot.querySelector(".canvas-wrap");
  const errorBox = documentRoot.getElementById("webgl-error");
  const reducedMotion = root.matchMedia("(prefers-reduced-motion: reduce)");
  const analogVision = Noseview.effects.createAnalogVision({
    container: canvasWrap,
    glowCanvas: documentRoot.getElementById("analog-glow-canvas"),
    noiseCanvas: documentRoot.getElementById("analog-noise-canvas"),
    reducedMotion
  });
  const digitalRain = Noseview.effects.createDigitalRain({ documentRoot, reducedMotion });
  const music = Noseview.audio.createMusic({
    documentRoot,
    onError(error) { root.console.error(error); }
  });
  let engine = null;
  let hud = null;
  let controls = null;
  let destroyed = false;

  function showError(error) {
    errorBox.style.display = "block";
    if (error && error.code === "WEBGL_CONTEXT_LOST") {
      errorBox.innerHTML = "*** SIGNAL LOST ***<br><br>WEBGL CONTEXT DISCONNECTED.";
    } else {
      const message = error && error.message ? error.message : "UNKNOWN NAVIGATION FAILURE.";
      errorBox.innerHTML = "*** SYSTEM FAILURE ***<br><br>" + message;
    }
  }

  async function destroyApp() {
    if (destroyed) return;
    destroyed = true;
    root.removeEventListener("pagehide", destroyApp);
    if (controls) controls.destroy();
    if (hud) hud.destroy();
    if (engine) {
      await engine.destroy();
    } else {
      analogVision.destroy();
      digitalRain.destroy();
      await music.destroy();
    }
  }

  try {
    engine = Noseview.createNoseviewEngine(canvas, {
      analogVision,
      digitalRain,
      music,
      onTelemetry(snapshot) {
        if (hud) hud.update(snapshot);
        if (controls) controls.updateTelemetry(snapshot);
      },
      onMissionEvent() {},
      onError: showError
    });
    hud = Noseview.ui.createHud(documentRoot, canvasWrap);
    controls = Noseview.ui.createControls({ documentRoot, windowRoot: root, engine, hud });
    root.addEventListener("pagehide", destroyApp);
    engine.start();
  } catch (error) {
    showError(error);
    destroyApp();
  }
}(window));
