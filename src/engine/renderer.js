(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  if (!Noseview || !Noseview.math) {
    throw new Error("Noseview math must load before renderer.js");
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
    uniform float uSkyEnabled;
    varying float vDistance;

    void main() {
      float fog = smoothstep(uFogNear, uFogFar, vDistance);
      float fogAlpha = mix(1.0 - fog * 0.45, 1.0, uSkyEnabled);
      gl_FragColor = vec4(mix(uColor.rgb, vec3(0.0), fog), uColor.a * fogAlpha);
    }
  `;

  const skyVertexSource = `
    attribute vec3 aPosition;
    attribute vec2 aTexCoord;
    uniform mat4 uProjection;
    uniform mat4 uView;
    varying vec2 vTexCoord;

    void main() {
      vTexCoord = aTexCoord;
      gl_Position = uProjection * uView * vec4(aPosition, 1.0);
    }
  `;

  const skyFragmentSource = `
    precision mediump float;
    uniform sampler2D uTexture;
    varying vec2 vTexCoord;

    void main() {
      gl_FragColor = texture2D(uTexture, vTexCoord);
    }
  `;

  function createRenderer(canvas, options) {
    const settings = options || {};
    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      depth: true,
      powerPreference: "default"
    });
    if (!gl) {
      const error = new Error("WEBGL NAVIGATION MODULE NOT FOUND.");
      error.code = "WEBGL_UNAVAILABLE";
      throw error;
    }

    let destroyed = false;
    let contextLost = false;
    let skyTextureInitialized = false;
    let cityGeometry = { faces: null, edges: null, antennas: null };

    function compileShader(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || "Shader compilation failed";
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    }

    function createProgram(vertexCode, fragmentCode, label) {
      let vertexShader = null;
      let fragmentShader = null;
      let program = null;
      let linked = false;
      try {
        vertexShader = compileShader(gl.VERTEX_SHADER, vertexCode);
        fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentCode);
        program = gl.createProgram();
        if (!program) throw new Error(`Unable to allocate the ${label} WebGL program`);
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) || `${label} program linking failed`);
        }
        linked = true;
        return program;
      } finally {
        if (program && vertexShader) gl.detachShader(program, vertexShader);
        if (program && fragmentShader) gl.detachShader(program, fragmentShader);
        if (vertexShader) gl.deleteShader(vertexShader);
        if (fragmentShader) gl.deleteShader(fragmentShader);
        if (program && !linked) gl.deleteProgram(program);
      }
    }

    function createGeometry(data, stride) {
      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("Unable to allocate a WebGL buffer");
      try {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
        return { buffer, count: data.length / stride };
      } catch (error) {
        gl.deleteBuffer(buffer);
        throw error;
      }
    }

    function deleteGeometry(geometry) {
      if (geometry && geometry.buffer) gl.deleteBuffer(geometry.buffer);
    }

    function addLine(data, a, b) {
      data.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }

    function createSkyGeometry(radius, latitudeSegments, longitudeSegments) {
      const data = [];
      function makeVertex(latitude, longitude) {
        const v = latitude / latitudeSegments;
        const u = longitude / longitudeSegments;
        const phi = v * Math.PI;
        const theta = u * Math.PI * 2;
        const sinPhi = Math.sin(phi);
        return [
          radius * sinPhi * Math.cos(theta),
          radius * Math.cos(phi),
          radius * sinPhi * Math.sin(theta),
          u,
          1 - v
        ];
      }
      function pushVertex(vertex) {
        data.push(vertex[0], vertex[1], vertex[2], vertex[3], vertex[4]);
      }
      for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
        for (let longitude = 0; longitude < longitudeSegments; longitude += 1) {
          const v00 = makeVertex(latitude, longitude);
          const v10 = makeVertex(latitude + 1, longitude);
          const v11 = makeVertex(latitude + 1, longitude + 1);
          const v01 = makeVertex(latitude, longitude + 1);
          pushVertex(v00); pushVertex(v10); pushVertex(v11);
          pushVertex(v00); pushVertex(v11); pushVertex(v01);
        }
      }
      return createGeometry(data, 5);
    }

    const program = createProgram(vertexSource, fragmentSource, "Main");
    const skyProgram = createProgram(skyVertexSource, skyFragmentSource, "Sky");
    const locations = {
      position: gl.getAttribLocation(program, "aPosition"),
      projection: gl.getUniformLocation(program, "uProjection"),
      view: gl.getUniformLocation(program, "uView"),
      color: gl.getUniformLocation(program, "uColor"),
      fogNear: gl.getUniformLocation(program, "uFogNear"),
      fogFar: gl.getUniformLocation(program, "uFogFar"),
      skyEnabled: gl.getUniformLocation(program, "uSkyEnabled")
    };
    const skyLocations = {
      position: gl.getAttribLocation(skyProgram, "aPosition"),
      texCoord: gl.getAttribLocation(skyProgram, "aTexCoord"),
      projection: gl.getUniformLocation(skyProgram, "uProjection"),
      view: gl.getUniformLocation(skyProgram, "uView"),
      texture: gl.getUniformLocation(skyProgram, "uTexture")
    };

    const groundFaces = createGeometry([
      -110, -0.08, -110, 110, -0.08, -110, 110, -0.08, 110,
      -110, -0.08, -110, 110, -0.08, 110, -110, -0.08, 110
    ], 3);
    const gridData = [];
    for (let value = -90; value <= 90; value += 5) {
      addLine(gridData, [value, 0, -90], [value, 0, 90]);
      addLine(gridData, [-90, 0, value], [90, 0, value]);
    }
    const gridLines = createGeometry(gridData, 3);
    const roadData = [];
    for (let x = -52.5; x <= 37.5; x += 15) {
      addLine(roadData, [x - 2.2, 0.025, -48], [x - 2.2, 0.025, 48]);
      addLine(roadData, [x + 2.2, 0.025, -48], [x + 2.2, 0.025, 48]);
    }
    for (let z = -40; z <= 40; z += 16) {
      addLine(roadData, [-53, 0.025, z - 2.2], [38, 0.025, z - 2.2]);
      addLine(roadData, [-53, 0.025, z + 2.2], [38, 0.025, z + 2.2]);
    }
    const roadLines = createGeometry(roadData, 3);
    const skyGeometry = createSkyGeometry(150, 24, 48);
    const skyTexture = gl.createTexture();
    if (!skyTexture) throw new Error("Unable to allocate the sky texture");
    gl.bindTexture(gl.TEXTURE_2D, skyTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const projection = Noseview.math.perspective(60 * Math.PI / 180, canvas.width / canvas.height, 0.1, 190);

    function restoreMainState() {
      gl.useProgram(program);
      gl.enableVertexAttribArray(locations.position);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }

    restoreMainState();
    gl.clearColor(0, 0, 0, 1);
    gl.lineWidth(1);
    gl.uniform1f(locations.fogNear, 54);
    gl.uniform1f(locations.fogFar, 155);
    gl.uniform1f(locations.skyEnabled, 0);
    gl.uniformMatrix4fv(locations.projection, false, projection);
    gl.useProgram(skyProgram);
    gl.uniformMatrix4fv(skyLocations.projection, false, projection);
    gl.uniform1i(skyLocations.texture, 0);
    restoreMainState();

    function replaceCity(geometry) {
      if (destroyed) throw new Error("Renderer has been destroyed");
      const next = { faces: null, edges: null, antennas: null };
      try {
        next.faces = createGeometry(geometry.faces, 3);
        next.edges = createGeometry(geometry.edges, 3);
        next.antennas = createGeometry(geometry.antennas, 3);
      } catch (error) {
        deleteGeometry(next.faces);
        deleteGeometry(next.edges);
        deleteGeometry(next.antennas);
        throw error;
      }
      deleteGeometry(cityGeometry.faces);
      deleteGeometry(cityGeometry.edges);
      deleteGeometry(cityGeometry.antennas);
      cityGeometry = next;
    }

    function updateSkyTexture(sourceCanvas) {
      if (destroyed || contextLost) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, skyTexture);
      if (skyTextureInitialized) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
        skyTextureInitialized = true;
      }
    }

    function drawGeometry(geometry, primitive, color) {
      if (!geometry || geometry.count === 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, geometry.buffer);
      gl.vertexAttribPointer(locations.position, 3, gl.FLOAT, false, 0, 0);
      gl.uniform4fv(locations.color, color);
      gl.drawArrays(primitive, 0, geometry.count);
    }

    function drawSky(view) {
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.useProgram(skyProgram);
      gl.bindBuffer(gl.ARRAY_BUFFER, skyGeometry.buffer);
      gl.enableVertexAttribArray(skyLocations.position);
      gl.enableVertexAttribArray(skyLocations.texCoord);
      gl.vertexAttribPointer(skyLocations.position, 3, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(skyLocations.texCoord, 2, gl.FLOAT, false, 20, 12);
      gl.uniformMatrix4fv(skyLocations.view, false, view);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, skyTexture);
      gl.uniform1i(skyLocations.texture, 0);
      gl.drawArrays(gl.TRIANGLES, 0, skyGeometry.count);
      gl.disableVertexAttribArray(skyLocations.position);
      gl.disableVertexAttribArray(skyLocations.texCoord);
      restoreMainState();
    }

    function render(camera, frameState) {
      if (destroyed || contextLost) return;
      const cosPitch = Math.cos(camera.pitch);
      const forward = [
        Math.sin(camera.yaw) * cosPitch,
        Math.sin(camera.pitch),
        -Math.cos(camera.yaw) * cosPitch
      ];
      const eye = [camera.x, camera.y, camera.z];
      const target = [camera.x + forward[0], camera.y + forward[1], camera.z + forward[2]];
      const view = Noseview.math.lookAt(eye, target, [0, 1, 0]);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (frameState.digitalRainEnabled) {
        drawSky(Noseview.math.lookAt([0, 0, 0], forward, [0, 1, 0]));
      } else {
        restoreMainState();
      }
      gl.uniform1f(locations.skyEnabled, frameState.digitalRainEnabled ? 1 : 0);
      gl.uniformMatrix4fv(locations.view, false, view);

      drawGeometry(groundFaces, gl.TRIANGLES, [0.002, 0.008, 0.004, 1]);
      drawGeometry(gridLines, gl.LINES, [0.0, 0.23, 0.08, 0.62]);
      drawGeometry(roadLines, gl.LINES, [0.0, 0.68, 0.28, 0.88]);

      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1, 1);
      drawGeometry(cityGeometry.faces, gl.TRIANGLES, [0.018, 0.085, 0.038, 1]);
      gl.disable(gl.POLYGON_OFFSET_FILL);

      const flicker = 0.92 + Math.sin(frameState.time * 0.009) * 0.055 + Math.sin(frameState.time * 0.037) * 0.02;
      drawGeometry(cityGeometry.edges, gl.LINES, [0.0, flicker, 0.34 * flicker, 1]);
      drawGeometry(
        cityGeometry.antennas,
        gl.LINES,
        frameState.analogVisionEnabled ? [0.0, 0.92, 0.4, 1] : [0.0, 0.78, 1.0, 1]
      );
    }

    function handleContextLost(event) {
      event.preventDefault();
      contextLost = true;
      if (typeof settings.onContextLost === "function") settings.onContextLost();
    }
    canvas.addEventListener("webglcontextlost", handleContextLost);

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      deleteGeometry(cityGeometry.faces);
      deleteGeometry(cityGeometry.edges);
      deleteGeometry(cityGeometry.antennas);
      deleteGeometry(groundFaces);
      deleteGeometry(gridLines);
      deleteGeometry(roadLines);
      deleteGeometry(skyGeometry);
      gl.deleteTexture(skyTexture);
      gl.deleteProgram(program);
      gl.deleteProgram(skyProgram);
    }

    return { replaceCity, updateSkyTexture, render, destroy };
  }

  Noseview.renderer = { createRenderer };
}(window));
