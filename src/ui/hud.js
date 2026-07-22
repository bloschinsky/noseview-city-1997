(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview) throw new Error("Noseview namespace must load before hud.js");

  function normalizeHeading(degrees) {
    return (degrees + 3600) % 360;
  }

  function formatHeading(degrees) {
    return String(Math.round(normalizeHeading(degrees))).padStart(3, "0");
  }

  function createHud(documentRoot, canvasWrap) {
    const elements = {
      x: documentRoot.getElementById("pos-x"),
      y: documentRoot.getElementById("pos-y"),
      z: documentRoot.getElementById("pos-z"),
      heading: documentRoot.getElementById("heading"),
      pitch: documentRoot.getElementById("pitch"),
      speed: documentRoot.getElementById("speed"),
      fps: documentRoot.getElementById("fps"),
      buildings: documentRoot.getElementById("building-count"),
      hudAlt: documentRoot.getElementById("hud-alt"),
      hudHeading: documentRoot.getElementById("hud-hdg")
    };

    function update(snapshot) {
      const heading = formatHeading(snapshot.headingDegrees);
      elements.x.textContent = snapshot.position.x.toFixed(1);
      elements.y.textContent = snapshot.position.y.toFixed(1);
      elements.z.textContent = snapshot.position.z.toFixed(1);
      elements.heading.textContent = heading;
      elements.pitch.textContent = Math.round(snapshot.pitchDegrees).toString();
      elements.speed.textContent = String(snapshot.speed.move);
      elements.fps.textContent = Math.round(Math.min(snapshot.fps, 999)).toString();
      elements.buildings.textContent = String(snapshot.buildingCount);
      elements.hudAlt.textContent = `ALT. ${snapshot.position.y.toFixed(2)}`;
      elements.hudHeading.textContent = `HDG. ${heading}`;
      setVisible(snapshot.effects.hud);
    }

    function setVisible(enabled) {
      canvasWrap.classList.toggle("hud-hidden", !enabled);
    }

    function destroy() {
      // HUD owns no listeners or timers.
    }

    return { update, setVisible, destroy };
  }

  Noseview.ui.normalizeHeading = normalizeHeading;
  Noseview.ui.formatHeading = formatHeading;
  Noseview.ui.createHud = createHud;
}(window));
