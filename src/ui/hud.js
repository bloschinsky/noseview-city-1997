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

  const COMPLETION_DISMISS_DELAY_MS = 5000;

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
      hudHeading: documentRoot.getElementById("hud-hdg"),
      navigationAlert: documentRoot.getElementById("navigation-alert"),
      navigationMessage: documentRoot.getElementById("navigation-message"),
      navigationCountdown: documentRoot.getElementById("navigation-countdown"),
      navigationStatus: documentRoot.getElementById("navigation-status"),
      missionMode: documentRoot.getElementById("mission-mode"),
      missionTimer: documentRoot.getElementById("mission-timer"),
      missionProgress: documentRoot.getElementById("mission-progress"),
      missionLock: documentRoot.getElementById("mission-lock"),
      missionLockFrame: documentRoot.getElementById("mission-lock-frame"),
      missionComplete: documentRoot.getElementById("mission-complete"),
      missionCompleteTitle: documentRoot.getElementById("mission-complete-title"),
      missionCompleteStats: documentRoot.getElementById("mission-complete-stats")
    };
    let previousCamera = null;
    let completionKey = null;
    let completionDismissed = false;
    let completionDismissTimer = null;

    const navigationLabels = {
      SAFE: "ONLINE",
      WARNING: "NAVIGATION LIMIT",
      CRITICAL: "OUT OF NAVIGATION AREA"
    };

    function updateNavigation(navigation) {
      const label = navigationLabels[navigation.state] || navigationLabels.SAFE;
      const active = navigation.state !== "SAFE";
      elements.navigationAlert.hidden = !active;
      elements.navigationMessage.textContent = active ? label : "";
      elements.navigationStatus.textContent = label;
      elements.navigationStatus.classList.toggle("blink", !active);
      elements.navigationStatus.classList.toggle("is-warning", navigation.state === "WARNING");
      elements.navigationStatus.classList.toggle("is-critical", navigation.state === "CRITICAL");
      if (navigation.state === "CRITICAL" && navigation.countdownSeconds !== null) {
        elements.navigationCountdown.hidden = false;
        elements.navigationCountdown.textContent = `RETURN IN ${navigation.countdownSeconds.toFixed(1)}`;
      } else {
        elements.navigationCountdown.hidden = true;
        elements.navigationCountdown.textContent = "";
      }
    }

    function clearCompletionDismissTimer() {
      if (completionDismissTimer !== null) {
        documentRoot.defaultView.clearTimeout(completionDismissTimer);
        completionDismissTimer = null;
      }
    }

    function cameraChanged(previous, current) {
      return Math.abs(previous.position.x - current.position.x) > 0.0001 ||
        Math.abs(previous.position.y - current.position.y) > 0.0001 ||
        Math.abs(previous.position.z - current.position.z) > 0.0001 ||
        Math.abs(previous.headingDegrees - current.headingDegrees) > 0.0001 ||
        Math.abs(previous.pitchDegrees - current.pitchDegrees) > 0.0001;
    }

    function updateMissionCompletion(completion, mission, snapshot) {
      if (!completion) {
        clearCompletionDismissTimer();
        completionKey = null;
        completionDismissed = false;
        previousCamera = snapshot;
        return;
      }

      const nextCompletionKey = `${completion.acquiredTargets}/${completion.totalTargets}/${completion.elapsedSeconds}`;
      const isNewCompletion = nextCompletionKey !== completionKey;
      if (isNewCompletion) {
        clearCompletionDismissTimer();
        completionKey = nextCompletionKey;
        completionDismissed = false;
      }

      if (!isNewCompletion && !completionDismissed && completionDismissTimer === null &&
          mission.mode === "SUCCESS" && previousCamera && cameraChanged(previousCamera, snapshot)) {
        completionDismissTimer = documentRoot.defaultView.setTimeout(() => {
          completionDismissed = true;
          completionDismissTimer = null;
          if (elements.missionComplete) elements.missionComplete.hidden = true;
        }, COMPLETION_DISMISS_DELAY_MS);
      }
      previousCamera = snapshot;
    }

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
      updateNavigation(snapshot.navigation);
      // Mission status — plain text, stays readable without optional effects
      const mission = snapshot.mission || {
        mode: "IDLE",
        timeRemaining: null,
        totalTargets: 0,
        acquiredTargets: 0,
        lock: { active: false, progress: 0 }
      };
      if (elements.missionMode) elements.missionMode.textContent = mission.mode || "IDLE";
      if (elements.missionProgress) elements.missionProgress.textContent = `${mission.acquiredTargets || 0}/${mission.totalTargets || 0}`;
      if (elements.missionTimer) {
        const t = mission.timeRemaining;
        elements.missionTimer.textContent = (t === null || t === undefined) ? "--" : t.toFixed(1);
      }
      const lock = mission.lock || (mission.scan && mission.scan.lock) || { active: false, progress: 0 };
      const lockProgress = clamp01(lock.progress);
      if (elements.missionLock) {
        elements.missionLock.textContent = lock.active ? `${Math.round(lockProgress * 100)}%` : "--";
      }
      if (elements.missionLockFrame) {
        elements.missionLockFrame.hidden = !lock.active;
        elements.missionLockFrame.style.setProperty("--lock-progress", String(lockProgress));
        elements.missionLockFrame.style.setProperty("--lock-width", `${Math.max(8, 96 * (1 - lockProgress))}px`);
        elements.missionLockFrame.style.setProperty("--lock-height", `${Math.max(8, 72 * (1 - lockProgress))}px`);
      }
      const completion = mission.completion;
      updateMissionCompletion(completion, mission, snapshot);
      if (elements.missionComplete) {
        elements.missionComplete.hidden = !completion || completionDismissed;
        if (completion && elements.missionCompleteTitle && elements.missionCompleteStats) {
          elements.missionCompleteTitle.textContent = "MISSION COMPLETE";
          elements.missionCompleteStats.textContent = `TARGETS: ${completion.acquiredTargets}/${completion.totalTargets} // TIME: ${completion.elapsedSeconds.toFixed(1)} SEC`;
        }
      }
      setVisible(snapshot.effects.hud);
    }

    function clamp01(v) { return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0)); }

    function setVisible(enabled) {
      canvasWrap.classList.toggle("hud-hidden", !enabled);
    }

    function destroy() {
      clearCompletionDismissTimer();
    }

    return { update, setVisible, destroy };
  }

  Noseview.ui.normalizeHeading = normalizeHeading;
  Noseview.ui.formatHeading = formatHeading;
  Noseview.ui.createHud = createHud;
}(window));
