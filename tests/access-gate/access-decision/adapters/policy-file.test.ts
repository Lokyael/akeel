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
      "  edit: deny",
      "  list: allow",
      "  search: allow",
      "commands:",
      "  inspect: allow",
      "  modify: ask",
      "  execute: deny",
      "  destroy: deny",
      "  unknown: deny",
      "",
    ].join("\n"));

    const result = loadPolicyFile(agent.path);

    assert.deepEqual(result, {
      paths: {
        read: "allow",
        write: "ask",
        edit: "deny",
        list: "allow",
        search: "allow",
      },
      commands: {
        inspect: "allow",
        modify: "ask",
        execute: "deny",
        destroy: "deny",
        unknown: "deny",
      },
    });
    assert.equal(Object.isFrozen(result), true);
  } finally {
    agent.cleanup();
  }
});

test("loads named policy presets and active selection", () => {
  const agent = agentDir();
  try {
    writeFileSync(join(agent.path, "akeel", "policy.yaml"), [
      "presets:",
      "  review:",
      "    paths:",
      "      read: allow",
      "    commands:",
      "      inspect: allow",
      "  guided:",
      "    paths:",
      "      read: allow",
      "      write: ask",
      "      edit: ask",
      "    commands:",
      "      inspect: allow",
      "      modify: ask",
      "      execute: ask",
      "  develop:",
      "    paths:",
      "      read: allow",
      "      write: allow",
      "      edit: allow",
      "    commands:",
      "      inspect: allow",
      "      modify: allow",
      "      execute: allow",
      "activePreset: develop",
      "",
    ].join("\n"));

    const result = loadPolicyFile(agent.path);
    assert.equal(result.activePreset, "develop");
  } finally {
    agent.cleanup();
  }
});

test("loads the explicit access-gate disabled mode", () => {
  const agent = agentDir();
  try {
    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "accessGate: disabled\n");
    assert.deepEqual(loadPolicyFile(agent.path), { accessGate: "disabled" });

    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "accessGate: disabled\npaths:\n  read: allow\n");
    assert.deepEqual(loadPolicyFile(agent.path), BUILTIN_REVIEW_POLICY);
  } finally {
    agent.cleanup();
  }
});

const BUILTIN_REVIEW_POLICY = {
  presets: { review: {} },
  activePreset: "review",
} as const;

test("missing policy.yaml uses the built-in review policy", () => {
  const agent = agentDir();
  try {
    assert.deepEqual(loadPolicyFile(agent.path), BUILTIN_REVIEW_POLICY);
  } finally {
    agent.cleanup();
  }
});

test("empty policy.yaml uses the built-in review policy", () => {
  const agent = agentDir();
  try {
    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "");
    assert.deepEqual(loadPolicyFile(agent.path), BUILTIN_REVIEW_POLICY);
  } finally {
    agent.cleanup();
  }
});

test("incomplete external policy uses the built-in review policy as a whole", () => {
  const agent = agentDir();
  try {
    for (const policy of [
      "{}\n",
      "paths:\n  read: allow\ncommands:\n  inspect: allow\n",
      "presets:\n  audit:\n    paths:\n      read: allow\n    commands:\n      inspect: allow\nactivePreset: audit\n",
    ]) {
      writeFileSync(join(agent.path, "akeel", "policy.yaml"), policy);
      assert.deepEqual(loadPolicyFile(agent.path), BUILTIN_REVIEW_POLICY, policy);
    }
  } finally {
    agent.cleanup();
  }
});

test("invalid external policy uses the built-in review policy as a whole", () => {
  const agent = agentDir();
  try {
    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "paths: [");
    assert.deepEqual(loadPolicyFile(agent.path), BUILTIN_REVIEW_POLICY);

    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "defaultProfile: keel-develop\n");
    assert.deepEqual(loadPolicyFile(agent.path), BUILTIN_REVIEW_POLICY);

    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "accessGate: enabled\n");
    assert.deepEqual(loadPolicyFile(agent.path), BUILTIN_REVIEW_POLICY);
  } finally {
    agent.cleanup();
  }
});
