(function (root) {
  "use strict";

  const Noseview = root.Noseview;
  const output = root.document.getElementById("test-output");
  let passed = 0;
  let failed = 0;

  function addResult(name, status, details) {
    const row = root.document.createElement("li");
    row.className = status.toLowerCase();
    row.textContent = `${status} — ${name}${details ? `: ${details}` : ""}`;
    output.appendChild(row);
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
  }

  async function runCase(testCase) {
    try {
      await testCase.run();
      passed += 1;
      addResult(testCase.name, "PASS");
    } catch (error) {
      failed += 1;
      addResult(testCase.name, "FAIL", error.message);
    }
  }

  function delay(milliseconds) {
    return new Promise(resolve => root.setTimeout(resolve, milliseconds));
  }

  async function runLifecycleCase() {
    const canvas = root.document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    canvas.className = "test-canvas";
    root.document.body.appendChild(canvas);
    const telemetryTimes = [];
    const engine = Noseview.createNoseviewEngine(canvas, {
      onTelemetry() { telemetryTimes.push(root.performance.now()); }
    });
    try {
      engine.start();
      await delay(360);
      assert(telemetryTimes.length >= 1, "Engine did not emit its initial telemetry");
      telemetryTimes.slice(1).forEach((time, index) => {
        assert(time - telemetryTimes[index] >= 90, "Telemetry exceeded the 10 Hz limit");
      });
      await engine.destroy();
      await engine.destroy();
      const countAfterDestroy = telemetryTimes.length;
      await delay(220);
      assert(telemetryTimes.length === countAfterDestroy, "Telemetry continued after destroy()");
      let startFailed = false;
      try {
        engine.start();
      } catch (_error) {
        startFailed = true;
      }
      assert(startFailed, "Destroyed engine started again");
    } finally {
      await engine.destroy();
      canvas.remove();
    }
  }

  async function run() {
    for (const testCase of Noseview.tests.getCases()) {
      await runCase(testCase);
    }
    await runCase({ name: "engine lifecycle stops RAF and telemetry", run: runLifecycleCase });
    const summary = root.document.getElementById("test-summary");
    summary.textContent = `${passed} passed, ${failed} failed`;
    summary.className = failed === 0 ? "pass" : "fail";
    root.document.title = failed === 0 ? "PASS — NOSEVIEW tests" : "FAIL — NOSEVIEW tests";
    root.__noseviewTestResult = { passed, failed };
  }

  run();
}(window));
