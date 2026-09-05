import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { adaptPolicyConfig, adaptPolicyPresets } from "./config";
import type { PolicyConfig } from "./config";

export type PolicyFileLoad =
  | Readonly<{ readonly kind: "ok"; readonly value: PolicyConfig }>
  | Readonly<{ readonly kind: "error" }>;

function defaultAgentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function deepFreeze(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return typeof value === "object" && value !== null ? Object.freeze(value) : value;
}

function error(): PolicyFileLoad {
  return Object.freeze({ kind: "error" });
}

export function loadPolicyFile(agentDir = defaultAgentDir()): PolicyFileLoad {
  const path = join(agentDir, "akeel", "policy.yaml");
  if (!existsSync(path)) return Object.freeze({ kind: "ok", value: Object.freeze({}) });

  let value: unknown;
  try {
    value = parseYaml(readFileSync(path, "utf8"));
    adaptPolicyConfig(value);
    adaptPolicyPresets(value);
  } catch {
    return error();
  }
  return Object.freeze({ kind: "ok", value: deepFreeze(value) as PolicyConfig });
}
