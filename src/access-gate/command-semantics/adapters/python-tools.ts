// Python ecosystem quality tools — ruff, mypy, black, isort, pylint, pytest, pyright.
//
// Classification principles:
//   inspect  — read-only analysis (lint, type-check, format-check)
//   modify   — mutates source files (format, sort-imports, auto-fix)
//   execute  — runs user code with unknown side effects (test runner)
//
// Design Twice result:
//   Alternative A: one adapter per tool → too many shallow modules
//   Alternative B: config table per tool, shared extraction logic → deeper module ✅
//
// No path intents for v1.  modify tools rely on the shell-compiler's conservative
// write-on-cwd fallback; inspect tools are gated by shellPolicy.inspect.

import type { ShellCommandNode } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, SemanticContext } from "../types";
import { makeSemantics } from "./shared";
import { parseOptions, type Opt } from "./option-parse";

// ─── config types ───

interface PyToolDef {
  cls: "inspect" | "modify" | "execute";
  subcommands?: Record<string, { cls: "inspect" | "modify" | "execute"; reason: string }>;
  /** Flags that downgrade modify → inspect (e.g. --check, --diff)；声明为 downgradeTo: "inspect"（T-059/B1）。 */
  inspectFlags?: string[];
  /** Flags that upgrade inspect → modify (e.g. --fix)；声明为 upgradeTo: "modify"（T-059/B1）。 */
  modifyFlags?: string[];
  reason: string;
}

// ─── tool registry ───

const PY_TOOLS: Record<string, PyToolDef> = {
  ruff: {
    cls: "inspect", // default = ruff check
    inspectFlags: ["--check", "--diff"],
    modifyFlags: ["--fix"],
    subcommands: {
      "check": { cls: "inspect", reason: "ruff lint check" },
      "format": { cls: "modify", reason: "ruff format" },
      "rule": { cls: "inspect", reason: "ruff rule info" },
      "linter": { cls: "inspect", reason: "ruff linter info" },
      "clean": { cls: "modify", reason: "ruff clean cache" },
    },
    reason: "ruff linter",
  },

  mypy: {
    cls: "inspect",
    reason: "mypy type-check",
  },

  black: {
    cls: "modify", // formats by default
    inspectFlags: ["--check", "--diff"],
    reason: "black format",
  },

  isort: {
    cls: "modify", // sorts by default
    inspectFlags: ["--check", "--check-only", "--diff"],
    reason: "isort import sort",
  },

  pylint: {
    cls: "inspect",
    reason: "pylint static analysis",
  },

  pytest: {
    cls: "execute", // tests can have arbitrary side effects
    reason: "pytest test runner",
  },

  pyright: {
    cls: "inspect",
    reason: "pyright type-check",
  },
};

// ─── option parsing ───

/**
 * Common Python tool options that take a following value token（值非路径，kind: expression，T-059）。
 * Not exhaustive — missing an option just means its value might be treated
 * as an unknown subcommand, which falls back to the tool's default class.
 * This is safe: it's a false-negative classification, not a security bypass.
 */
const VALUE_OPTS: readonly Opt[] = [
  { names: ["--config", "--config-file", "--line-length", "--target-version", "--extend-exclude", "--extend-ignore", "--extend-select", "--ignore", "--exclude", "--select", "--output-file", "--output", "--cache-dir", "--python-version", "--platform", "--follow-imports", "--max-line-length", "--cov", "--cov-report", "--cov-config", "--junitxml"], kind: "expression", forms: ["separated", "equals"] },
  // pytest
  { names: ["-k", "--maxfail", "--tb", "-n", "--numprocesses", "--dist", "--timeout"], kind: "expression", forms: ["separated", "equals"] },
];

/** 工具级 class 调节 Opt 表（T-059/B1）：inspectFlags → downgradeTo inspect、modifyFlags → upgradeTo modify。 */
function adjustOpts(def: PyToolDef): Opt[] {
  const opts: Opt[] = [];
  if (def.inspectFlags) opts.push({ names: def.inspectFlags, kind: "flag", downgradeTo: "inspect" });
  if (def.modifyFlags) opts.push({ names: def.modifyFlags, kind: "flag", upgradeTo: "modify" });
  return opts;
}

// ─── adapter ───

export const pythonToolsAdapter: CommandAdapter = {
  names: Object.keys(PY_TOOLS),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const def = PY_TOOLS[name];
    if (!def) return makeSemantics("unknown", { reason: `unknown python tool: ${name}`, opaque: true });

    // 引擎投影：取值选项被消费，positional[0] = 子命令首词；
    // classAdjust 由工具级调节 flag 声明驱动（T-059/B1，替代 hasFlag 手写扫描）
    const { positional, classAdjust } = parseOptions(node.args, {
      opts: [...VALUE_OPTS, ...adjustOpts(def)],
      positional: "file",
      opaqueOnUnknown: false,
    });

    // 1. Resolve base class: subcommand overrides default
    let cls = def.cls;
    let reason = def.reason;
    const subcmd = positional[0]?.value ?? "";
    if (def.subcommands && subcmd) {
      const sub = def.subcommands[subcmd];
      if (sub) {
        cls = sub.cls;
        reason = sub.reason;
      }
    }

    // 2. Apply classAdjust（引擎风险序 fail-closed：destroy > modify > inspect）：
    //    modify 工具被 --check 降级 inspect；inspect 工具被 --fix 升级 modify。
    //    同工具不共存 upgrade+downgrade 命中（black/isort 仅 downgrade、ruff 仅 upgrade）。
    if (classAdjust === "inspect" && cls === "modify") {
      cls = "inspect";
      reason = `${reason} (check-only)`;
    } else if (classAdjust === "modify" && cls === "inspect") {
      cls = "modify";
      reason = `${reason} (with fixes)`;
    }

    return makeSemantics(cls, { reason });
  },
};
