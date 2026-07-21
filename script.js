    "use strict";

    (function () {
      const canvas = document.getElementById("gl-canvas");
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
      let currentSeed = 19810001;

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
        const buildings = lots.slice(0, 26);

        buildings.forEach((lot, index) => {
          const x = lot.col * 15 + (random() - 0.5) * 1.8;
          const z = lot.row * 16 + (random() - 0.5) * 1.8;
          const width = 6.4 + random() * 3.2;
          const depth = 6.2 + random() * 3.5;
          let height = 7 + random() * 20;
          if (index % 9 === 0) height += 11;
          addBox(faces, edges, x, z, width, depth, height, 0.03);

          if (index % 5 === 0 && height > 17) {
            const tierHeight = 3.5 + random() * 5;
            const tierWidth = width * (0.48 + random() * 0.18);
            const tierDepth = depth * (0.48 + random() * 0.18);
            addBox(faces, edges, x, z, tierWidth, tierDepth, tierHeight, height + 0.03);
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

      document.getElementById("reset-button").addEventListener("click", resetCamera);
      document.getElementById("speed-button").addEventListener("click", cycleSpeed);
      document.getElementById("regen-button").addEventListener("click", () => {
        currentSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
        buildCity(currentSeed);
        resetCamera();
      });

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

        const forwardX = Math.sin(camera.yaw);
        const forwardZ = -Math.cos(camera.yaw);
        const rightX = Math.cos(camera.yaw);
        const rightZ = Math.sin(camera.yaw);
        let moveForward = Number(controls.forward) - Number(controls.backward);
        let moveRight = Number(controls.strafeRight) - Number(controls.strafeLeft);
        const magnitude = Math.hypot(moveForward, moveRight);
        if (magnitude > 1) {
          moveForward /= magnitude;
          moveRight /= magnitude;
        }
        camera.x += (forwardX * moveForward + rightX * moveRight) * moveStep;
        camera.z += (forwardZ * moveForward + rightZ * moveRight) * moveStep;
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

        const cosPitch = Math.cos(camera.pitch);
        const forward = [
          Math.sin(camera.yaw) * cosPitch,
          Math.sin(camera.pitch),
          -Math.cos(camera.yaw) * cosPitch
        ];
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
        drawGeometry(cityFaces, gl.TRIANGLES, [0.001, 0.006, 0.003, 1]);
        gl.disable(gl.POLYGON_OFFSET_FILL);

        const flicker = 0.92 + Math.sin(time * 0.009) * 0.055 + Math.sin(time * 0.037) * 0.02;
        drawGeometry(cityEdges, gl.LINES, [0.0, flicker, 0.34 * flicker, 1]);
        drawGeometry(antennaLines, gl.LINES, [0.0, 0.78, 1.0, 1]);

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
  
