import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { parse as parseYaml } from "yaml";
import { validateExternalPolicyConfig } from "./config";
import type { PolicyConfig } from "./config";

const BUILTIN_REVIEW_POLICY: PolicyConfig = Object.freeze({
  presets: Object.freeze({ review: Object.freeze({}) }),
  activePreset: "review",
});

function defaultAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

export function resolveAgentDir(agentDir = defaultAgentDir()): string {
  return resolvePath(agentDir);
}

function deepFreeze(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return typeof value === "object" && value !== null ? Object.freeze(value) : value;
}

function builtinReviewPolicy(): PolicyConfig {
  return BUILTIN_REVIEW_POLICY;
}

export function loadPolicyFile(agentDir = defaultAgentDir()): PolicyConfig {
  const path = join(resolveAgentDir(agentDir), "akeel", "policy.yaml");
  if (!existsSync(path)) return builtinReviewPolicy();

  let value: unknown;
  try {
    value = parseYaml(readFileSync(path, "utf8"));
    validateExternalPolicyConfig(value);
  } catch {
    return builtinReviewPolicy();
  }
  return deepFreeze(value) as PolicyConfig;
}
