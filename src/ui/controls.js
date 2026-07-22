(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview) throw new Error("Noseview namespace must load before controls.js");

  const keyMap = {
    KeyW: "forward",
    KeyS: "backward",
    KeyA: "strafeLeft",
    KeyD: "strafeRight",
    ArrowLeft: "turnLeft",
    ArrowRight: "turnRight",
    ArrowUp: "lookUp",
    ArrowDown: "lookDown"
  };

  function createControls(options) {
    const documentRoot = options.documentRoot || root.document;
    const windowRoot = options.windowRoot || root;
    const engine = options.engine;
    const hud = options.hud;
    const settingsButton = documentRoot.getElementById("settings-button");
    const settingsModal = documentRoot.getElementById("settings-modal");
    const settingsClose = documentRoot.getElementById("settings-close");
    const hudButton = documentRoot.getElementById("hud-button");
    const analogButton = documentRoot.getElementById("analog-button");
    const rainButton = documentRoot.getElementById("digital-rain-button");
    const speedButton = documentRoot.getElementById("speed-button");
    const soundButton = documentRoot.getElementById("sound-button");
    const resetButton = documentRoot.getElementById("reset-button");
    const regenerateButton = documentRoot.getElementById("regen-button");
    const cleanups = [];
    const activeControls = {};
    const heldKeys = new Set();
    const suppressedKeys = new Set();
    Noseview.flight.CONTROL_NAMES.forEach(name => { activeControls[name] = false; });
    let destroyed = false;
    let previousSettingsFocus = null;
    let hudEnabled = true;
    let analogEnabled = false;
    let rainEnabled = false;
    let soundEnabled = false;
    let soundAvailable = true;
    let soundPending = false;

    function listen(target, type, handler, listenerOptions) {
      target.addEventListener(type, handler, listenerOptions);
      cleanups.push(() => target.removeEventListener(type, handler, listenerOptions));
    }

    function setControl(action, active) {
      if (destroyed) return;
      activeControls[action] = Boolean(active);
      engine.setControl(action, activeControls[action]);
      documentRoot.querySelectorAll(`[data-action="${action}"]`).forEach(button => {
        button.classList.toggle("is-active", activeControls[action]);
      });
    }

    function clearControls() {
      Object.keys(activeControls).forEach(action => setControl(action, false));
    }

    function clearInputs() {
      heldKeys.forEach(code => suppressedKeys.add(code));
      clearControls();
    }

    function clearInputsForBlur() {
      heldKeys.clear();
      suppressedKeys.clear();
      clearControls();
    }

    function updateToggleButton(button, label, enabled) {
      button.classList.toggle("is-active", enabled);
      button.setAttribute("aria-pressed", String(enabled));
      button.textContent = `${label}: ${enabled ? "ON" : "OFF"}`;
    }

    function updateSoundButton() {
      soundButton.disabled = !soundAvailable;
      soundButton.classList.toggle("is-active", soundEnabled && soundAvailable);
      soundButton.setAttribute("aria-pressed", String(soundEnabled && soundAvailable));
      soundButton.textContent = soundAvailable ? `SOUND: ${soundEnabled ? "ON" : "OFF"}` : "SOUND: N/A";
    }

    function updateTelemetry(snapshot) {
      if (destroyed) return;
      hudEnabled = snapshot.effects.hud;
      analogEnabled = snapshot.effects.analogVision;
      rainEnabled = snapshot.effects.digitalRain;
      soundEnabled = snapshot.sound.enabled;
      soundAvailable = snapshot.sound.available;
      updateToggleButton(hudButton, "HUD", hudEnabled);
      updateToggleButton(analogButton, "ANALOG VISION", analogEnabled);
      updateToggleButton(rainButton, "DIGITAL RAIN", rainEnabled);
      updateSoundButton();
      speedButton.textContent = `SPEED: ${snapshot.speed.name}`;
    }

    documentRoot.querySelectorAll("[data-action]").forEach(button => {
      const action = button.dataset.action;
      const pointerDown = event => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        setControl(action, true);
      };
      const pointerStop = event => {
        event.preventDefault();
        setControl(action, false);
      };
      const lostCapture = () => setControl(action, false);
      const contextMenu = event => event.preventDefault();
      listen(button, "pointerdown", pointerDown);
      listen(button, "pointerup", pointerStop);
      listen(button, "pointercancel", pointerStop);
      listen(button, "lostpointercapture", lostCapture);
      listen(button, "contextmenu", contextMenu);
    });

    function handleKeyDown(event) {
      if (!settingsModal.hidden) return;
      if (keyMap[event.code]) {
        event.preventDefault();
        heldKeys.add(event.code);
        if (!suppressedKeys.has(event.code)) setControl(keyMap[event.code], true);
      }
      if (!event.repeat && event.code === "KeyR") {
        clearInputs();
        engine.resetCamera();
      }
      if (!event.repeat && event.code === "KeyF") {
        const speed = engine.cycleSpeed();
        speedButton.textContent = `SPEED: ${speed.name}`;
      }
    }

    function handleKeyUp(event) {
      if (!keyMap[event.code]) return;
      event.preventDefault();
      heldKeys.delete(event.code);
      suppressedKeys.delete(event.code);
      setControl(keyMap[event.code], false);
    }

    listen(windowRoot, "keydown", handleKeyDown);
    listen(windowRoot, "keyup", handleKeyUp);
    listen(windowRoot, "blur", clearInputsForBlur);

    function getSettingsFocusables() {
      return Array.from(settingsModal.querySelectorAll("button:not(:disabled)"));
    }

    function openSettings() {
      previousSettingsFocus = documentRoot.activeElement;
      clearInputs();
      settingsModal.hidden = false;
      settingsClose.focus();
    }

    function closeSettings() {
      if (settingsModal.hidden) return;
      settingsModal.hidden = true;
      const focusTarget = previousSettingsFocus && typeof previousSettingsFocus.focus === "function"
        ? previousSettingsFocus
        : settingsButton;
      focusTarget.focus();
    }

    function handleSettingsClick(event) {
      if (event.target === settingsModal) closeSettings();
    }

    function handleSettingsKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSettings();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = getSettingsFocusables();
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && documentRoot.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentRoot.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    listen(settingsButton, "click", openSettings);
    listen(settingsClose, "click", closeSettings);
    listen(settingsModal, "click", handleSettingsClick);
    listen(settingsModal, "keydown", handleSettingsKeyDown);
    listen(resetButton, "click", () => {
      clearInputs();
      engine.resetCamera();
    });
    listen(regenerateButton, "click", () => {
      clearInputs();
      engine.regenerateCity();
    });
    listen(speedButton, "click", () => {
      const speed = engine.cycleSpeed();
      speedButton.textContent = `SPEED: ${speed.name}`;
    });
    listen(hudButton, "click", () => {
      hudEnabled = engine.setEffect("hud", !hudEnabled);
      hud.setVisible(hudEnabled);
      updateToggleButton(hudButton, "HUD", hudEnabled);
    });
    listen(analogButton, "click", () => {
      analogEnabled = engine.setEffect("analogVision", !analogEnabled);
      updateToggleButton(analogButton, "ANALOG VISION", analogEnabled);
    });
    listen(rainButton, "click", () => {
      rainEnabled = engine.setEffect("digitalRain", !rainEnabled);
      updateToggleButton(rainButton, "DIGITAL RAIN", rainEnabled);
    });
    listen(soundButton, "click", async () => {
      if (!soundAvailable || soundPending) return;
      soundPending = true;
      soundEnabled = await engine.setSoundEnabled(!soundEnabled);
      soundPending = false;
      updateSoundButton();
    });

    function destroy() {
      if (destroyed) return;
      clearControls();
      heldKeys.clear();
      suppressedKeys.clear();
      destroyed = true;
      settingsModal.hidden = true;
      cleanups.splice(0).reverse().forEach(cleanup => cleanup());
    }

    return { updateTelemetry, clearInputs, destroy };
  }

  Noseview.ui.createControls = createControls;
}(window));
