import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { parse as parseYaml } from "yaml";
import { decodePolicyConfiguration } from "./config";
import type { DecodedPolicyConfiguration, PolicyConfig } from "./config";

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

function builtinReviewPolicy(): PolicyConfig {
  return BUILTIN_REVIEW_POLICY;
}

export function loadDecodedPolicyFile(agentDir = defaultAgentDir()): DecodedPolicyConfiguration {
  const path = join(resolveAgentDir(agentDir), "akeel", "policy.yaml");
  if (!existsSync(path)) return decodePolicyConfiguration(builtinReviewPolicy(), true);

  try {
    const value = parseYaml(readFileSync(path, "utf8"));
    return decodePolicyConfiguration(value, true);
  } catch {
    return decodePolicyConfiguration(builtinReviewPolicy(), true);
  }
}
