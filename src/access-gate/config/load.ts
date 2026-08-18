// access-gate/config/load.ts — 集中用户配置加载唯一入口（D-041）
// 所有 pi-keel 用户配置集中在 ~/.pi/agent/pi-keel/config.yaml（PI_CODING_AGENT_DIR 可改变 agent 目录）。
// 旧式 profiles.json / command-overrides.yaml 已废弃且不兼容：配置以 config.yaml 为唯一来源。

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getAgentDir } from "../agent-dir";
import { COMMAND_CLASS_SET, EFFECT_SET } from "../domain";
import type { CommandDef, KeelConfig } from "./types";

/** 加载结果：none（无用户配置）/ ok（解析成功）/ error（损坏，fail-closed 由调用方降级）。 */
export type ConfigLoad =
  | { kind: "none" }
  | { kind: "ok"; value: KeelConfig }
  | { kind: "error"; message: string };

const _cache = new Map<string, ConfigLoad>();

/**
 * 语义校验 commands 段（B：加载即校验边界）。
 * 原位于 overrides（消费方分析时抛）；前移至 config 加载期，损坏配置在 session 启动
 * 经 loadProfiles 的 error 路径 report + fail-closed，而非命令分析时未捕获 throw。
 * 返回 null 表示通过，否则是错误消息。
 */
function validateCommandDef(name: string, def: CommandDef): string | null {
  if (!COMMAND_CLASS_SET.has(def.class)) return `invalid class "${def.class}"`;
  if (def.effects && !def.effects.every((effect) => EFFECT_SET.has(effect))) {
    const bad = def.effects.find((effect) => !EFFECT_SET.has(effect))!;
    return `invalid effect "${bad}"`;
  }
  if (def.subcommands) {
    for (const [sc, sub] of Object.entries(def.subcommands)) {
      if (!COMMAND_CLASS_SET.has(sub.class)) return `${name}.${sc}: invalid class "${sub.class}"`;
      if (sub.effects && !sub.effects.every((effect) => EFFECT_SET.has(effect))) {
        const bad = sub.effects.find((effect) => !EFFECT_SET.has(effect))!;
        return `${name}.${sc}: invalid effect "${bad}"`;
      }
    }
  }
  return null;
}

/** 校验 commands 段（commands 与 reclassify 的 class 合法性）。返回错误消息或 null。 */
function validateCommands(configPath: string, commands: NonNullable<KeelConfig["commands"]>): string | null {
  if (commands.commands) {    for (const [name, def] of Object.entries(commands.commands)) {
      const err = validateCommandDef(name, def);
      if (err) return `${configPath}: commands.${name}: ${err}`;
    }
  }
  if (commands.reclassify) {
    for (const rule of commands.reclassify) {
      if (!COMMAND_CLASS_SET.has(rule.class)) {
        return `${configPath}: reclassify[${rule.command}]: invalid class "${rule.class}"`;
      }
    }
  }
  return null;
}

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

  // B：加载即校验——commands 语义（class/effect/reclassify）在首次解析时验证，
  // 损坏配置立即 fail-closed，不等命令分析时触发。
  if (cfg.commands != null) {
    const commandErr = validateCommands(configPath, cfg.commands);
    if (commandErr) {
      console.error(`pi-keel: ${commandErr}`);
      _cache.set(agentDir, { kind: "error", message: commandErr });
      return { kind: "error", message: commandErr };
    }
  }

  const result: ConfigLoad = { kind: "ok", value: cfg };
  _cache.set(agentDir, result);
  return result;
}

/** 仅用于测试：重置加载缓存。 */
export function resetConfigCache(): void {
  _cache.clear();
}
