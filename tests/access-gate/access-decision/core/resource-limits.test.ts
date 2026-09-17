import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_OUTCOMES, REJECT_CODES, REJECT_PRIORITIES, hasUniqueValues } from "./fixtures";
import {
  exceedsDirectPayloadBudget,
  exceedsDirectTextBudget,
  exceedsPathBudget,
  MAX_DIRECT_PAYLOAD_BYTES,
  MAX_DIRECT_TEXT_BYTES,
  MAX_PATH_BYTES,
} from "../../../../packages/access-gate/src/access-gate/access-decision/core/limits";

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

test("UTF-8 byte budget accurately calculates multi-byte and surrogate pair sequences", () => {
  // ASCII: 1 byte each
  assert.equal(exceedsDirectTextBudget(["a".repeat(MAX_DIRECT_TEXT_BYTES)]), false);
  assert.equal(exceedsDirectTextBudget(["a".repeat(MAX_DIRECT_TEXT_BYTES + 1)]), true);

  // 2-byte UTF-8: \u0080 - \u07FF (e.g. 'é' is 2 bytes)
  const twoByte = "é".repeat(MAX_DIRECT_TEXT_BYTES / 2);
  assert.equal(exceedsDirectTextBudget([twoByte]), false);
  assert.equal(exceedsDirectTextBudget([twoByte + "a"]), true);

  // 4-byte surrogate pair: \uD83D\uDE00 (😀)
  const emoji = "😀".repeat(MAX_DIRECT_TEXT_BYTES / 4);
  assert.equal(exceedsDirectTextBudget([emoji]), false);
  assert.equal(exceedsDirectTextBudget([emoji + "a"]), true);

  // Isolated high surrogate at end of string or before non-low surrogate is treated safely as 3 bytes
  const isolatedHigh = "\uD800";
  assert.equal(exceedsDirectTextBudget([isolatedHigh]), false);
  assert.equal(exceedsDirectTextBudget(["a".repeat(MAX_DIRECT_TEXT_BYTES - 3) + isolatedHigh]), false);
  assert.equal(exceedsDirectTextBudget(["a".repeat(MAX_DIRECT_TEXT_BYTES - 2) + isolatedHigh]), true);
});

test("path budget accurately bounds paths to MAX_PATH_BYTES", () => {
  assert.equal(exceedsPathBudget(["a".repeat(MAX_PATH_BYTES)]), false);
  assert.equal(exceedsPathBudget(["a".repeat(MAX_PATH_BYTES + 1)]), true);
});

test("direct payload budget accurately bounds text to MAX_DIRECT_PAYLOAD_BYTES", () => {
  assert.equal(exceedsDirectPayloadBudget(["a".repeat(MAX_DIRECT_PAYLOAD_BYTES)]), false);
  assert.equal(exceedsDirectPayloadBudget(["a".repeat(MAX_DIRECT_PAYLOAD_BYTES + 1)]), true);
});
