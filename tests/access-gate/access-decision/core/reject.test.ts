import assert from "node:assert/strict";
import test from "node:test";
import { isCanonicalReject } from "../../../../src/access-gate/access-decision/core/index";

test("canonical reject recognition requires the complete closed shape", () => {
  assert.equal(
    isCanonicalReject({ kind: "reject", code: "invalid-request" }),
    false,
  );
});
