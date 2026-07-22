import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadProfiles } from "../../src/access-gate/profile/load";

test("loads the built-in profiles with keel-plan as the default", () => {
  const project = mkdtempSync(join(tmpdir(), "pi-access-profile-"));
  try {
    const result = loadProfiles(project, "/tmp/pi-access-agent-does-not-exist");
    assert.equal(result.defaultProfile, "keel-plan");
    assert.ok(result.profiles["keel-plan"]);
    assert.match(result.profiles["keel-plan"].description, /docs.*CONTEXT/);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("project profiles override same-name built-ins and can extend them", () => {
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
          shellPolicy: { unclassified: "ask" },
        },
      },
    }));
    writeFileSync(join(project, ".pi", "extensions", "access-gate", "profiles.json"), JSON.stringify({
      defaultProfile: "keel-query",
      profiles: {
        "keel-develop": {
          extends: ["keel-read"],
          description: "Project develop profile.",
          shellPolicy: { unclassified: "ask" },
        },
      },
    }));

    const previous = process.env.PI_CODING_AGENT_DIR;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    const result = loadProfiles(project);
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;

    assert.equal(result.defaultProfile, "keel-query");
    assert.equal(result.profiles["keel-develop"].description, "Project develop profile.");
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test("does not load project profiles when project trust is absent", () => {
  const project = mkdtempSync(join(tmpdir(), "pi-access-profile-"));
  try {
    mkdirSync(join(project, ".pi", "extensions", "access-gate"), { recursive: true });
    writeFileSync(join(project, ".pi", "extensions", "access-gate", "profiles.json"), JSON.stringify({ defaultProfile: "keel-develop", profiles: {} }));
    assert.equal(loadProfiles(project, "/tmp/pi-access-agent-does-not-exist", false).defaultProfile, "keel-plan");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("ignores malformed project profiles and keeps the built-in default", () => {
  const project = mkdtempSync(join(tmpdir(), "pi-access-profile-"));
  try {
    mkdirSync(join(project, ".pi", "extensions", "access-gate"), { recursive: true });
    writeFileSync(join(project, ".pi", "extensions", "access-gate", "profiles.json"), "{ bad json");
    assert.equal(loadProfiles(project, "/tmp/pi-access-agent-does-not-exist").defaultProfile, "keel-plan");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});
