import { lex } from "../shell-parse/lexer";
import { parse } from "../shell-parse/parser";
import { normalizeCommand } from "../command-semantics/normalize";
import { analyzeControlFlow, initialCwd, analyzeCd, resolveCdTarget } from "../command-semantics/control-flow";
import { analyzeSemantics } from "../command-semantics/registry";
import { decidePath, resolvePath } from "../path";
import { scanThreats } from "../security/threat-scan";
import type { Decision, PathOperation } from "../profile/types";
import type { ShellRedirectionNode } from "../shell-parse/types";
import { askOnce, decisionBlock } from "./unknown-command";
import type { GateResult, GateRuntime } from "./types";
import type { ResolvedProfile } from "../profile/types";

/** 硬编码全命令模式（pip to shell 等）。 */
const HARD_FULL_PATTERNS: { match: (c: string) => boolean; id: string }[] = [
  { match: (c) => /\bcurl\s+\S+\s*\|.*(?:sh|bash|dash|python|perl|ruby)/i.test(c), id: "curl-pipe-shell" },
  { match: (c) => /\bwget\s+\S+\s*-O\s*-\s*\|.*(?:sh|bash)/i.test(c), id: "wget-pipe-shell" },
];

interface ShellInput {
  command: string;
  cwd: string;
  projectRoot: string;
  stagingDir: string;
  profile: ResolvedProfile;
  runtime: GateRuntime;
}

/**
 * 统一 Shell 分析入口。
 * 替代旧 evaluateShellCommand，使用新模块。
 */
export async function analyzeShellCommand(input: ShellInput): Promise<GateResult> {
  const command = input.command.trim();
  if (!command) return decisionBlock("bash command is missing");

  // ── Step 1: Lex + Parse ──
  const lexResult = lex(command);
  if (lexResult.unsafeSyntax) return decisionBlock(`unsafe shell syntax: ${lexResult.unsafeSyntax}`);

  const { program, error: parseError } = parse(lexResult.tokens);
  if (parseError && program.commands.length === 0) return decisionBlock(`parse error: ${parseError}`);

  // ── Step 2: Dynamic/opaque → block ──
  if (program.dynamic) return decisionBlock("dynamic shell tokens are not allowed");
  if (program.unsafeSyntax) return decisionBlock(`unsafe syntax: ${program.unsafeSyntax}`);

  // ── Step 3: Threat scan ──
  const threat = scanThreats(command);
  if (threat) return decisionBlock(`threat detected: ${threat}`);

  // ── Step 4: Hard full-command patterns ──
  for (const pattern of HARD_FULL_PATTERNS) {
    if (pattern.match(command)) return decisionBlock(`hard command rule: ${pattern.id}`);
  }

  // ── Step 5: Control flow analysis ──
  const flow = analyzeControlFlow(program, initialCwd(input.cwd));
  if (flow.opaque) return decisionBlock("opaque control flow cannot be analyzed");

  // ── Step 6: Process each command ──
  let approvalReason: string | null = null;
  let shellCwd = input.cwd;

  const addApproval = (reason: string) => { approvalReason ||= reason; };

  for (const node of flow.nodes) {
    const cmdNode = node.node;
    const effectiveCwd = node.effectiveCwd.cwd;

    // 6a: Normalize wrappers
    const normalized = normalizeCommand(cmdNode);
    if (!normalized) return decisionBlock("cannot normalize command wrappers");

    // 6b: Get command semantics
    const semantics = analyzeSemantics(normalized.command, {
      projectRoot: input.projectRoot,
      stagingDir: input.stagingDir,
      cwd: effectiveCwd,
    });

    // 6c: Hard check for dangerous commands
    if (semantics.class === "dangerous") {
      return decisionBlock(`dangerous command denied: ${normalized.executable ?? "?"}`);
    }

    // 6d: Handle cd
    const cdInfo = analyzeCd(cmdNode);
    if (cdInfo.opaque) return decisionBlock("cd target cannot be classified");
    if (cdInfo.target) {
      const dirBlock = checkPath(input, effectiveCwd, cdInfo.target, "list", addApproval);
      if (dirBlock) return dirBlock;
      const resolved = resolveCdTarget(cdInfo.target, shellCwd);
      if (resolved?.exists) {
        shellCwd = resolved.cwd;
      }
    }

    // 6e: Process redirections
    for (const redir of cmdNode.redirections) {
      if (isDiscardRedirect(redir)) continue;
      if (redir.target?.value) {
        const op: PathOperation = (redir.kind === "stdin" || redir.kind === "heredoc" || redir.kind === "hereString") ? "read" : "write";
        const rBlock = checkPath(input, effectiveCwd, redir.target.value, op, addApproval);
        if (rBlock) return rBlock;
      }
    }

    // 6f: Process path intents from adapter
    for (const intent of semantics.intents) {
      const pBlock = checkPath(input, effectiveCwd, intent.rawPath, intent.operation as PathOperation, addApproval);
      if (pBlock) return pBlock;
    }

    // 6g: Mutating with no intents → check cwd
    if (semantics.class === "mutating" && semantics.intents.length === 0 && cmdNode.redirections.length === 0) {
      const cwdBlock = checkPath(input, effectiveCwd, ".", "write", addApproval);
      if (cwdBlock) return cwdBlock;
    }

    // 6h: Shell policy decision
    const cmdName = normalized.executable ?? cmdNode.executable?.value ?? "?";
    const shellDecision: Decision = input.profile.shellPolicy[semantics.class] ?? "deny";
    if (shellDecision === "deny") return decisionBlock(`${semantics.class} shell command denied: ${cmdName}`);
    if (shellDecision === "ask") {
      const desc = semantics.reason ? ` (${semantics.reason})` : "";
      addApproval(`${semantics.class} command: ${cmdName}${desc}`);
    }
  }

  // ── Step 7: Ask aggregation ──
  if (approvalReason) return askOnce(input.runtime, "Access profile approval", approvalReason);
  return { kind: "allow" };
}

/** `/dev/null` is a conventional output sink, not a project file write. */
function isDiscardRedirect(redir: ShellRedirectionNode): boolean {
  return redir.target?.value === "/dev/null"
    && ["stdout", "stdoutAppend", "stderr", "stderrAppend"].includes(redir.kind);
}

/**
 * 检查路径策略。
 * 返回 block GateResult 或 null（allow/ask 已通过 addApproval 记录）。
 */
function checkPath(
  input: ShellInput,
  cwd: string,
  target: string,
  operation: PathOperation,
  addApproval: (reason: string) => void,
): GateResult | null {
  const path = resolvePath(cwd, input.projectRoot, input.stagingDir, target);
  const result = decidePath(path, input.profile, operation);
  if (result.decision === "deny") return decisionBlock(`${operation} path denied: ${target} (${result.reason})`);
  if (result.decision === "ask") addApproval(`${operation} path requires approval: ${target}`);
  return null;
}
