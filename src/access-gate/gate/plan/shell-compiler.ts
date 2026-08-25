import { analyzeCd, analyzeControlFlow, initialCwd, verifyLoopScope, reduceToFlat } from "../../command-semantics";
import { normalizeCommand } from "../../command-semantics";
import { analyzeSemantics } from "../../command-semantics";
import { lex } from "../../shell-parse";
import { parse } from "../../shell-parse";
import type { CwdCandidate } from "../../command-semantics";
import type { ScopeWordValues, ReducedSegment } from "../../command-semantics";
import type { ShellRedirectionNode, SourceSpan } from "../../shell-parse";
import { runPreflight } from "./preflight";
import {
  ANALYSIS_LIMITS,
  type AccessOperation,
  type CompilerDraftResult,
  type PathAccessOperation,
  type ShellCompilerInput,
} from "./access-request-types";
import {
  createPlanDraft,
  effectsFor,
  validateInputLength,
  pathOperation,
  reject,
  validateEffects,
} from "./builder";

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
    // heredoc/hereString 内容不在命令文本中建模 → 显式拒绝（D-018 复杂形态可拒绝原则）；新增 kind 在此强制编译错误
    case "heredoc":
    case "hereString":
      return reject("unsupported-redirection", redirection.kind, redirection.span);
  }
}

/** 归约坐标 → 原始坐标：按命令起点定位所在 segment（verbatim 线性偏移、expanded 取 body 原始 span）。 */
function originalSpanFor(segments: readonly ReducedSegment[], span: SourceSpan): SourceSpan {
  for (const seg of segments) {
    if (span.start >= seg.spanInReduced.start && span.start < seg.spanInReduced.end) {
      if (seg.kind === "verbatim") {
        const off = seg.originalSpan.start - seg.spanInReduced.start;
        return { start: span.start + off, end: span.end + off };
      }
      return seg.originalSpan;
    }
  }
  return span;
}

/**
 * 扁平命令管线（lex→parse→preflight→dynamic→control-flow→逐条编译）。
 * 归约路径（segments 提供）为每条 operation 装配 originalSpan（原始坐标），
 * coverage/verifier 对账仍用 span（归约坐标）。
 */
function compileFlatPipeline(
  command: string,
  input: ShellCompilerInput,
  segments?: readonly ReducedSegment[],
  reductionText?: string,
): CompilerDraftResult {
  const lexResult = lex(command);
  if (lexResult.unsafeSyntax) return reject("unsafe-syntax", lexResult.unsafeSyntax);
  const parsed = parse(lexResult.tokens);
  if (parsed.error && parsed.error !== "empty command") return reject("unsafe-syntax", parsed.error);
  if (parsed.program.unsafeSyntax) return reject("unsafe-syntax", parsed.program.unsafeSyntax);
  if (parsed.program.commands.length > ANALYSIS_LIMITS.maxCommands) return reject("resource-limit", "command count exceeds the analysis budget");

  if (parsed.program.opaqueRegions.length > 0) return reject("compound-command", parsed.program.opaqueRegions[0]!.keyword, parsed.program.opaqueRegions[0]!.span);
  if (parsed.program.loopScopes.length > 0) return reject("compound-command", "for", parsed.program.loopScopes[0]!.headerSpan); // 防御：扁平文本不应有 loop
  if (parsed.error || parsed.program.commands.length === 0) return reject("unsafe-syntax", parsed.error ?? "empty command");

  // preflight 在 dynamic 检查之前运行，以便硬规则和威胁扫描提供更具体的错误信息；
  // 结构级检查基于 parse 后的 program（引号拆分规范化、注释/字符串不误报）
  const preflight = runPreflight(parsed.program);
  if (preflight) return preflight;

  if (parsed.program.dynamic) return reject("dynamic-shell", "dynamic shell token");

  const flow = analyzeControlFlow(parsed.program, initialCwd(input.cwd));
  if (flow.opaque) return reject("opaque-command", "opaque control flow");

  const mapOriginal = (span: SourceSpan): SourceSpan => (segments ? originalSpanFor(segments, span) : span);

  const operations: AccessOperation[] = [];
  const commandSpans: SourceSpan[] = [];
  const redirectionSpans: SourceSpan[] = [];

  for (const flowNode of flow.nodes) {
    const normalized = normalizeCommand(flowNode.node);
    const semantics = analyzeSemantics(normalized.command);
    if (semantics.opaque) return reject("opaque-command", normalized.executable ?? "unknown command", mapOriginal(flowNode.node.span));
    if (semantics.commandClass === "destroy") return reject("destroy-command", normalized.executable ?? "destroy command", mapOriginal(flowNode.node.span));

    commandSpans.push(flowNode.node.span);
    const cdInfo = analyzeCd(flowNode.node);
    if (cdInfo.opaque) return reject("uncertain-cwd", "cd target cannot be classified", mapOriginal(flowNode.node.span));
    // isCd 由 analyzeCd 单点判定，消除二次 executable === "cd" 判断
    const isCd = cdInfo.isCd;
    const effects = isCd
      ? (cdInfo.target ? ["cwdChange" as const] : [])
      : effectsFor(semantics.commandClass, semantics.effects, semantics.intents, flowNode.node.redirections.length > 0);
    const invalidEffect = validateEffects(effects, flowNode.node.span);
    if (invalidEffect) return invalidEffect;
    const commandOriginalSpan = mapOriginal(flowNode.node.span);
    operations.push({
      kind: "command",
      origin: "shell",
      commandClass: semantics.commandClass,
      executable: normalized.executable,
      effects,
      span: flowNode.node.span,
      ...(segments ? { originalSpan: commandOriginalSpan } : {}),
    });

    if (cdInfo.target) {
      operations.push({
        ...pathOperation("list", cdInfo.target, flowNode.cwdBefore, "cwd", "exact", flowNode.node.span),
        ...(segments ? { originalSpan: commandOriginalSpan } : {}),
      });
    }

    for (const redirection of flowNode.node.redirections) {
      const operation = redirectionOperation(redirection, flowNode.effectiveCwd);
      if (operation === null) continue;
      if (operation.kind !== "path") return operation;
      operations.push(operation);
      redirectionSpans.push(redirection.span);
    }
    for (const intent of semantics.intents) {
      operations.push({
        ...pathOperation(intent.operation, intent.rawPath, flowNode.effectiveCwd, intent.source, intent.confidence, intent.span),
        ...(segments ? { originalSpan: mapOriginal(intent.span) } : {}),
      });
    }
    // Conservative fallback: modify-class commands with no explicit paths
    // or redirections get a synthetic write intent on cwd.  Direct tools do not
    // need this fallback because every Direct surface always carries a path arg.
    if (semantics.commandClass === "modify" && semantics.intents.length === 0 && flowNode.node.redirections.length === 0) {
      operations.push({
        ...pathOperation("write", ".", flowNode.effectiveCwd, "cwd", "conservative", flowNode.node.span),
        ...(segments ? { originalSpan: commandOriginalSpan } : {}),
      });
    }
  }

  const cwdCandidates = operations.flatMap((operation) => operation.kind === "path" ? operation.cwdCandidates : []);
  const draft = createPlanDraft("bash", operations, cwdCandidates, {
    commandSpans,
    redirectionSpans,
    commandCount: commandSpans.length,
    pathOperationCount: operations.filter((operation) => operation.kind === "path").length,
    cwdCandidateCount: cwdCandidates.length,
  }, command.length, { projectRoot: input.projectRoot, stagingDir: input.stagingDir });
  if (draft.kind === "reject" || reductionText === undefined) return draft;
  return { kind: "draft", draft: { ...draft.draft, reductionText } };
}

