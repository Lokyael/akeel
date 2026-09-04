import assert from "node:assert/strict";
import test from "node:test";
import { ADMISSION_FACTS, DISPLAY_FACTS, FORBIDDEN_ADMISSION_FACTS, hasUniqueValues } from "./fixtures";

test("admission is a minimal sealed fact vocabulary", () => {
  assert.equal(hasUniqueValues(ADMISSION_FACTS), true);
  assert.deepEqual(ADMISSION_FACTS, ["command", "path", "resolved-candidate", "source-anchor", "confidence"]);
  assert.ok(ADMISSION_FACTS.includes("resolved-candidate"));
  assert.ok(ADMISSION_FACTS.includes("confidence"));
});

test("admission excludes display, configuration, raw input, and future flow facts", () => {
  for (const forbidden of FORBIDDEN_ADMISSION_FACTS) {
    assert.ok(!ADMISSION_FACTS.includes(forbidden as (typeof ADMISSION_FACTS)[number]), forbidden);
  }
  assert.ok(DISPLAY_FACTS.includes("source-coordinate"));
  assert.ok(!ADMISSION_FACTS.includes("source-coordinate" as (typeof ADMISSION_FACTS)[number]));
});

test("display contract is separate from admission facts", () => {
  assert.deepEqual(DISPLAY_FACTS, ["source-coordinate", "bounded-text", "decision-code"]);
  assert.equal(new Set([...ADMISSION_FACTS, ...DISPLAY_FACTS]).size, ADMISSION_FACTS.length + DISPLAY_FACTS.length);
});
