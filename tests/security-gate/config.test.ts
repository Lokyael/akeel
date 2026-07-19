import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cloneConfig, loadConfig, validateConfig } from "../../src/security-gate/config/index";
import type { SecurityConfig } from "../../src/security-gate/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) passed++;
  else {
    failed++;
    console.error(`FAIL: ${message}`);
  }
}

function validConfig(): Omit<SecurityConfig, "permission"> & { permission: Omit<SecurityConfig["permission"], "bash"> & { bash?: Record<string, "allow" | "deny" | "ask"> } } {
  return {
    level: "standard",
    permission: {
      "*": "ask",
      path: { "*": "allow" },
      read: { "*": "allow" },
      write: { "*": "ask" },
      edit: { "*": "ask" },
      external_directory: "ask",
      bash: {},
    },
  };
}

console.log("config validation");
{
  const result = validateConfig(validConfig());
  assert(result !== null, "config with explicit permission.bash is accepted");
}
{
  const invalid = { ...validConfig(), level: "unknown" };
  assert(validateConfig(invalid) === null, "unknown security level is rejected");
}
{
  const invalid = { ...validConfig(), permission: { ...validConfig().permission, unknown: "allow" } };
  assert(validateConfig(invalid) === null, "unknown permission field is rejected");
}
{
  const invalid = { ...validConfig(), sandbox: {} };
  assert(validateConfig(invalid) === null, "removed sandbox field is rejected");
}
{
  const invalid = { ...validConfig(), audit: { enabled: true } };
  assert(validateConfig(invalid) === null, "removed audit field is rejected");
}
{
  const invalid = { ...validConfig(), permission: { ...validConfig().permission, path: { "*": "maybe" } } };
  assert(validateConfig(invalid) === null, "invalid permission action is rejected");
}
{
  const withHardPath = { ...validConfig(), permission: { ...validConfig().permission, hardPath: [".env", "*.pem"] } };
  assert(validateConfig(withHardPath) !== null, "config with hardPath is valid");
  assert(validateConfig(withHardPath)!.permission.hardPath!.length === 2, "hardPath is preserved through validation");
}
console.log("config cloning");
{
  const config = validateConfig(validConfig())!;
  const clone = cloneConfig(config);
  clone.permission.path["new/**"] = "deny";
  assert(config.permission.path["new/**"] === undefined, "clone does not share permission object");
}

console.log("config loading");
{
  const agentDir = mkdtempSync(join(tmpdir(), "pi-keel-agent-"));
  const project = mkdtempSync(join(tmpdir(), "pi-keel-project-"));
  mkdirSync(join(agentDir, "extensions", "security-gate"), { recursive: true });
  mkdirSync(join(project, ".pi", "extensions", "security-gate"), { recursive: true });
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  writeFileSync(join(agentDir, "extensions", "security-gate", "config.json"), "{ bad json");
  const base = loadConfig(project);
  assert(base.level === "standard", "malformed global config falls back to standard");
  writeFileSync(join(agentDir, "extensions", "security-gate", "config.json"), JSON.stringify({ level: "strict" }));
  writeFileSync(join(project, ".pi", "extensions", "security-gate", "config.json"), "{ bad json");
  const preserved = loadConfig(project);
  assert(preserved.level === "strict", "malformed project config preserves validated global base");

  writeFileSync(join(agentDir, "extensions", "security-gate", "config.json"), JSON.stringify({ level: "standard" }));
  writeFileSync(join(project, ".pi", "extensions", "security-gate", "config.json"), JSON.stringify({ level: "strict" }));
  const projectStrict = loadConfig(project);
  const strictWrite = projectStrict.permission.write;
  assert(projectStrict.level === "strict", "project level selects the strict preset");
  assert(typeof strictWrite !== "string" && strictWrite["src/**"] === "allow", "project strict level uses strict write policy");

  writeFileSync(join(project, ".pi", "extensions", "security-gate", "config.json"), JSON.stringify({
    level: "strict",
    permission: { write: { "src/**": "deny" } },
  }));
  const projectOverride = loadConfig(project);
  const overrideWrite = projectOverride.permission.write;
  assert(typeof overrideWrite !== "string" && overrideWrite["src/**"] === "deny", "project overrides apply after selected preset");
  assert(typeof overrideWrite !== "string" && overrideWrite["*.lock"] === "deny", "selected preset rules remain when project overrides one rule");

  if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previous;
  rmSync(agentDir, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
}

console.log(`RESULTS: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
