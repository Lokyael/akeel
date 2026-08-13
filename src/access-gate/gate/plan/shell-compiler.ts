import { analyzeCd, analyzeControlFlow, initialCwd } from "../../command-semantics";
import { normalizeCommand } from "../../command-semantics";
import { analyzeSemantics } from "../../command-semantics";
import { lex } from "../../shell-parse";
import { parse } from "../../shell-parse";
import type { CwdCandidate } from "../../command-semantics";
import type { ShellRedirectionNode, SourceSpan } from "../../shell-parse";
import { runPreflight } from "./preflight";
import {
  ANALYSIS_LIMITS,
  createPlanDraft,
  effectsFor,
  validateInputLength,
  pathOperation,
  reject,
  validateEffects,
  type AccessOperation,
  type CompilerDraftResult,
  type PathAccessOperation,
  type ShellCompilerInput,
} from "./request-builder";

function redirectionOperation(
  redirection: ShellRedirectionNode,
  state: { cwd: string; candidates?: readonly CwdCandidate[] },
): PathAccessOperation | CompilerDraftResult | null {
  switch (redirection.kind) {
    // fdDuplicate (2>&1) 与 fdClose (2>&-) 不引用文件路径，跳过
    case "fdDuplicate":
    case "fdClose":
      return null;
    // 文件引用重定向 → 路径 intent（stdin 读、其余写）
    case "stdin":
    case "stdout":
    case "stdoutAppend":
    case "stderr":
    case "stderrAppend": {
      if (!redirection.target?.value) return reject("unsupported-redirection", "missing redirection target", redirection.span);
      const operation = redirection.kind === "stdin" ? "read" : "write";
      return pathOperation(operation, redirection.target.value, state, "redirection", "exact", redirection.span);
    }
    // heredoc/hereString 内容不在命令文本中建模 → 显式拒绝（D-043 复杂形态可拒绝原则）；新增 kind 在此强制编译错误
    case "heredoc":
    case "hereString":
      return reject("unsupported-redirection", redirection.kind, redirection.span);
  }
}

export function compileShellDraft(input: ShellCompilerInput): CompilerDraftResult {
  const command = input.command;
  if (!command.trim()) return reject("unsafe-syntax", "bash command is missing");
  const inputLimit = validateInputLength(command, "shell command");
  if (inputLimit) return inputLimit;

  const lexResult = lex(command);
  if (lexResult.unsafeSyntax) return reject("unsafe-syntax", lexResult.unsafeSyntax);
  const parsed = parse(lexResult.tokens);
  if (parsed.error || parsed.program.commands.length === 0) return reject("unsafe-syntax", parsed.error ?? "empty command");
  if (parsed.program.commands.length > ANALYSIS_LIMITS.maxCommands) return reject("resource-limit", "command count exceeds the analysis budget");
  if (parsed.program.unsafeSyntax) return reject("unsafe-syntax", parsed.program.unsafeSyntax);

  // preflight 在 dynamic 检查之前运行，以便硬规则和威胁扫描提供更具体的错误信息；
  // 结构级检查基于 parse 后的 program（引号拆分规范化、注释/字符串不误报）
  const preflight = runPreflight(parsed.program);
  if (preflight) return preflight;

  if (parsed.program.dynamic) return reject("dynamic-shell", "dynamic shell token");

  const flow = analyzeControlFlow(parsed.program, initialCwd(input.cwd));
  if (flow.opaque) return reject("opaque-command", "opaque control flow");

  const operations: AccessOperation[] = [];
  const commandSpans: SourceSpan[] = [];
  const redirectionSpans: SourceSpan[] = [];

  for (const flowNode of flow.nodes) {
    const normalized = normalizeCommand(flowNode.node);
    const semantics = analyzeSemantics(normalized.command, {
      projectRoot: input.projectRoot,
      stagingDir: input.stagingDir,
      cwd: flowNode.effectiveCwd.cwd,
    });
    if (semantics.opaque) return reject("opaque-command", normalized.executable ?? "unknown command", flowNode.node.span);
    if (semantics.commandClass === "destroy") return reject("destroy-command", normalized.executable ?? "destroy command", flowNode.node.span);

    commandSpans.push(flowNode.node.span);
    const cdInfo = analyzeCd(flowNode.node);
    if (cdInfo.opaque) return reject("uncertain-cwd", "cd target cannot be classified", flowNode.node.span);
    // isCd 由 analyzeCd 单点判定，消除二次 executable === "cd" 判断
    const isCd = cdInfo.isCd;
    const effects = isCd
      ? (cdInfo.target ? ["cwdChange" as const] : [])
      : effectsFor(semantics.commandClass, semantics.effects, semantics.intents, flowNode.node.redirections.length > 0);
    const invalidEffect = validateEffects(effects, flowNode.node.span);
    if (invalidEffect) return invalidEffect;
    operations.push({
      kind: "command",
      origin: "shell",
      commandClass: semantics.commandClass,
      executable: normalized.executable,
      effects,
      span: flowNode.node.span,
    });

    if (cdInfo.target) {
      operations.push(pathOperation("list", cdInfo.target, flowNode.cwdBefore, "cwd", "exact", flowNode.node.span));
    }

    for (const redirection of flowNode.node.redirections) {
      const operation = redirectionOperation(redirection, flowNode.effectiveCwd);
      if (operation === null) continue;
      if (operation.kind !== "path") return operation;
      operations.push(operation);
      redirectionSpans.push(redirection.span);
    }
    for (const intent of semantics.intents) {
      operations.push(pathOperation(intent.operation, intent.rawPath, flowNode.effectiveCwd, intent.source, intent.confidence, intent.span));
    }
    // Conservative fallback: modify-class commands with no explicit paths
    // or redirections get a synthetic write intent on cwd.  Direct tools do not
    // need this fallback because every Direct surface always carries a path arg.
    if (semantics.commandClass === "modify" && semantics.intents.length === 0 && flowNode.node.redirections.length === 0) {
      operations.push(pathOperation("write", ".", flowNode.effectiveCwd, "cwd", "conservative", flowNode.node.span));
    }
  }

  const cwdCandidates = operations.flatMap((operation) => operation.kind === "path" ? operation.cwdCandidates : []);
  return createPlanDraft("bash", operations, cwdCandidates, {
    commandSpans,
    redirectionSpans,
    commandCount: commandSpans.length,
    pathOperationCount: operations.filter((operation) => operation.kind === "path").length,
    cwdCandidateCount: cwdCandidates.length,
  }, command.length, { projectRoot: input.projectRoot, stagingDir: input.stagingDir });
}
