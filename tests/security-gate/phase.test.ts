import { createPhaseController } from "../../src/security-gate/phase";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

const a = createPhaseController();
const b = createPhaseController();
assert(a.getMode() === "plan", "new controller starts in PLAN");
assert(b.getMode() === "plan", "each controller starts in PLAN");
a.setBuild();
assert(a.getMode() === "build", "controller can enter BUILD");
assert(b.getMode() === "plan", "controller state is isolated");
a.reset();
assert(a.getMode() === "plan", "reset returns controller to PLAN");

console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
