import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadDecodedPolicyFile } from "../../../../packages/access-gate/src/access-gate/access-decision/adapters/index";

function agentDir(): { readonly path: string; readonly cleanup: () => void } {
  const path = mkdtempSync(join(tmpdir(), "akeel-unified-policy-"));
  mkdirSync(join(path, "akeel"), { recursive: true });
  return { path, cleanup: () => rmSync(path, { recursive: true, force: true }) };
}

test("loads flat policy schema into a decoded static snapshot", () => {
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
      "  opaque: deny",
      "  destroy: deny",
      "  unknown: deny",
      "",
    ].join("\n"));

    const result = loadDecodedPolicyFile(agent.path);

    assert.equal(result.kind, "enabled");
    assert.equal(result.activePreset, "static");
    assert.equal(result.switchable, false);
    assert.deepEqual(result.snapshots.static, {
      paths: {
        read: "allow",
        write: "ask",
        edit: "deny",
        list: "allow",
        search: "allow",
        allowedRoots: [],
        blockedRoots: [],
        blockedPaths: [],
      },
      commands: {
        inspect: "allow",
        modify: "ask",
        execute: "deny",
        opaque: "deny",
        destroy: "deny",
        unknown: "deny",
      },
    });
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

    const result = loadDecodedPolicyFile(agent.path);
    assert.equal(result.kind, "enabled");
    assert.equal(result.activePreset, "develop");
    assert.equal(result.switchable, true);
    assert.equal(result.snapshots.develop.paths.write, "allow");
  } finally {
    agent.cleanup();
  }
});

test("loads the explicit access-gate off mode", () => {
  const agent = agentDir();
  try {
    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "accessGate: off\n");
    const result = loadDecodedPolicyFile(agent.path);
    assert.equal(result.kind, "off");
    assert.equal(result.badges.review, "R");
    assert.equal(result.snapshots.develop.paths.write, "allow");

    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "accessGate: disabled\n");
    const disabledFallback = loadDecodedPolicyFile(agent.path);
    assert.equal(disabledFallback.kind, "enabled");
    assert.equal(disabledFallback.activePreset, "review");

    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "accessGate: off\npaths:\n  read: allow\n");
    const fallback = loadDecodedPolicyFile(agent.path);
    assert.equal(fallback.kind, "enabled");
    assert.equal(fallback.activePreset, "review");
  } finally {
    agent.cleanup();
  }
});

test("missing policy.yaml uses the built-in review fallback", () => {
  const agent = agentDir();
  try {
    const result = loadDecodedPolicyFile(agent.path);
    assert.equal(result.kind, "enabled");
    assert.equal(result.activePreset, "review");
    assert.deepEqual(Reflect.ownKeys(result.snapshots.review), ["paths", "commands"]);
  } finally {
    agent.cleanup();
  }
});

test("empty policy.yaml uses the built-in review fallback", () => {
  const agent = agentDir();
  try {
    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "");
    const result = loadDecodedPolicyFile(agent.path);
    assert.equal(result.kind, "enabled");
    assert.equal(result.activePreset, "review");
  } finally {
    agent.cleanup();
  }
});

test("incomplete external policy uses the built-in review fallback as a whole", () => {
  const agent = agentDir();
  try {
    for (const policy of [
      "{}\n",
      "paths:\n  read: allow\ncommands:\n  inspect: allow\n",
      "presets:\n  audit:\n    paths:\n      read: allow\n    commands:\n      inspect: allow\nactivePreset: audit\n",
    ]) {
      writeFileSync(join(agent.path, "akeel", "policy.yaml"), policy);
      const result = loadDecodedPolicyFile(agent.path);
      assert.equal(result.kind, "enabled", policy);
      assert.equal(result.activePreset, "review", policy);
    }
  } finally {
    agent.cleanup();
  }
});

test("invalid external policy uses the built-in review fallback as a whole", () => {
  const agent = agentDir();
  try {
    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "paths: [");
    const res1 = loadDecodedPolicyFile(agent.path);
    assert.equal(res1.kind, "enabled");
    if (res1.kind === "enabled") assert.equal(res1.activePreset, "review");

    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "defaultProfile: keel-develop\n");
    const res2 = loadDecodedPolicyFile(agent.path);
    assert.equal(res2.kind, "enabled");
    if (res2.kind === "enabled") assert.equal(res2.activePreset, "review");

    writeFileSync(join(agent.path, "akeel", "policy.yaml"), "accessGate: enabled\n");
    const res3 = loadDecodedPolicyFile(agent.path);
    assert.equal(res3.kind, "enabled");
    if (res3.kind === "enabled") assert.equal(res3.activePreset, "review");
  } finally {
    agent.cleanup();
  }
});
