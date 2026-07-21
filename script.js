    "use strict";

    (function () {
      const canvas = document.getElementById("gl-canvas");
      const canvasWrap = document.querySelector(".canvas-wrap");
      const glowCanvas = document.getElementById("analog-glow-canvas");
      const glowContext = glowCanvas.getContext("2d");
      const noiseCanvas = document.getElementById("analog-noise-canvas");
      const noiseContext = noiseCanvas.getContext("2d");
      const noiseImage = noiseContext
        ? noiseContext.createImageData(noiseCanvas.width, noiseCanvas.height)
        : null;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const analogButton = document.getElementById("analog-button");
      const soundButton = document.getElementById("sound-button");
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const errorBox = document.getElementById("webgl-error");
      const gl = canvas.getContext("webgl", {
        antialias: false,
        alpha: false,
        depth: true,
        powerPreference: "default"
      });

      if (!gl) {
        errorBox.style.display = "block";
        return;
      }

      const vertexSource = `
        attribute vec3 aPosition;
        uniform mat4 uProjection;
        uniform mat4 uView;
        varying float vDistance;

        void main() {
          vec4 viewPosition = uView * vec4(aPosition, 1.0);
          vDistance = length(viewPosition.xyz);
          gl_Position = uProjection * viewPosition;
        }
      `;

      const fragmentSource = `
        precision mediump float;
        uniform vec4 uColor;
        uniform float uFogNear;
        uniform float uFogFar;
        varying float vDistance;

        void main() {
          float fog = smoothstep(uFogNear, uFogFar, vDistance);
          gl_FragColor = vec4(mix(uColor.rgb, vec3(0.0), fog), uColor.a * (1.0 - fog * 0.45));
        }
      `;

      function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
        }
        return shader;
      }

      function makeProgram() {
        const program = gl.createProgram();
        gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSource));
        gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) || "Program linking failed");
        }
        return program;
      }

      let program;
      try {
        program = makeProgram();
      } catch (error) {
        errorBox.style.display = "block";
        errorBox.innerHTML = "*** SYSTEM FAILURE ***<br><br>" + error.message;
        return;
      }

      const locations = {
        position: gl.getAttribLocation(program, "aPosition"),
        projection: gl.getUniformLocation(program, "uProjection"),
        view: gl.getUniformLocation(program, "uView"),
        color: gl.getUniformLocation(program, "uColor"),
        fogNear: gl.getUniformLocation(program, "uFogNear"),
        fogFar: gl.getUniformLocation(program, "uFogFar")
      };

      function perspective(fovRadians, aspect, near, far) {
        const f = 1 / Math.tan(fovRadians / 2);
        const rangeInv = 1 / (near - far);
        return new Float32Array([
          f / aspect, 0, 0, 0,
          0, f, 0, 0,
          0, 0, (near + far) * rangeInv, -1,
          0, 0, near * far * rangeInv * 2, 0
        ]);
      }

      function normalize(v) {
        const length = Math.hypot(v[0], v[1], v[2]) || 1;
        return [v[0] / length, v[1] / length, v[2] / length];
      }

      function cross(a, b) {
        return [
          a[1] * b[2] - a[2] * b[1],
          a[2] * b[0] - a[0] * b[2],
          a[0] * b[1] - a[1] * b[0]
        ];
      }

      function dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      }

      function lookAt(eye, target, up) {
        const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
        const x = normalize(cross(up, z));
        const y = cross(z, x);
        return new Float32Array([
          x[0], y[0], z[0], 0,
          x[1], y[1], z[1], 0,
          x[2], y[2], z[2], 0,
          -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
        ]);
      }

      function createGeometry(data) {
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        return { buffer, count: data.length / 3 };
      }

      function addLine(data, a, b) {
        data.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      }

      function addBox(faces, edges, x, z, width, depth, height, baseY) {
        const x0 = x - width / 2;
        const x1 = x + width / 2;
        const z0 = z - depth / 2;
        const z1 = z + depth / 2;
        const y0 = baseY;
        const y1 = baseY + height;
        const v = [
          [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
          [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
        ];
        const triangles = [
          0, 1, 2, 0, 2, 3,
          5, 4, 7, 5, 7, 6,
          4, 0, 3, 4, 3, 7,
          1, 5, 6, 1, 6, 2,
          3, 2, 6, 3, 6, 7,
          4, 5, 1, 4, 1, 0
        ];
        for (const index of triangles) faces.push(v[index][0], v[index][1], v[index][2]);
        const pairs = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
        for (const pair of pairs) addLine(edges, v[pair[0]], v[pair[1]]);
        return { minX: x0, maxX: x1, minY: y0, maxY: y1, minZ: z0, maxZ: z1 };
      }

      function makeRng(seed) {
        let state = seed >>> 0;
        return function () {
          state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
          return state / 4294967296;
        };
      }

      const groundFaces = createGeometry([
        -110, -0.08, -110, 110, -0.08, -110, 110, -0.08, 110,
        -110, -0.08, -110, 110, -0.08, 110, -110, -0.08, 110
      ]);

      const gridData = [];
      for (let i = -90; i <= 90; i += 5) {
        addLine(gridData, [i, 0, -90], [i, 0, 90]);
        addLine(gridData, [-90, 0, i], [90, 0, i]);
      }
      const gridLines = createGeometry(gridData);

      const roadData = [];
      for (let x = -52.5; x <= 37.5; x += 15) {
        addLine(roadData, [x - 2.2, 0.025, -48], [x - 2.2, 0.025, 48]);
        addLine(roadData, [x + 2.2, 0.025, -48], [x + 2.2, 0.025, 48]);
      }
      for (let z = -40; z <= 40; z += 16) {
        addLine(roadData, [-53, 0.025, z - 2.2], [38, 0.025, z - 2.2]);
        addLine(roadData, [-53, 0.025, z + 2.2], [38, 0.025, z + 2.2]);
      }
      const roadLines = createGeometry(roadData);

      let cityFaces = null;
      let cityEdges = null;
      let antennaLines = null;
      let buildingColliders = [];
      let currentSeed = 19810001;

      const cameraRadius = 0.6;
      const maxCollisionStep = 0.2;

      function deleteGeometry(geometry) {
        if (geometry && geometry.buffer) gl.deleteBuffer(geometry.buffer);
      }

      function buildCity(seed) {
        const random = makeRng(seed);
        const lots = [];
        for (let row = -2; row <= 2; row += 1) {
          for (let col = -3; col <= 2; col += 1) {
            lots.push({ col, row, sort: random() });
          }
        }
        lots.sort((a, b) => a.sort - b.sort);

        const faces = [];
        const edges = [];
        const antennas = [];
        const colliders = [];
        const buildings = lots.slice(0, 26);

        buildings.forEach((lot, index) => {
          const x = lot.col * 15 + (random() - 0.5) * 1.8;
          const z = lot.row * 16 + (random() - 0.5) * 1.8;
          const width = 6.4 + random() * 3.2;
          const depth = 6.2 + random() * 3.5;
          let height = 7 + random() * 20;
          if (index % 9 === 0) height += 11;
          colliders.push(addBox(faces, edges, x, z, width, depth, height, 0.03));

          if (index % 5 === 0 && height > 17) {
            const tierHeight = 3.5 + random() * 5;
            const tierWidth = width * (0.48 + random() * 0.18);
            const tierDepth = depth * (0.48 + random() * 0.18);
            colliders.push(addBox(faces, edges, x, z, tierWidth, tierDepth, tierHeight, height + 0.03));
            if (index % 10 === 0) {
              addLine(antennas, [x, height + tierHeight, z], [x, height + tierHeight + 5, z]);
              addLine(antennas, [x - 1.2, height + tierHeight + 3.3, z], [x + 1.2, height + tierHeight + 3.3, z]);
            }
          }
        });

        deleteGeometry(cityFaces);
        deleteGeometry(cityEdges);
        deleteGeometry(antennaLines);
        cityFaces = createGeometry(faces);
        cityEdges = createGeometry(edges);
        antennaLines = createGeometry(antennas);
        buildingColliders = colliders;
        document.getElementById("building-count").textContent = String(buildings.length);
      }

      const camera = {
        x: 7.5,
        y: 10,
        z: 58,
        yaw: 0,
        pitch: -10 * Math.PI / 180
      };

      function resetCamera() {
        camera.x = 7.5;
        camera.y = 10;
        camera.z = 58;
        camera.yaw = 0;
        camera.pitch = -10 * Math.PI / 180;
      }

      const controls = {
        forward: false,
        backward: false,
        strafeLeft: false,
        strafeRight: false,
        turnLeft: false,
        turnRight: false,
        lookUp: false,
        lookDown: false
      };

      const speedModes = [
        { name: "SLOW", move: 5, turn: 42 },
        { name: "NORMAL", move: 10, turn: 65 },
        { name: "FAST", move: 19, turn: 92 }
      ];
      let speedIndex = 1;

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

      function setControl(action, active) {
        if (Object.prototype.hasOwnProperty.call(controls, action)) controls[action] = active;
        document.querySelectorAll(`[data-action="${action}"]`).forEach(button => {
          button.classList.toggle("is-active", active);
        });
      }

      document.querySelectorAll("[data-action]").forEach(button => {
        const action = button.dataset.action;
        button.addEventListener("pointerdown", event => {
          event.preventDefault();
          button.setPointerCapture(event.pointerId);
          setControl(action, true);
        });
        const stop = event => {
          event.preventDefault();
          setControl(action, false);
        };
        button.addEventListener("pointerup", stop);
        button.addEventListener("pointercancel", stop);
        button.addEventListener("lostpointercapture", () => setControl(action, false));
        button.addEventListener("contextmenu", event => event.preventDefault());
      });

      window.addEventListener("keydown", event => {
        if (keyMap[event.code]) {
          event.preventDefault();
          setControl(keyMap[event.code], true);
        }
        if (!event.repeat && event.code === "KeyR") resetCamera();
        if (!event.repeat && event.code === "KeyF") cycleSpeed();
      });

      window.addEventListener("keyup", event => {
        if (keyMap[event.code]) {
          event.preventDefault();
          setControl(keyMap[event.code], false);
        }
      });

      window.addEventListener("blur", () => {
        Object.keys(controls).forEach(action => setControl(action, false));
      });

      function cycleSpeed() {
        speedIndex = (speedIndex + 1) % speedModes.length;
        const mode = speedModes[speedIndex];
        document.getElementById("speed-button").textContent = `SPEED: ${mode.name}`;
        document.getElementById("speed").textContent = String(mode.move);
      }

      let analogVisionEnabled = false;
      let lastNoiseFrame = 0;
      let noisePulse = 1;
      let noisePulseTarget = 1;
      let nextNoisePulseChange = 0;

      function drawAnalogNoise() {
        if (!noiseContext || !noiseImage) return;
        const data = noiseImage.data;
        const width = noiseCanvas.width;

        for (let y = 0; y < noiseCanvas.height; y += 1) {
          const rowStrength = Math.random() < 0.08
            ? 1.2
            : 0.82 + Math.random() * 0.36;
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

      function updateAnalogNoise(time, deltaTime) {
        if (!analogVisionEnabled || !noiseContext || !noiseImage) return;

        if (lastNoiseFrame === 0 || (!reducedMotion.matches && time - lastNoiseFrame >= 80)) {
          drawAnalogNoise();
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

        canvasWrap.style.setProperty("--analog-noise-opacity", (0.11 * noisePulse).toFixed(4));
      }

      function setAnalogVision(enabled) {
        analogVisionEnabled = enabled;
        canvasWrap.classList.toggle("analog-vision", enabled);
        analogButton.classList.toggle("is-active", enabled);
        analogButton.setAttribute("aria-pressed", String(enabled));
        analogButton.textContent = `ANALOG VISION: ${enabled ? "ON" : "OFF"}`;
        if (enabled) {
          lastNoiseFrame = 0;
          noisePulse = 1;
          noisePulseTarget = 0.9 + Math.random() * 0.2;
          nextNoisePulseChange = performance.now() + 700 + Math.random() * 1100;
        } else {
          if (glowContext) glowContext.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
          if (noiseContext) noiseContext.clearRect(0, 0, noiseCanvas.width, noiseCanvas.height);
          canvasWrap.style.removeProperty("--analog-noise-opacity");
        }
      }

      const musicTempo = 96;
      const musicStepDuration = 60 / musicTempo / 4;
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

      let audioContext = null;
      let musicMaster = null;
      let musicCompressor = null;
      let percussionNoise = null;
      let musicScheduler = null;
      let nextMusicStepTime = 0;
      let musicStep = 0;
      let soundEnabled = false;
      const scheduledSources = new Set();

      function midiToFrequency(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
      }

      function trackSource(source) {
        scheduledSources.add(source);
        source.addEventListener("ended", () => scheduledSources.delete(source), { once: true });
      }

      function initializeAudio() {
        if (audioContext || !AudioContextClass) return;

        audioContext = new AudioContextClass();
        musicMaster = audioContext.createGain();
        musicMaster.gain.value = 0;
        musicCompressor = audioContext.createDynamicsCompressor();
        musicCompressor.threshold.value = -18;
        musicCompressor.knee.value = 16;
        musicCompressor.ratio.value = 4;
        musicCompressor.attack.value = 0.003;
        musicCompressor.release.value = 0.25;
        musicMaster.connect(musicCompressor);
        musicCompressor.connect(audioContext.destination);

        percussionNoise = audioContext.createBuffer(1, Math.floor(audioContext.sampleRate * 0.08), audioContext.sampleRate);
        const noiseData = percussionNoise.getChannelData(0);
        for (let i = 0; i < noiseData.length; i += 1) {
          noiseData[i] = Math.random() * 2 - 1;
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
        envelope.connect(musicMaster);
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
        const duration = musicStepDuration * 1.75;

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
        envelope.connect(musicMaster);
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
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + musicStepDuration * 3.4);

        modulator.connect(modulation);
        modulation.connect(carrier.frequency);
        carrier.connect(envelope);
        envelope.connect(musicMaster);
        trackSource(carrier);
        trackSource(modulator);
        carrier.start(time);
        modulator.start(time);
        carrier.stop(time + musicStepDuration * 3.5);
        modulator.stop(time + musicStepDuration * 3.5);
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
        envelope.connect(musicMaster);
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
        envelope.connect(musicMaster);
        trackSource(source);
        source.start(time);
        source.stop(time + 0.065);
      }

      function scheduleMusicStep(step, time) {
        const bassNote = bassPattern[step];
        const leadNote = leadPattern[step];
        if (bassNote !== null) scheduleBass(bassNote, time);
        if (leadNote !== null) scheduleFmLead(leadNote, time);
        if (step % 2 === 0) {
          const root = arpeggioRoots[Math.floor(step / 8)];
          const offset = arpeggioOffsets[(step / 2) % arpeggioOffsets.length];
          scheduleTone(midiToFrequency(root + offset), time, musicStepDuration * 1.1, 0.018, "triangle");
        }
        if (step % 4 === 0) scheduleKick(time);
        if (step % 4 === 2) scheduleHat(time);
      }

      function runMusicScheduler() {
        if (!soundEnabled || !audioContext || audioContext.state !== "running") return;
        while (nextMusicStepTime < audioContext.currentTime + 0.1) {
          scheduleMusicStep(musicStep, nextMusicStepTime);
          nextMusicStepTime += musicStepDuration;
          musicStep = (musicStep + 1) % bassPattern.length;
        }
      }

      function startMusicScheduler() {
        if (musicScheduler !== null) return;
        nextMusicStepTime = audioContext.currentTime + 0.05;
        runMusicScheduler();
        musicScheduler = window.setInterval(runMusicScheduler, 25);
      }

      function stopMusicScheduler() {
        if (musicScheduler === null) return;
        window.clearInterval(musicScheduler);
        musicScheduler = null;
      }

      function stopSources(sources, delay) {
        window.setTimeout(() => {
          sources.forEach(source => {
            try {
              source.stop();
            } catch (error) {
              // The source may already have finished naturally.
            }
          });
        }, delay);
      }

      function updateSoundButton() {
        soundButton.classList.toggle("is-active", soundEnabled);
        soundButton.setAttribute("aria-pressed", String(soundEnabled));
        soundButton.textContent = `SOUND: ${soundEnabled ? "ON" : "OFF"}`;
      }

      async function enableSound() {
        try {
          initializeAudio();
          await audioContext.resume();
          soundEnabled = true;
          updateSoundButton();
          const now = audioContext.currentTime;
          musicMaster.gain.cancelScheduledValues(now);
          musicMaster.gain.setValueAtTime(0, now);
          musicMaster.gain.linearRampToValueAtTime(0.08, now + 0.08);
          startMusicScheduler();
        } catch (error) {
          soundEnabled = false;
          soundButton.disabled = true;
          soundButton.textContent = "SOUND: N/A";
          soundButton.setAttribute("aria-pressed", "false");
        }
      }

      function disableSound() {
        soundEnabled = false;
        updateSoundButton();
        stopMusicScheduler();
        if (!audioContext || !musicMaster) return;
        const now = audioContext.currentTime;
        musicMaster.gain.cancelScheduledValues(now);
        musicMaster.gain.setValueAtTime(musicMaster.gain.value, now);
        musicMaster.gain.linearRampToValueAtTime(0, now + 0.06);
        stopSources(Array.from(scheduledSources), 80);
      }

      if (AudioContextClass) {
        soundButton.addEventListener("click", () => {
          if (soundEnabled) disableSound();
          else enableSound();
        });
      } else {
        soundButton.disabled = true;
        soundButton.textContent = "SOUND: N/A";
      }

      document.addEventListener("visibilitychange", () => {
        if (!audioContext || !soundEnabled) return;
        if (document.hidden) {
          stopMusicScheduler();
          stopSources(Array.from(scheduledSources), 0);
          audioContext.suspend();
        } else {
          audioContext.resume().then(() => {
            if (soundEnabled) startMusicScheduler();
          }).catch(disableSound);
        }
      });

      document.getElementById("reset-button").addEventListener("click", resetCamera);
      document.getElementById("speed-button").addEventListener("click", cycleSpeed);
      analogButton.addEventListener("click", () => setAnalogVision(!analogVisionEnabled));
      document.getElementById("regen-button").addEventListener("click", () => {
        currentSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
        buildCity(currentSeed);
        resetCamera();
      });

      function getForwardDirection() {
        const cosPitch = Math.cos(camera.pitch);
        return [
          Math.sin(camera.yaw) * cosPitch,
          Math.sin(camera.pitch),
          -Math.cos(camera.yaw) * cosPitch
        ];
      }

      function distanceToInterval(value, min, max) {
        if (value < min) return min - value;
        if (value > max) return value - max;
        return 0;
      }

      function moveCameraAlongAxis(axis, distance) {
        if (distance === 0) return;

        const start = camera[axis];
        const target = start + distance;
        const radiusSquared = cameraRadius * cameraRadius;
        let safeFraction = 1;

        buildingColliders.forEach(collider => {
          let perpendicularDistanceSquared;
          let min;
          let max;

          if (axis === "x") {
            const dy = distanceToInterval(camera.y, collider.minY, collider.maxY);
            const dz = distanceToInterval(camera.z, collider.minZ, collider.maxZ);
            perpendicularDistanceSquared = dy * dy + dz * dz;
            min = collider.minX;
            max = collider.maxX;
          } else if (axis === "y") {
            const dx = distanceToInterval(camera.x, collider.minX, collider.maxX);
            const dz = distanceToInterval(camera.z, collider.minZ, collider.maxZ);
            perpendicularDistanceSquared = dx * dx + dz * dz;
            min = collider.minY;
            max = collider.maxY;
          } else {
            const dx = distanceToInterval(camera.x, collider.minX, collider.maxX);
            const dy = distanceToInterval(camera.y, collider.minY, collider.maxY);
            perpendicularDistanceSquared = dx * dx + dy * dy;
            min = collider.minZ;
            max = collider.maxZ;
          }

          if (perpendicularDistanceSquared >= radiusSquared) return;
          const padding = Math.sqrt(radiusSquared - perpendicularDistanceSquared);
          const collisionMin = min - padding;
          const collisionMax = max + padding;
          let collisionFraction = 1;

          if (distance > 0 && start <= collisionMin && target > collisionMin) {
            collisionFraction = (collisionMin - start) / distance;
          } else if (distance < 0 && start >= collisionMax && target < collisionMax) {
            collisionFraction = (collisionMax - start) / distance;
          }

          if (collisionFraction < safeFraction) {
            safeFraction = Math.max(0, collisionFraction - 0.000001);
          }
        });

        camera[axis] = start + distance * safeFraction;
      }

      function moveCamera(displacementX, displacementY, displacementZ) {
        const distance = Math.hypot(displacementX, displacementY, displacementZ);
        const steps = Math.max(1, Math.ceil(distance / maxCollisionStep));
        const stepX = displacementX / steps;
        const stepY = displacementY / steps;
        const stepZ = displacementZ / steps;

        for (let i = 0; i < steps; i += 1) {
          moveCameraAlongAxis("x", stepX);
          moveCameraAlongAxis("y", stepY);
          moveCameraAlongAxis("z", stepZ);
        }
      }

      function updateCamera(deltaTime) {
        const mode = speedModes[speedIndex];
        const turnStep = mode.turn * Math.PI / 180 * deltaTime;
        const moveStep = mode.move * deltaTime;

        if (controls.turnLeft) camera.yaw -= turnStep;
        if (controls.turnRight) camera.yaw += turnStep;
        if (controls.lookUp) camera.pitch += turnStep * 0.8;
        if (controls.lookDown) camera.pitch -= turnStep * 0.8;

        const pitchLimit = 75 * Math.PI / 180;
        camera.pitch = Math.max(-pitchLimit, Math.min(pitchLimit, camera.pitch));

        const forward = getForwardDirection();
        const rightX = Math.cos(camera.yaw);
        const rightZ = Math.sin(camera.yaw);
        let moveForward = Number(controls.forward) - Number(controls.backward);
        let moveRight = Number(controls.strafeRight) - Number(controls.strafeLeft);
        const magnitude = Math.hypot(moveForward, moveRight);
        if (magnitude > 1) {
          moveForward /= magnitude;
          moveRight /= magnitude;
        }
        moveCamera(
          (forward[0] * moveForward + rightX * moveRight) * moveStep,
          forward[1] * moveForward * moveStep,
          (forward[2] * moveForward + rightZ * moveRight) * moveStep
        );
      }

      function drawGeometry(geometry, primitive, color) {
        if (!geometry || geometry.count === 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, geometry.buffer);
        gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
        gl.uniform4fv(locations.color, color);
        gl.drawArrays(primitive, 0, geometry.count);
      }

      const ui = {
        x: document.getElementById("pos-x"),
        y: document.getElementById("pos-y"),
        z: document.getElementById("pos-z"),
        heading: document.getElementById("heading"),
        pitch: document.getElementById("pitch"),
        fps: document.getElementById("fps"),
        hudAlt: document.getElementById("hud-alt"),
        hudHdg: document.getElementById("hud-hdg")
      };

      let smoothedFps = 60;
      let lastUiUpdate = 0;

      function pad3(value) {
        return String(Math.round(value)).padStart(3, "0");
      }

      function updateUi(time, deltaTime) {
        smoothedFps += ((1 / Math.max(deltaTime, 0.001)) - smoothedFps) * 0.08;
        if (time - lastUiUpdate < 100) return;
        lastUiUpdate = time;
        const heading = (camera.yaw * 180 / Math.PI + 3600) % 360;
        const pitch = camera.pitch * 180 / Math.PI;
        ui.x.textContent = camera.x.toFixed(1);
        ui.y.textContent = camera.y.toFixed(1);
        ui.z.textContent = camera.z.toFixed(1);
        ui.heading.textContent = pad3(heading);
        ui.pitch.textContent = Math.round(pitch).toString();
        ui.fps.textContent = Math.round(Math.min(smoothedFps, 999)).toString();
        ui.hudAlt.textContent = `ALT. ${camera.y.toFixed(2)}`;
        ui.hudHdg.textContent = `HDG. ${pad3(heading)}`;
      }

      gl.useProgram(program);
      gl.enableVertexAttribArray(locations.position);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 1);
      gl.uniform1f(locations.fogNear, 54);
      gl.uniform1f(locations.fogFar, 155);
      gl.lineWidth(1);

      const projection = perspective(60 * Math.PI / 180, canvas.width / canvas.height, 0.1, 190);
      gl.uniformMatrix4fv(locations.projection, false, projection);
      buildCity(currentSeed);

      let previousTime = performance.now();

      function render(time) {
        const deltaTime = Math.min((time - previousTime) / 1000, 0.05);
        previousTime = time;
        updateCamera(deltaTime);

        const forward = getForwardDirection();
        const eye = [camera.x, camera.y, camera.z];
        const target = [camera.x + forward[0], camera.y + forward[1], camera.z + forward[2]];
        const view = lookAt(eye, target, [0, 1, 0]);

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(locations.view, false, view);

        drawGeometry(groundFaces, gl.TRIANGLES, [0.002, 0.008, 0.004, 1]);
        drawGeometry(gridLines, gl.LINES, [0.0, 0.23, 0.08, 0.62]);
        drawGeometry(roadLines, gl.LINES, [0.0, 0.68, 0.28, 0.88]);

        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1, 1);
        drawGeometry(cityFaces, gl.TRIANGLES, [0.018, 0.085, 0.038, 1]);
        gl.disable(gl.POLYGON_OFFSET_FILL);

        const flicker = 0.92 + Math.sin(time * 0.009) * 0.055 + Math.sin(time * 0.037) * 0.02;
        drawGeometry(cityEdges, gl.LINES, [0.0, flicker, 0.34 * flicker, 1]);
        drawGeometry(
          antennaLines,
          gl.LINES,
          analogVisionEnabled ? [0.0, 0.92, 0.4, 1] : [0.0, 0.78, 1.0, 1]
        );

        if (analogVisionEnabled && glowContext) {
          glowContext.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
          glowContext.drawImage(canvas, 0, 0, glowCanvas.width, glowCanvas.height);
        }
        updateAnalogNoise(time, deltaTime);

        updateUi(time, deltaTime);
        requestAnimationFrame(render);
      }

      canvas.addEventListener("webglcontextlost", event => {
        event.preventDefault();
        errorBox.style.display = "block";
        errorBox.innerHTML = "*** SIGNAL LOST ***<br><br>WEBGL CONTEXT DISCONNECTED.";
      });

      requestAnimationFrame(render);
    }());
  
