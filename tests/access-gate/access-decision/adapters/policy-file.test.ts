import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadPolicyFile } from "../../../../src/access-gate/access-decision";

function agentDir(): { readonly path: string; readonly cleanup: () => void } {
  const path = mkdtempSync(join(tmpdir(), "akeel-policy-"));
  mkdirSync(join(path, "akeel"), { recursive: true });
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

test("loads and freezes the new global policy.yaml schema", () => {
  const agent = agentDir();
  try {
    writeFileSync(join(agent.path, "akeel", "policy.yaml"), [
      "paths:",
      "  read: allow",
      "  write: ask",
      "commands:",
      "  inspect: allow",
      "  modify: ask",
      "",
    ].join("\n"));

    const result = loadPolicyFile(agent.path);

    assert.deepEqual(result, {
      kind: "ok",
      value: {
        paths: { read: "allow", write: "ask" },
        commands: { inspect: "allow", modify: "ask" },
      },
    });
    if (result.kind === "ok") assert.equal(Object.isFrozen(result.value), true);
  } finally {
    agent.cleanup();
  }
});

test("missing policy.yaml supplies the closed empty new policy", () => {
  const agent = agentDir();
  try {
    assert.deepEqual(loadPolicyFile(agent.path), { kind: "ok", value: {} });
  } finally {
    agent.cleanup();
  }
});

test("rejects malformed YAML and legacy configuration fields", () => {
  const agent = agentDir();
  try {
    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "paths: [");
    assert.deepEqual(loadPolicyFile(agent.path), { kind: "error" });

    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "defaultProfile: keel-develop\n");
    assert.deepEqual(loadPolicyFile(agent.path), { kind: "error" });
  } finally {
    agent.cleanup();
  }
});