export function compileShellDraft(input: ShellCompilerInput): CompilerDraftResult {
  const command = input.command;
  if (!command.trim()) return reject("unsafe-syntax", "bash command is missing");
  const inputLimit = validateInputLength(command, "shell command");
  if (inputLimit) return inputLimit;

  const lexResult = lex(command);
  if (lexResult.unsafeSyntax) return reject("unsafe-syntax", lexResult.unsafeSyntax);
  const parsed = parse(lexResult.tokens);
  if (parsed.error && parsed.error !== "empty command") return reject("unsafe-syntax", parsed.error);
  if (parsed.program.unsafeSyntax) return reject("unsafe-syntax", parsed.program.unsafeSyntax);

  // 结构扫描（P1T2/P2T7）：非 for 保留字区 → compound-command；for-scope 经
  // verifyLoopScope（strict 守卫）→ reduceToFlat（文本归约 + 自校验）→ 扁平管线。
  // 任一 scope 不可建模或归约失败 → compound-command（fail-closed，先于 preflight/动态检查）。
  const opaque = parsed.program.opaqueRegions[0];
  if (opaque) return reject("compound-command", opaque.keyword, opaque.span);
  if (parsed.program.loopScopes.length > 0) {
    const pairs: ScopeWordValues[] = [];
    for (const scope of parsed.program.loopScopes) {
      // 展开命令数预算是 verify 守卫（N×body > maxCommands → 拒）；长度/命令数在扁平管线显式检查
      const verified = verifyLoopScope(scope, { maxCommands: ANALYSIS_LIMITS.maxCommands });
      if (!verified) return reject("compound-command", "for", scope.headerSpan);
      pairs.push({ scope, values: verified.wordValues });
    }
    // 单次归约（G1）：一个 pass 处理全部可建模 scope；任一构造/自校验失败 → compound-command
    const reduced = reduceToFlat(command, parsed.program.loopScopes, pairs);
    if (!reduced) return reject("compound-command", "for", parsed.program.loopScopes[0]!.headerSpan);
    if (reduced.text.length > ANALYSIS_LIMITS.maxInputLength) return reject("resource-limit", "reduced command exceeds the analysis budget");
    return compileFlatPipeline(reduced.text, input, reduced.segments, reduced.reductionText);
  }

  return compileFlatPipeline(command, input);
}