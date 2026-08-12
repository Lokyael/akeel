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

import type { ShellCommandNode, ShellArg } from "../../shell-parse/types";
import type { CommandAdapter, CommandSemantics, SemanticContext } from "../types";
import { makeSemantics } from "./shared";
import { parseOptions, type Opt } from "./option-parse";

// ─── config types ───

interface PyToolDef {
  cls: "inspect" | "modify" | "execute";
  subcommands?: Record<string, { cls: "inspect" | "modify" | "execute"; reason: string }>;
  /** Flags that downgrade modify → inspect (e.g. --check, --diff). */
  inspectFlags?: string[];
  /** Flags that upgrade inspect → modify (e.g. --fix). */
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

/** Check if any of the given flags are present in args (exact or --flag=value form). */
function hasFlag(args: readonly ShellArg[], flags: string[]): boolean {
  return args.some((a) => {
    const v = a.value ?? "";
    return flags.some((f) => v === f || v.startsWith(f + "="));
  });
}

// ─── adapter ───

export const pythonToolsAdapter: CommandAdapter = {
  names: Object.keys(PY_TOOLS),
  analyze(node: ShellCommandNode, _context: SemanticContext): CommandSemantics {
    const name = node.executable?.value?.toLowerCase() ?? "";
    const def = PY_TOOLS[name];
    if (!def) return makeSemantics("unknown", { reason: `unknown python tool: ${name}`, opaque: true });

    // 1. Resolve base class: subcommand overrides default
    let cls = def.cls;
    let reason = def.reason;
    // 引擎投影：取值选项被消费，positional[0] = 子命令首词（T-059）
    const { positional } = parseOptions(node.args, { opts: VALUE_OPTS, positional: "file", opaqueOnUnknown: false });
    const subcmd = positional[0]?.value ?? "";
    if (def.subcommands && subcmd) {
      const sub = def.subcommands[subcmd];
      if (sub) {
        cls = sub.cls;
        reason = sub.reason;
      }
    }

    // 2. Apply flag-based overrides (order matters: modify→inspect before inspect→modify)
    if (cls === "modify" && def.inspectFlags && hasFlag(node.args, def.inspectFlags)) {
      cls = "inspect";
      reason = `${reason} (check-only)`;
    } else if (cls === "inspect" && def.modifyFlags && hasFlag(node.args, def.modifyFlags)) {
      cls = "modify";
      reason = `${reason} (with fixes)`;
    }

    return makeSemantics(cls, { reason });
  },
};
