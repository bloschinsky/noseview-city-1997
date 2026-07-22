(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview) throw new Error("Noseview namespace must load before music.js");

  const tempo = 96;
  const stepDuration = 60 / tempo / 4;
  const bassPattern = [
    38, null, 38, null, 38, null, 36, null,
    38, null, 41, null, 37, null, 34, null,
    38, null, 38, null, 38, null, 36, null,
    41, null, 37, null, 34, null, 37, null
  ];
  const leadPattern = [
    null, null, null, 62, null, null, null, null,
    65, null, null, null, 61, null, null, null,
    null, null, 62, null, null, null, 58, null,
    null, 61, null, null, 57, null, null, null
  ];
  const arpeggioRoots = [50, 48, 46, 49];
  const arpeggioOffsets = [0, 3, 7, 12];
  const MUSIC_GAIN = 0.08;
  const SFX_GAIN = 0.16;

  function createMusic(options) {
    const settings = options || {};
    const documentRoot = settings.documentRoot || root.document;
    const AudioContextClass = settings.AudioContextClass || root.AudioContext || root.webkitAudioContext;
    const onError = typeof settings.onError === "function" ? settings.onError : function () {};
    let available = Boolean(AudioContextClass);
    let enabled = false;
    let destroyed = false;
    let audioContext = null;
    let musicBus = null;
    let sfxBus = null;
    let outputGate = null;
    let compressor = null;
    let percussionNoise = null;
    let teleportNoise = null;
    let scheduler = null;
    let nextStepTime = 0;
    let musicStep = 0;
    const scheduledSources = new Set();
    const navigationSources = new Set();
    const stopTimeouts = new Set();

    function midiToFrequency(note) {
      return 440 * Math.pow(2, (note - 69) / 12);
    }

    function trackSource(source, navigationCue) {
      scheduledSources.add(source);
      if (navigationCue) navigationSources.add(source);
      source.addEventListener("ended", () => {
        scheduledSources.delete(source);
        navigationSources.delete(source);
      }, { once: true });
    }

    function initializeAudio() {
      if (audioContext || !available) return;
      audioContext = new AudioContextClass();
      musicBus = audioContext.createGain();
      musicBus.gain.value = MUSIC_GAIN;
      sfxBus = audioContext.createGain();
      sfxBus.gain.value = SFX_GAIN;
      outputGate = audioContext.createGain();
      outputGate.gain.value = 0;
      compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 16;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.25;
      musicBus.connect(outputGate);
      sfxBus.connect(outputGate);
      outputGate.connect(compressor);
      compressor.connect(audioContext.destination);

      percussionNoise = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 0.08), audioContext.sampleRate);
      const noiseData = percussionNoise.getChannelData(0);
      for (let index = 0; index < noiseData.length; index += 1) {
        noiseData[index] = Math.random() * 2 - 1;
      }

      teleportNoise = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 0.7), audioContext.sampleRate);
      const teleportData = teleportNoise.getChannelData(0);
      for (let index = 0; index < teleportData.length; index += 1) {
        teleportData[index] = Math.random() * 2 - 1;
      }
    }

    function scheduleTone(frequency, time, duration, volume, type) {
      const oscillator = audioContext.createOscillator();
      const envelope = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, time);
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.exponentialRampToValueAtTime(volume, time + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      oscillator.connect(envelope);
      envelope.connect(musicBus);
      trackSource(oscillator);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.02);
    }

    function scheduleBass(note, time) {
      const frequency = midiToFrequency(note);
      const pulse = audioContext.createOscillator();
      const grit = audioContext.createOscillator();
      const gritLevel = audioContext.createGain();
      const filter = audioContext.createBiquadFilter();
      const envelope = audioContext.createGain();
      const duration = stepDuration * 1.75;

      pulse.type = "square";
      pulse.frequency.setValueAtTime(frequency, time);
      grit.type = "sawtooth";
      grit.frequency.setValueAtTime(frequency, time);
      grit.detune.setValueAtTime(-7, time);
      gritLevel.gain.setValueAtTime(0.28, time);
      filter.type = "lowpass";
      filter.Q.setValueAtTime(5.5, time);
      filter.frequency.setValueAtTime(760, time);
      filter.frequency.exponentialRampToValueAtTime(230, time + duration);
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.exponentialRampToValueAtTime(0.105, time + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      pulse.connect(filter);
      grit.connect(gritLevel);
      gritLevel.connect(filter);
      filter.connect(envelope);
      envelope.connect(musicBus);
      trackSource(pulse);
      trackSource(grit);
      pulse.start(time);
      grit.start(time);
      pulse.stop(time + duration + 0.02);
      grit.stop(time + duration + 0.02);
    }

    function scheduleFmLead(note, time) {
      const frequency = midiToFrequency(note);
      const carrier = audioContext.createOscillator();
      const modulator = audioContext.createOscillator();
      const modulation = audioContext.createGain();
      const envelope = audioContext.createGain();

      carrier.type = "sine";
      carrier.frequency.setValueAtTime(frequency, time);
      modulator.type = "sine";
      modulator.frequency.setValueAtTime(frequency * 1.5, time);
      modulation.gain.setValueAtTime(frequency * 0.58, time);
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.exponentialRampToValueAtTime(0.055, time + 0.018);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + stepDuration * 3.4);

      modulator.connect(modulation);
      modulation.connect(carrier.frequency);
      carrier.connect(envelope);
      envelope.connect(musicBus);
      trackSource(carrier);
      trackSource(modulator);
      carrier.start(time);
      modulator.start(time);
      carrier.stop(time + stepDuration * 3.5);
      modulator.stop(time + stepDuration * 3.5);
    }

    function scheduleKick(time) {
      const oscillator = audioContext.createOscillator();
      const envelope = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(82, time);
      oscillator.frequency.exponentialRampToValueAtTime(34, time + 0.17);
      envelope.gain.setValueAtTime(0.17, time);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
      oscillator.connect(envelope);
      envelope.connect(musicBus);
      trackSource(oscillator);
      oscillator.start(time);
      oscillator.stop(time + 0.19);
    }

    function scheduleHat(time) {
      const source = audioContext.createBufferSource();
      const filter = audioContext.createBiquadFilter();
      const envelope = audioContext.createGain();
      source.buffer = percussionNoise;
      filter.type = "highpass";
      filter.frequency.setValueAtTime(3200, time);
      envelope.gain.setValueAtTime(0.018, time);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
      source.connect(filter);
      filter.connect(envelope);
      envelope.connect(musicBus);
      trackSource(source);
      source.start(time);
      source.stop(time + 0.065);
    }

    function scheduleNavigationTone(frequency, time, duration, volume, type) {
      const oscillator = audioContext.createOscillator();
      const envelope = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, time);
      envelope.gain.setValueAtTime(0.0001, time);
      envelope.gain.exponentialRampToValueAtTime(volume, time + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
      oscillator.connect(envelope);
      envelope.connect(sfxBus);
      trackSource(oscillator, true);
      oscillator.start(time);
      oscillator.stop(time + duration + 0.02);
    }

    function duckMusic(time, duration) {
      musicBus.gain.cancelScheduledValues(time);
      musicBus.gain.setValueAtTime(musicBus.gain.value, time);
      musicBus.gain.linearRampToValueAtTime(MUSIC_GAIN * 0.4, time + 0.025);
      musicBus.gain.linearRampToValueAtTime(MUSIC_GAIN, time + duration);
    }

    function scheduleAttentionCue() {
      const now = audioContext.currentTime + 0.015;
      duckMusic(now, 0.72);
      scheduleNavigationTone(880, now, 0.16, 0.28, "square");
      scheduleNavigationTone(660, now + 0.2, 0.16, 0.25, "square");
      scheduleNavigationTone(880, now + 0.4, 0.22, 0.3, "square");
    }

    function scheduleCountdownCue(secondsRemaining) {
      const frequencies = { 5: 720, 4: 780, 3: 850, 2: 920, 1: 1080 };
      const frequency = frequencies[secondsRemaining];
      if (!frequency) return;
      const now = audioContext.currentTime + 0.01;
      scheduleNavigationTone(frequency, now, 0.075, 0.2, "square");
      if (secondsRemaining === 1) {
        scheduleNavigationTone(frequency, now + 0.14, 0.075, 0.23, "square");
      }
    }

    function scheduleTeleportCue() {
      const now = audioContext.currentTime + 0.01;
      const duration = 0.62;
      const rise = audioContext.createOscillator();
      const riseEnvelope = audioContext.createGain();
      const fall = audioContext.createOscillator();
      const fallEnvelope = audioContext.createGain();
      const noise = audioContext.createBufferSource();
      const noiseFilter = audioContext.createBiquadFilter();
      const noiseEnvelope = audioContext.createGain();

      duckMusic(now, 0.82);
      rise.type = "sawtooth";
      rise.frequency.setValueAtTime(180, now);
      rise.frequency.exponentialRampToValueAtTime(1300, now + 0.54);
      riseEnvelope.gain.setValueAtTime(0.0001, now);
      riseEnvelope.gain.exponentialRampToValueAtTime(0.2, now + 0.035);
      riseEnvelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.56);
      rise.connect(riseEnvelope);
      riseEnvelope.connect(sfxBus);

      fall.type = "triangle";
      fall.frequency.setValueAtTime(900, now);
      fall.frequency.exponentialRampToValueAtTime(120, now + duration);
      fallEnvelope.gain.setValueAtTime(0.0001, now);
      fallEnvelope.gain.exponentialRampToValueAtTime(0.17, now + 0.025);
      fallEnvelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      fall.connect(fallEnvelope);
      fallEnvelope.connect(sfxBus);

      noise.buffer = teleportNoise;
      noiseFilter.type = "bandpass";
      noiseFilter.Q.setValueAtTime(2.5, now);
      noiseFilter.frequency.setValueAtTime(300, now);
      noiseFilter.frequency.exponentialRampToValueAtTime(2400, now + 0.48);
      noiseEnvelope.gain.setValueAtTime(0.0001, now);
      noiseEnvelope.gain.exponentialRampToValueAtTime(0.13, now + 0.045);
      noiseEnvelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseEnvelope);
      noiseEnvelope.connect(sfxBus);

      [rise, fall, noise].forEach(source => trackSource(source, true));
      rise.start(now);
      fall.start(now);
      noise.start(now);
      rise.stop(now + 0.58);
      fall.stop(now + duration + 0.02);
      noise.stop(now + 0.6);
    }

    function scheduleStep(step, time) {
      const bassNote = bassPattern[step];
      const leadNote = leadPattern[step];
      if (bassNote !== null) scheduleBass(bassNote, time);
      if (leadNote !== null) scheduleFmLead(leadNote, time);
      if (step % 2 === 0) {
        const rootNote = arpeggioRoots[Math.floor(step / 8)];
        const offset = arpeggioOffsets[(step / 2) % arpeggioOffsets.length];
        scheduleTone(midiToFrequency(rootNote + offset), time, stepDuration * 1.1, 0.018, "triangle");
      }
      if (step % 4 === 0) scheduleKick(time);
      if (step % 4 === 2) scheduleHat(time);
    }

    function runScheduler() {
      if (!enabled || destroyed || !audioContext || audioContext.state !== "running") return;
      while (nextStepTime < audioContext.currentTime + 0.1) {
        scheduleStep(musicStep, nextStepTime);
        nextStepTime += stepDuration;
        musicStep = (musicStep + 1) % bassPattern.length;
      }
    }

    function startScheduler() {
      if (scheduler !== null || destroyed) return;
      nextStepTime = audioContext.currentTime + 0.05;
      runScheduler();
      scheduler = root.setInterval(runScheduler, 25);
    }

    function stopScheduler() {
      if (scheduler === null) return;
      root.clearInterval(scheduler);
      scheduler = null;
    }

    function stopSource(source) {
      try {
        source.stop();
      } catch (_error) {
        // The source may already have finished naturally.
      }
      scheduledSources.delete(source);
      navigationSources.delete(source);
    }

    function stopSources(sources, delay) {
      if (delay <= 0) {
        sources.forEach(stopSource);
        return;
      }
      const timeout = root.setTimeout(() => {
        stopTimeouts.delete(timeout);
        sources.forEach(stopSource);
      }, delay);
      stopTimeouts.add(timeout);
    }

    function stopNavigationCues() {
      stopSources(Array.from(navigationSources), 0);
      navigationSources.clear();
      if (audioContext && musicBus) {
        const now = audioContext.currentTime;
        musicBus.gain.cancelScheduledValues(now);
        musicBus.gain.setValueAtTime(musicBus.gain.value, now);
        musicBus.gain.linearRampToValueAtTime(MUSIC_GAIN, now + 0.08);
      }
    }

    function canPlayNavigationCue() {
      return enabled && !destroyed && audioContext && audioContext.state === "running";
    }

    function handleNavigationEvent(event) {
      if (!event || typeof event.type !== "string") return;
      if (event.type === "forced-reset") {
        stopNavigationCues();
        if (canPlayNavigationCue()) scheduleTeleportCue();
        return;
      }
      if (event.type === "state-change") {
        if (event.to === "SAFE" || (event.from === "CRITICAL" && event.to !== "CRITICAL")) {
          stopNavigationCues();
        }
        if (event.from === "SAFE" && event.to !== "SAFE" && canPlayNavigationCue()) {
          scheduleAttentionCue();
        }
        return;
      }
      if (event.type === "countdown-tick" &&
          Number.isInteger(event.secondsRemaining) &&
          canPlayNavigationCue()) {
        scheduleCountdownCue(event.secondsRemaining);
      }
    }

    async function setEnabled(nextEnabled) {
      if (destroyed) throw new Error("Music has been destroyed");
      const requested = Boolean(nextEnabled);
      if (!requested) {
        enabled = false;
        stopScheduler();
        if (audioContext && outputGate) {
          const now = audioContext.currentTime;
          outputGate.gain.cancelScheduledValues(now);
          outputGate.gain.setValueAtTime(outputGate.gain.value, now);
          outputGate.gain.linearRampToValueAtTime(0, now + 0.06);
          stopSources(Array.from(scheduledSources), 80);
        }
        return false;
      }
      if (!available) return false;
      try {
        initializeAudio();
        await audioContext.resume();
        if (destroyed) return false;
        enabled = true;
        const now = audioContext.currentTime;
        musicBus.gain.cancelScheduledValues(now);
        musicBus.gain.setValueAtTime(MUSIC_GAIN, now);
        outputGate.gain.cancelScheduledValues(now);
        outputGate.gain.setValueAtTime(0, now);
        outputGate.gain.linearRampToValueAtTime(1, now + 0.08);
        startScheduler();
        return true;
      } catch (error) {
        enabled = false;
        available = false;
        onError(error);
        return false;
      }
    }

    function getState() {
      return { available, enabled };
    }

    function handleVisibilityChange() {
      if (destroyed || !audioContext || !enabled) return;
      if (documentRoot.hidden) {
        stopScheduler();
        stopSources(Array.from(scheduledSources), 0);
        navigationSources.clear();
        audioContext.suspend().catch(onError);
      } else {
        audioContext.resume().then(() => {
          if (enabled && !destroyed) startScheduler();
        }).catch(error => {
          enabled = false;
          stopScheduler();
          onError(error);
        });
      }
    }
    documentRoot.addEventListener("visibilitychange", handleVisibilityChange);

    async function destroy() {
      if (destroyed) return;
      destroyed = true;
      enabled = false;
      documentRoot.removeEventListener("visibilitychange", handleVisibilityChange);
      stopScheduler();
      stopTimeouts.forEach(timeout => root.clearTimeout(timeout));
      stopTimeouts.clear();
      scheduledSources.forEach(stopSource);
      scheduledSources.clear();
      navigationSources.clear();
      if (musicBus) {
        try { musicBus.disconnect(); } catch (_error) {}
      }
      if (sfxBus) {
        try { sfxBus.disconnect(); } catch (_error) {}
      }
      if (outputGate) {
        try { outputGate.disconnect(); } catch (_error) {}
      }
      if (compressor) {
        try { compressor.disconnect(); } catch (_error) {}
      }
      if (audioContext && audioContext.state !== "closed") {
        try {
          await audioContext.close();
        } catch (error) {
          onError(error);
        }
      }
      audioContext = null;
      musicBus = null;
      sfxBus = null;
      outputGate = null;
      compressor = null;
      percussionNoise = null;
      teleportNoise = null;
    }

    return { setEnabled, getState, handleNavigationEvent, stopNavigationCues, destroy };
  }

  Noseview.audio.createMusic = createMusic;
}(window));
