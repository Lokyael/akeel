// access-gate/config/load.ts — 集中用户配置加载唯一入口（D-041）
// 所有 pi-keel 用户配置集中在 ~/.pi/agent/pi-keel/config.yaml（PI_CODING_AGENT_DIR 可改变 agent 目录）。
// 旧式 profiles.json / command-overrides.yaml 已废弃且不兼容：配置以 config.yaml 为唯一来源。

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getAgentDir } from "../agent-dir";
import type { KeelConfig } from "./types";

/** 加载结果：none（无用户配置）/ ok（解析成功）/ error（损坏，fail-closed 由调用方降级）。 */
export type ConfigLoad =
  | { kind: "none" }
  | { kind: "ok"; value: KeelConfig }
  | { kind: "error"; message: string };

const _cache = new Map<string, ConfigLoad>();

export function loadConfig(agentDir = getAgentDir()): ConfigLoad {
  const cached = _cache.get(agentDir);
  if (cached) return cached;

  const configPath = join(agentDir, "pi-keel", "config.yaml");

  if (!existsSync(configPath)) {
    _cache.set(agentDir, { kind: "none" });
    return { kind: "none" };
  }

  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(configPath, "utf-8"));
  } catch (error) {
    const message = `pi-keel: failed to load ${configPath}: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message);
    _cache.set(agentDir, { kind: "error", message });
    return { kind: "error", message };
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    const message = `pi-keel: ${configPath} must be a YAML mapping`;
    console.error(message);
    _cache.set(agentDir, { kind: "error", message });
    return { kind: "error", message };
  }

  const cfg = raw as KeelConfig;
  if (cfg.optionalAdapters !== undefined) {
    const valid = Array.isArray(cfg.optionalAdapters) && cfg.optionalAdapters.every((n) => typeof n === "string");
    if (!valid) {
      const message = `pi-keel: ${configPath}: optionalAdapters must be a list of adapter names`;
      console.error(message);
      _cache.set(agentDir, { kind: "error", message });
      return { kind: "error", message };
    }
  }

  const result: ConfigLoad = { kind: "ok", value: cfg };
  _cache.set(agentDir, result);
  return result;
}

/** 仅用于测试：重置加载缓存。 */
export function resetConfig(): void {
  _cache.clear();
}
