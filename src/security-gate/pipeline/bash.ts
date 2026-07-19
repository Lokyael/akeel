import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PipelineResult, SecurityConfig, PermissionAction } from "../types";
import { scanThreats } from "../security/threats";
import { wildcardMatch } from "../shared/wildcard";
import { analyzeShellCommand, extractLiteralReadPaths, findRule, FULL_COMMAND_PATTERNS, type ShellSegment } from "../taxonomy";
import { decidePath, resolveToolPath } from "../policy/path";

export interface BashEvalInput {
  command: string;
  ctx: ExtensionContext;
  config: SecurityConfig;
  cwd?: string;
}

function configuredBashAction(config: SecurityConfig, segment: string): PermissionAction | null {
  const entries = Object.entries(config.permission.bash).reverse();
  for (const [pattern, action] of entries) {
    if (wildcardMatch(pattern, segment)) return action;
  }
  return null;
}

function hardRule(rule: ReturnType<typeof findRule>): boolean {
  return !!rule && (rule.hard === true || rule.severity === "critical" || rule.build === "block");
}

/**
 * Internal path check result — NOT PipelineResult.
 * - `"deny"` → immediate hard block (caller returns PipelineResult)
 * - `"needs-ask"` → collect reason for askOnce
 * - `null` → pass
 */
type PathDecisionForTarget = { kind: "deny"; reason: string } | { kind: "needs-ask"; reason: string } | null;

function pathDecisionForTarget(
  target: string,
  operation: "read" | "write",
  input: BashEvalInput,
): PathDecisionForTarget {
  if (!input.cwd) return null;
  const resolved = resolveToolPath(input.cwd, target);
  const decision = decidePath(resolved, input.config, operation);
  if (decision.action === "deny") {
    return { kind: "deny", reason: `⛔ path — ${target} is denied: ${decision.reason}.` };
  }
  if (decision.action === "ask") {
    return { kind: "needs-ask", reason: `path approval required for ${target}` };
  }
  return null;
}

function shellWriteTarget(segment: ShellSegment, rule: ReturnType<typeof findRule>): string | null {
  const redirect = segment.redirections.find((item) => ["file-write", "file-append"].includes(item.kind));
  if (redirect?.target) return redirect.target;
  return rule?.extractPath?.(segment.text) ?? null;
}

async function askOnce(input: BashEvalInput, reason: string): Promise<PipelineResult> {
  if (!input.ctx.hasUI) {
    return { kind: "block", reason: "⛔ permission — approval required but no interactive UI is available in this mode." };
  }
  const displayValue = (input.command.length > 80 ? input.command.slice(0, 77) + "..." : input.command)
    .replace(/[\n\r\t]/g, " ");
  const choice = await input.ctx.ui.select(
    `Security Gate: bash\n\n  ${displayValue}\n\n${reason}\n\nAllow?`,
    ["Allow once", "Deny"],
  );
  if (choice !== "Allow once") {
    return { kind: "block", reason: "⛔ denied — user declined this operation." };
  }
  return { kind: "allow" };
}

export async function evaluateBashCommand(input: BashEvalInput): Promise<PipelineResult> {
  const analysis = analyzeShellCommand(input.command);
  if (analysis.unsafeSyntax) {
    return { kind: "block", reason: `⛔ shell — ${analysis.unsafeSyntax}.` };
  }

  const threatId = scanThreats(input.command);
  if (threatId) {
    return { kind: "block", reason: `⛔ threat — ${threatId} detected.` };
  }
  for (const pattern of FULL_COMMAND_PATTERNS) {
    if (pattern.match(input.command)) {
      return { kind: "block", reason: `⛔ blocked — ${pattern.rule.id}: ${pattern.rule.description}.` };
    }
  }

  let askReason = "";
  for (const literal of extractLiteralReadPaths(input.command)) {
    const pathResult = pathDecisionForTarget(literal.path, "read", input);
    if (pathResult?.kind === "deny") return { kind: "block", reason: pathResult.reason };
    if (pathResult?.kind === "needs-ask") askReason ||= pathResult.reason;
  }
  for (const segment of analysis.segments) {
    const rule = findRule(segment.text);
    if (segment.hasCommandSubstitution) {
      return { kind: "block", reason: "⛔ shell — command substitution is permanently blocked." };
    }
    if (segment.redirections.some((redirect) => redirect.kind === "process-substitution")) {
      return { kind: "block", reason: "⛔ shell — process substitution is permanently blocked." };
    }
    if (!rule) {
      return { kind: "block", reason: `⛔ blocked — unknown command '${segment.text}'.` };
    }
    if (hardRule(rule)) {
      return { kind: "block", reason: `⛔ blocked — ${rule.id}: ${rule.description}.` };
    }

    const configured = configuredBashAction(input.config, segment.text);
    if (configured === "deny") {
      return { kind: "block", reason: `⛔ blocked — ${segment.text} was denied by permission.bash.` };
    }

    const writeTarget = shellWriteTarget(segment, rule);
    if (writeTarget) {
      const pathResult = pathDecisionForTarget(writeTarget, "write", input);
      if (pathResult?.kind === "deny") return { kind: "block", reason: pathResult.reason };
      if (pathResult?.kind === "needs-ask") askReason ||= pathResult.reason;
      if (!pathResult) askReason ||= `${segment.text}: shell write`;
    }

    for (const redirect of segment.redirections) {
      if (redirect.kind === "file-read" && redirect.target) {
        const pathResult = pathDecisionForTarget(redirect.target, "read", input);
        if (pathResult?.kind === "deny") return { kind: "block", reason: pathResult.reason };
        if (pathResult?.kind === "needs-ask") askReason ||= pathResult.reason;
      }
      if (["heredoc", "here-string", "process-substitution"].includes(redirect.kind)) {
        askReason ||= `${segment.text}: ${redirect.kind}`;
      }
      if (["file-write", "file-append"].includes(redirect.kind)) {
        askReason ||= `${segment.text}: shell write`;
      }
    }

    if (segment.hasDynamicExecution) askReason ||= `${segment.text}: dynamic shell expansion`;

    const canOverride = rule.overrideable !== false && rule.severity !== "critical" && rule.build !== "block";
    if (configured === "allow" && canOverride && !segment.hasDynamicExecution) continue;
    if (rule.build === "ask") askReason ||= `${segment.text}: ${rule.description}`;
  }

  if (analysis.hasAmbiguousRead) askReason ||= "recursive or ambiguous read";
  if (askReason) return askOnce(input, askReason);
  return { kind: "allow" };
}
