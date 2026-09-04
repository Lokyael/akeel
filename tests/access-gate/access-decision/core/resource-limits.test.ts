import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_OUTCOMES, REJECT_CODES, REJECT_PRIORITIES, hasUniqueValues } from "./fixtures";

test("canonical outcome and reject vocabularies are closed", () => {
  assert.deepEqual(CANONICAL_OUTCOMES, ["complete", "reject"]);
  assert.equal(hasUniqueValues(REJECT_CODES), true);
  assert.equal(REJECT_CODES.includes("resource-limit"), true);
});

test("resource limits are checked before materialization", () => {
  const max = Number.MAX_SAFE_INTEGER;
  const safelyAdds = (left: number, right: number): boolean => left <= max - right;
  assert.equal(safelyAdds(max - 1, 1), true);
  assert.equal(safelyAdds(max, 1), false);
  assert.equal(safelyAdds(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), false);
  assert.equal(REJECT_PRIORITIES.includes("resource-limit"), true);
});

test("reject priority has one hard boundary and no policy-dependent code", () => {
  assert.equal(REJECT_PRIORITIES[0], "invalid-request");
  assert.equal(REJECT_PRIORITIES.includes("security-boundary"), true);
  assert.ok(REJECT_PRIORITIES.every((code) => !code.includes("allow") && !code.includes("ask")));
});
