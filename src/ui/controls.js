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
    const starfieldButton = documentRoot.getElementById("starfield-button");
    const speedButton = documentRoot.getElementById("speed-button");
    const soundButton = documentRoot.getElementById("sound-button");
    const hullIntegrityButton = documentRoot.getElementById("hull-integrity-button");
    const fuelEnduranceButton = documentRoot.getElementById("fuel-endurance-button");
    const resetButton = documentRoot.getElementById("reset-button");
    const regenerateButton = documentRoot.getElementById("regen-button");
    const canvas = documentRoot.getElementById("gl-canvas");
    const missionsButton = documentRoot.getElementById("missions-button");
    const missionsModal = documentRoot.getElementById("missions-modal");
    const missionsClose = documentRoot.getElementById("missions-close");
    const missionsCatalog = documentRoot.getElementById("missions-catalog");
    const missionComplete = documentRoot.getElementById("mission-complete");
    const missionReplayButton = documentRoot.getElementById("mission-replay-button");
    const missionNewCityButton = documentRoot.getElementById("mission-new-city-button");
    const gameOverDialog = documentRoot.getElementById("game-over");
    const gameRestartButton = documentRoot.getElementById("game-restart-button");
    const cleanups = [];
    const activeControls = {};
    const heldKeys = new Set();
    const suppressedKeys = new Set();
    Noseview.flight.CONTROL_NAMES.forEach(name => { activeControls[name] = false; });
    let destroyed = false;
    let previousSettingsFocus = null;
    let missionsOpen = false;
    let previousCompletionFocus = null;
    let completionOpen = false;
    let previousGameOverFocus = null;
    let gameOverOpen = false;
    let hudEnabled = true;
    let analogEnabled = false;
    let skyMode = "none";
    let soundEnabled = false;
    let soundAvailable = true;
    let soundPending = false;
    let hullIntegrityEnabled = false;
    let fuelEnduranceEnabled = false;
    let latestMissionSnapshot = { mode: "IDLE", acquiredTargets: 0, totalTargets: 0 };

    // This intentionally small catalog keeps DOM wiring separate from future mission rules.
    const missionCatalog = [{
      id: "signal-hunt",
      label: "SIGNAL HUNT",
      description: "Locate and scan all signals before time expires.",
      getState(mission) {
        const mode = mission.mode || "IDLE";
        if (mode === "ACTIVE") return `ACTIVE // TARGETS: ${mission.acquiredTargets || 0}/${mission.totalTargets || 0}`;
        if (mode === "COMPLETE") return "COMPLETE // READY TO REPLAY";
        if (mode === "FAILED") return "FAILED // READY TO REPLAY";
        if (mode === "ABORTED") return "ABORTED // READY TO REPLAY";
        return "READY // FREE FLIGHT";
      },
      getActions(mission) {
        if ((mission.mode || "IDLE") === "ACTIVE") {
          return [{ id: "abort", label: "ABORT MISSION", run() { engine.abortSignalHunt(); } }];
        }
        if ((mission.mode || "IDLE") === "IDLE") {
          return [{ id: "start", label: "START SIGNAL HUNT", run() { engine.startSignalHunt(); } }];
        }
        return [{ id: "replay", label: "REPLAY MISSION", run() { engine.replaySignalHunt(); } }];
      }
    }];

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

    function syncSkyMode(mode) {
      skyMode = mode === "digitalRain" || mode === "starfield" ? mode : "none";
      updateToggleButton(rainButton, "DIGITAL RAIN", skyMode === "digitalRain");
      updateToggleButton(starfieldButton, "STARFIELD", skyMode === "starfield");
    }

    function toggleSkyMode(selectedMode) {
      const nextMode = skyMode === selectedMode ? "none" : selectedMode;
      skyMode = engine.setSkyMode(nextMode);
      syncSkyMode(skyMode);
    }

    function renderMissionCatalog() {
      if (!missionsCatalog) return;
      missionsCatalog.textContent = "";
      missionCatalog.forEach(descriptor => {
        const entry = documentRoot.createElement("section");
        entry.className = "mission-catalog-entry";
        entry.dataset.missionId = descriptor.id;
        const title = documentRoot.createElement("h2");
        title.textContent = descriptor.label;
        const description = documentRoot.createElement("p");
        description.textContent = descriptor.description;
        const state = documentRoot.createElement("p");
        state.className = "mission-catalog-state";
        state.dataset.missionState = descriptor.id;
        const actions = documentRoot.createElement("div");
        actions.className = "mission-catalog-actions";
        actions.dataset.missionActions = descriptor.id;
        entry.append(title, description, state, actions);
        missionsCatalog.appendChild(entry);
      });
      updateMissionCatalog(latestMissionSnapshot);
    }

    function updateMissionCatalog(mission) {
      if (!missionsCatalog) return;
      missionCatalog.forEach(descriptor => {
        const state = missionsCatalog.querySelector(`[data-mission-state="${descriptor.id}"]`);
        const actions = missionsCatalog.querySelector(`[data-mission-actions="${descriptor.id}"]`);
        if (state) state.textContent = `STATUS: ${descriptor.getState(mission)}`;
        if (!actions) return;
        const nextActions = descriptor.getActions(mission);
        const actionSignature = nextActions.map(action => `${action.id}:${action.label}`).join("|");
        if (!nextActions.length) {
          actions.textContent = "";
          actions.dataset.missionActionSignature = "";
        } else if (actions.dataset.missionActionSignature === actionSignature) {
          Array.from(actions.querySelectorAll("button")).forEach(button => { button.disabled = false; });
        } else {
          actions.textContent = "";
          actions.dataset.missionActionSignature = actionSignature;
          nextActions.forEach(nextAction => {
            const button = documentRoot.createElement("button");
            button.type = "button";
            button.dataset.missionId = descriptor.id;
            button.dataset.missionAction = nextAction.id;
            button.textContent = nextAction.label;
            actions.appendChild(button);
          });
        }
      });
    }

    function updateMissionButtons(snapshot, blockedByGameOver) {
      const mission = snapshot.mission || { mode: "IDLE" };
      latestMissionSnapshot = mission;
      updateMissionCatalog(mission);
      syncCompletionDialog((mission.mode || "IDLE") === "COMPLETE" && !blockedByGameOver);
    }

    function getCompletionFocusables() {
      if (!missionComplete) return [];
      return Array.from(missionComplete.querySelectorAll("button:not(:disabled)"));
    }

    function isFocusAvailable(element) {
      return Boolean(element) &&
        typeof element.focus === "function" &&
        !element.disabled &&
        !element.closest("[hidden]");
    }

    function syncCompletionDialog(shouldOpen) {
      if (!missionComplete || shouldOpen === completionOpen) return;
      completionOpen = shouldOpen;
      if (completionOpen) {
        const settingsWasOpen = settingsModal && !settingsModal.hidden;
        const missionsWasOpen = missionsOpen;
        previousCompletionFocus = settingsWasOpen ? settingsButton : (missionsWasOpen ? missionsButton : documentRoot.activeElement);
        if (settingsWasOpen) dismissSettings();
        if (missionsWasOpen) dismissMissions();
        clearInputs();
        const focusables = getCompletionFocusables();
        if (focusables[0]) focusables[0].focus();
      } else {
        const previousFocusAvailable = isFocusAvailable(previousCompletionFocus) &&
          !missionComplete.contains(previousCompletionFocus) &&
          previousCompletionFocus !== documentRoot.body;
        const focusTarget = previousFocusAvailable
          ? previousCompletionFocus
          : (missionsButton || canvas || settingsButton);
        previousCompletionFocus = null;
        if (focusTarget) focusTarget.focus();
      }
    }

    function getGameOverFocusables() {
      if (!gameOverDialog) return [];
      return Array.from(gameOverDialog.querySelectorAll("button:not(:disabled)"));
    }

    function dismissCompletion() {
      if (!missionComplete || !completionOpen) return;
      missionComplete.hidden = true;
      completionOpen = false;
      previousCompletionFocus = null;
    }

    function syncGameOverDialog(shouldOpen) {
      if (!gameOverDialog || shouldOpen === gameOverOpen) return;
      gameOverOpen = shouldOpen;
      gameOverDialog.hidden = !shouldOpen;
      if (shouldOpen) {
        const settingsWasOpen = settingsModal && !settingsModal.hidden;
        const missionsWasOpen = missionsOpen;
        previousGameOverFocus = settingsWasOpen ? settingsButton : (missionsWasOpen ? missionsButton : documentRoot.activeElement);
        if (settingsWasOpen) dismissSettings();
        if (missionsWasOpen) dismissMissions();
        if (completionOpen) dismissCompletion();
        clearInputs();
        const focusables = getGameOverFocusables();
        if (focusables[0]) focusables[0].focus();
      } else {
        const previousFocusAvailable = isFocusAvailable(previousGameOverFocus) &&
          !gameOverDialog.contains(previousGameOverFocus) &&
          previousGameOverFocus !== documentRoot.body;
        const focusTarget = previousFocusAvailable ? previousGameOverFocus : (missionsButton || settingsButton);
        previousGameOverFocus = null;
        if (focusTarget) focusTarget.focus();
      }
    }

    function updateTelemetry(snapshot) {
      if (destroyed) return;
      hudEnabled = snapshot.effects.hud;
      analogEnabled = snapshot.effects.analogVision;
      syncSkyMode(snapshot.effects.skyMode);
      soundEnabled = snapshot.sound.enabled;
      soundAvailable = snapshot.sound.available;
      const integrity = snapshot.integrity || { enabled: false, gameOver: false };
      const fuel = snapshot.fuel || { enabled: false, gameOver: false };
      const survival = snapshot.survival || { gameOver: Boolean(integrity.gameOver || fuel.gameOver) };
      hullIntegrityEnabled = Boolean(integrity.enabled);
      fuelEnduranceEnabled = Boolean(fuel.enabled);
      updateToggleButton(hudButton, "HUD", hudEnabled);
      updateToggleButton(analogButton, "ANALOG VISION", analogEnabled);
      updateSoundButton();
      if (hullIntegrityButton) {
        updateToggleButton(hullIntegrityButton, "HULL INTEGRITY", hullIntegrityEnabled);
      }
      if (fuelEnduranceButton) {
        updateToggleButton(fuelEnduranceButton, "FUEL ENDURANCE", fuelEnduranceEnabled);
      }
      speedButton.textContent = `SPEED: ${snapshot.speed.name}`;
      updateMissionButtons(snapshot, Boolean(survival.gameOver));
      syncGameOverDialog(Boolean(survival.gameOver));
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
      if (!settingsModal.hidden || missionsOpen || completionOpen || gameOverOpen) return;
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
      if (completionOpen || gameOverOpen) return;
      const missionsWasOpen = missionsOpen;
      if (missionsWasOpen) dismissMissions();
      previousSettingsFocus = missionsWasOpen ? settingsButton : documentRoot.activeElement;
      clearInputs();
      settingsModal.hidden = false;
      settingsClose.focus();
    }

    function dismissSettings() {
      if (!settingsModal || settingsModal.hidden) return;
      settingsModal.hidden = true;
      previousSettingsFocus = null;
    }

    function closeSettings() {
      if (settingsModal.hidden) return;
      settingsModal.hidden = true;
      const focusTarget = previousSettingsFocus && typeof previousSettingsFocus.focus === "function"
        ? previousSettingsFocus
        : settingsButton;
      focusTarget.focus();
    }

    function getMissionsFocusables() {
      if (!missionsModal) return [];
      return Array.from(missionsModal.querySelectorAll("button:not(:disabled)"));
    }

    function dismissMissions() {
      if (!missionsModal || !missionsOpen) return;
      missionsModal.hidden = true;
      missionsOpen = false;
    }

    function closeMissions(focusTarget) {
      if (!missionsModal || !missionsOpen) return;
      missionsModal.hidden = true;
      missionsOpen = false;
      const target = focusTarget || missionsButton;
      if (target && typeof target.focus === "function") target.focus();
    }

    function openMissions() {
      if (!missionsModal || completionOpen || gameOverOpen) return;
      const settingsWasOpen = settingsModal && !settingsModal.hidden;
      if (settingsWasOpen) dismissSettings();
      clearInputs();
      renderMissionCatalog();
      missionsModal.hidden = false;
      missionsOpen = true;
      if (missionsClose) missionsClose.focus();
    }

    function handleMissionsClick(event) {
      if (event.target === missionsModal) {
        closeMissions();
        return;
      }
      const actionButton = event.target.closest("[data-mission-action]");
      if (!actionButton || !missionsModal.contains(actionButton)) return;
      const descriptor = missionCatalog.find(item => item.id === actionButton.dataset.missionId);
      const action = descriptor && descriptor.getActions(latestMissionSnapshot)
        .find(item => item.id === actionButton.dataset.missionAction);
      if (!action || typeof action.run !== "function") return;
      clearInputs();
      action.run();
      closeMissions(canvas || missionsButton);
    }

    function handleMissionsKeyDown(event) {
      if (!missionsOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeMissions();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = getMissionsFocusables();
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && documentRoot.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentRoot.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
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

    function handleCompletionKeyDown(event) {
      if (!completionOpen || event.key !== "Tab") return;
      const focusables = getCompletionFocusables();
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && documentRoot.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentRoot.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function handleGameOverKeyDown(event) {
      if (!gameOverOpen || event.key !== "Tab") return;
      const focusables = getGameOverFocusables();
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
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
    if (missionsButton) listen(missionsButton, "click", openMissions);
    if (missionsClose) listen(missionsClose, "click", () => closeMissions());
    if (missionsModal) {
      listen(missionsModal, "click", handleMissionsClick);
      listen(missionsModal, "keydown", handleMissionsKeyDown);
    }
    if (missionComplete) listen(missionComplete, "keydown", handleCompletionKeyDown);
    if (gameOverDialog) listen(gameOverDialog, "keydown", handleGameOverKeyDown);
    listen(resetButton, "click", () => {
      clearInputs();
      engine.resetCamera();
    });
    listen(regenerateButton, "click", () => {
      clearInputs();
      engine.regenerateCity();
    });
    if (missionReplayButton) listen(missionReplayButton, "click", () => {
      clearInputs();
      engine.replaySignalHunt();
    });
    if (missionNewCityButton) listen(missionNewCityButton, "click", () => {
      clearInputs();
      engine.regenerateCity();
    });
    if (gameRestartButton) listen(gameRestartButton, "click", () => {
      clearInputs();
      engine.restartGame();
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
      toggleSkyMode("digitalRain");
    });
    listen(starfieldButton, "click", () => {
      toggleSkyMode("starfield");
    });
    listen(soundButton, "click", async () => {
      if (!soundAvailable || soundPending) return;
      soundPending = true;
      soundEnabled = await engine.setSoundEnabled(!soundEnabled);
      soundPending = false;
      updateSoundButton();
    });
    if (hullIntegrityButton) listen(hullIntegrityButton, "click", () => {
      hullIntegrityEnabled = engine.setHullIntegrityEnabled(!hullIntegrityEnabled);
      updateToggleButton(hullIntegrityButton, "HULL INTEGRITY", hullIntegrityEnabled);
    });
    if (fuelEnduranceButton) listen(fuelEnduranceButton, "click", () => {
      fuelEnduranceEnabled = engine.setFuelEnduranceEnabled(!fuelEnduranceEnabled);
      updateToggleButton(fuelEnduranceButton, "FUEL ENDURANCE", fuelEnduranceEnabled);
    });

    function destroy() {
      if (destroyed) return;
      clearControls();
      heldKeys.clear();
      suppressedKeys.clear();
      destroyed = true;
      settingsModal.hidden = true;
      if (missionsModal) missionsModal.hidden = true;
      if (missionComplete) missionComplete.hidden = true;
      if (gameOverDialog) gameOverDialog.hidden = true;
      completionOpen = false;
      gameOverOpen = false;
      missionsOpen = false;
      previousCompletionFocus = null;
      previousGameOverFocus = null;
      cleanups.splice(0).reverse().forEach(cleanup => cleanup());
    }

    return { updateTelemetry, clearInputs, destroy };
  }

  Noseview.ui.createControls = createControls;
}(window));
