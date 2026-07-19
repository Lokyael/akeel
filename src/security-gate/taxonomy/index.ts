/**
 * taxonomy/index.ts — Public API for the command classification system.
 *
 * Re-exports from sub-modules and provides the high-level lookup functions
 * that constitute the taxonomy module's public interface.
 *
 * For internal structure, see:
 *   types.ts     — Type definitions (CommandRule, ShellSegment, etc.)
 *   commands.ts  — Command rule data (CMDS, PATTERNS, FULL_COMMAND_PATTERNS)
 *   parser.ts    — Shell parsing and analysis (analyzeShellCommand, etc.)
 *   helpers.ts   — Internal helpers (cmdName, containsUnquoted, etc.)
 */

// ─── Re-exports from sub-modules ───

export type {
  CommandCategory,
  Severity,
  PlanAction,
  BuildAction,
  CommandRule,
  ShellRedirectKind,
  ShellRedirection,
  ShellSegment,
  ShellAnalysis,
  LiteralReadPath,
} from "./types";

export {
  FULL_COMMAND_PATTERNS,
} from "./commands";

export {
  analyzeShellCommand,
  extractLiteralReadPaths,
  splitCommand,
} from "./parser";

// ─── Internal imports ───

import type { CommandRule, CmdDef } from "./types";
import { cmdName } from "./helpers";
import { unwrapNestedCommand } from "./parser";
import { PRIORITY, FULL_COMMAND_PATTERNS, byCmd, CMDS, PATTERNS } from "./commands";

// ─── Public API ───

/** Find rule by id (for testing). */
export function findRuleById(id: string): CommandRule | null {
  for (const d of CMDS) { if (d.rule.id === id) return d.rule; }
  for (const p of PATTERNS) { if (p.rule.id === id) return p.rule; }
  for (const p of FULL_COMMAND_PATTERNS) { if (p.rule.id === id) return p.rule; }
  return null;
}

/** Get all rules for iteration (testing). */
export function getAllRules(): CommandRule[] {
  const rules: CommandRule[] = [];
  for (const d of CMDS) rules.push(d.rule);
  for (const p of PATTERNS) rules.push(p.rule);
  for (const p of FULL_COMMAND_PATTERNS) rules.push(p.rule);
  return rules;
}

/** Find the most severe rule matching a segment. */
export function findRule(segment: string, depth = 0): CommandRule | null {
  if (depth < 4) {
    const nested = unwrapNestedCommand(segment);
    if (nested && nested !== segment) {
      const nestedRule = findRule(nested, depth + 1);
      if (nestedRule) return nestedRule;
    }
  }

  // Patterns first (highest priority)
  for (const p of PATTERNS) {
    if (p.match(segment)) return p.rule;
  }

  // Command-based lookup
  const cmd = cmdName(segment);
  if (cmd && byCmd.has(cmd)) {
    let best: CommandRule | null = null;
    for (const d of byCmd.get(cmd)!) {
      if (d.sub) {
        const idx = segment.toLowerCase().indexOf(d.cmd);
        const rest = idx >= 0 ? segment.slice(idx + d.cmd.length).trim() : "";
        if (!d.sub.test(rest)) continue;
      }
      const r = d.rule;
      if (!best || PRIORITY[r.category] > PRIORITY[best.category]) {
        best = r;
      }
    }
    if (best) return best;
  }

  return null;
}
