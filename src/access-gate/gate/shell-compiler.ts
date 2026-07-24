import { analyzeCd, analyzeControlFlow, initialCwd } from "../command-semantics/control-flow";
import { normalizeCommand } from "../command-semantics/normalize";
import { analyzeSemantics } from "../command-semantics/registry";
import { lex } from "../shell-parse/lexer";
import { parse } from "../shell-parse/parser";
import type { CwdCandidate } from "../command-semantics/types";
import type { ShellRedirectionNode, SourceSpan } from "../shell-parse/types";
import { runPreflight } from "./preflight";
import {
  ANALYSIS_LIMITS,
  createRequest,
  effectsFor,
  validateInputLength,
  pathOperation,
  reject,
  validateEffects,
  type AccessOperation,
  type CompileResult,
  type PathAccessOperation,
  type ShellCompilerInput,
} from "./access-request";

const REDIRECTION_PATH_KINDS = new Set([
  "stdin",
  "stdout",
  "stdoutAppend",
  "stderr",
  "stderrAppend",
]);

function redirectionOperation(
  redirection: ShellRedirectionNode,
  state: { cwd: string; candidates?: readonly CwdCandidate[] },
): PathAccessOperation | CompileResult {
  if (!REDIRECTION_PATH_KINDS.has(redirection.kind)) {
    return reject("unsupported-redirection", redirection.kind, redirection.span);
  }
  if (!redirection.target?.value) return reject("unsupported-redirection", "missing redirection target", redirection.span);
  const operation = redirection.kind === "stdin" ? "read" : "write";
  return pathOperation(operation, redirection.target.value, state, "redirection", "exact", redirection.span);
}

export function compileShellCall(input: ShellCompilerInput): CompileResult {
  const command = input.command.trim();
  if (!command) return reject("unsafe-syntax", "bash command is missing");
  const inputLimit = validateInputLength(command, "shell command");
  if (inputLimit) return inputLimit;

  const lexResult = lex(command);
  if (lexResult.unsafeSyntax) return reject("unsafe-syntax", lexResult.unsafeSyntax);
  const parsed = parse(lexResult.tokens);
  if (parsed.error || parsed.program.commands.length === 0) return reject("unsafe-syntax", parsed.error ?? "empty command");
  if (parsed.program.commands.length > ANALYSIS_LIMITS.maxCommands) return reject("resource-limit", "command count exceeds the analysis budget");
  if (parsed.program.dynamic) return reject("dynamic-shell", "dynamic shell token");
  if (parsed.program.unsafeSyntax) return reject("unsafe-syntax", parsed.program.unsafeSyntax);

  const preflight = runPreflight(command);
  if (preflight) return preflight;

  const flow = analyzeControlFlow(parsed.program, initialCwd(input.cwd));
  if (flow.opaque) return reject("opaque-command", "opaque control flow");

  const operations: AccessOperation[] = [];
  const commandSpans: SourceSpan[] = [];
  const redirectionSpans: SourceSpan[] = [];

  for (const flowNode of flow.nodes) {
    const normalized = normalizeCommand(flowNode.node);
    if (!normalized) return reject("opaque-command", "cannot normalize command wrappers", flowNode.node.span);
    const semantics = analyzeSemantics(normalized.command, {
      projectRoot: input.projectRoot,
      stagingDir: input.stagingDir,
      cwd: flowNode.effectiveCwd.cwd,
    });
    if (semantics.opaque) return reject("opaque-command", normalized.executable ?? "unknown command", flowNode.node.span);
    if (semantics.class === "destroy") return reject("destroy-command", normalized.executable ?? "destroy command", flowNode.node.span);

    commandSpans.push(flowNode.node.span);
    const cdInfo = analyzeCd(flowNode.node);
    if (cdInfo.opaque) return reject("uncertain-cwd", "cd target cannot be classified", flowNode.node.span);
    const isCd = flowNode.node.executable?.value?.toLowerCase() === "cd";
    const effects = isCd
      ? (cdInfo.target ? ["cwdChange" as const] : [])
      : effectsFor(semantics.class, semantics.effects, semantics.intents, flowNode.node.redirections.length > 0);
    const invalidEffect = validateEffects(effects, flowNode.node.span);
    if (invalidEffect) return invalidEffect;
    operations.push({
      kind: "command",
      origin: "shell",
      commandClass: semantics.class,
      executable: normalized.executable,
      effects,
      span: flowNode.node.span,
    });
    for (const effect of effects) {
      operations.push({ kind: "effect", effect, confidence: "exact", span: flowNode.node.span });
    }

    if (cdInfo.target) {
      operations.push(pathOperation("list", cdInfo.target, flowNode.cwdBefore, "cwd", "exact", flowNode.node.span));
    }

    for (const redirection of flowNode.node.redirections) {
      const operation = redirectionOperation(redirection, flowNode.effectiveCwd);
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
    if (semantics.class === "modify" && semantics.intents.length === 0 && flowNode.node.redirections.length === 0) {
      operations.push(pathOperation("write", ".", flowNode.effectiveCwd, "cwd", "conservative", flowNode.node.span));
    }
  }

  const cwdCandidates = operations.flatMap((operation) => operation.kind === "path" ? operation.cwdCandidates : []);
  return createRequest("bash", operations, cwdCandidates, {
    commandSpans,
    redirectionSpans,
    commandCount: commandSpans.length,
    pathOperationCount: operations.filter((operation) => operation.kind === "path").length,
    effectOperationCount: operations.filter((operation) => operation.kind === "effect").length,
    cwdCandidateCount: cwdCandidates.length,
  }, command.length, { projectRoot: input.projectRoot, stagingDir: input.stagingDir });
}
