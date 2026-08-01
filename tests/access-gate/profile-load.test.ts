import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProfiles } from "../../src/access-gate/profile/load";

test("loads the built-in profiles with keel-plan as the default", () => {
  const result = loadProfiles({ agentDir: "/tmp/pi-access-agent-does-not-exist" });
  assert.equal(result.defaultProfile, "keel-plan");
  assert.ok(result.profiles["keel-plan"]);
  assert.match(result.profiles["keel-plan"].description, /docs.*CONTEXT/);
});

test("global profiles override same-name built-ins and project profiles are ignored", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-access-agent-"));
  const project = mkdtempSync(join(tmpdir(), "pi-access-project-"));
  try {
    mkdirSync(join(agentDir, "extensions", "access-gate"), { recursive: true });
    mkdirSync(join(project, ".pi", "extensions", "access-gate"), { recursive: true });
    writeFileSync(join(agentDir, "extensions", "access-gate", "profiles.json"), JSON.stringify({
      defaultProfile: "keel-develop",
      profiles: {
        "keel-develop": {
          extends: ["keel-read"],
          description: "Global develop profile.",
          shellPolicy: { unknown: "ask" },
        },
      },
    }));
    writeFileSync(join(project, ".pi", "extensions", "access-gate", "profiles.json"), JSON.stringify({
      defaultProfile: "keel-query",
      profiles: {
        "keel-develop": {
          extends: ["keel-read"],
          description: "Project develop profile.",
          shellPolicy: { unknown: "ask" },
        },
      },
    }));

    const result = loadProfiles({ agentDir });

    assert.equal(result.defaultProfile, "keel-develop");
    assert.equal(result.profiles["keel-develop"].description, "Global develop profile.");
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test("global profiles win and project profiles are ignored", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-access-agent-"));
  const project = mkdtempSync(join(tmpdir(), "pi-access-project-"));
  try {
    mkdirSync(join(agentDir, "extensions", "access-gate"), { recursive: true });
    mkdirSync(join(project, ".pi", "extensions", "access-gate"), { recursive: true });
    writeFileSync(join(agentDir, "extensions", "access-gate", "profiles.json"), JSON.stringify({
      defaultProfile: "keel-read",
      profiles: {},
    }));
    writeFileSync(join(project, ".pi", "extensions", "access-gate", "profiles.json"), JSON.stringify({
      defaultProfile: "keel-build",
      profiles: {},
    }));

    const result = loadProfiles({ agentDir });
    assert.equal(result.defaultProfile, "keel-read");
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test("invalid global profiles fail closed to keel-read", () => {
  const agentDir = mkdtempSync(join(tmpdir(), "pi-access-agent-"));
  try {
    mkdirSync(join(agentDir, "extensions", "access-gate"), { recursive: true });
    writeFileSync(join(agentDir, "extensions", "access-gate", "profiles.json"), "{ bad json");

    assert.equal(loadProfiles({ agentDir }).defaultProfile, "keel-read");
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
});
