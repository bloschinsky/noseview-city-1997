"use strict";

global.window = globalThis;

require("../src/namespace.js");
require("../src/engine/math.js");
require("../src/engine/city.js");
require("../src/engine/flight.js");
require("../src/engine/navigation.js");
require("../src/ui/hud.js");
require("./cases.js");

let failed = 0;
window.Noseview.tests.getCases().forEach(testCase => {
  try {
    testCase.run();
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${testCase.name}: ${error.message}`);
  }
});

if (failed > 0) {
  console.error(`${failed} test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("All pure-logic tests passed.");
}
