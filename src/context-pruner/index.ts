import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SUCCESS_OUTPUT = "All tests passed";
const DIAGNOSTIC_CONTEXT_RADIUS = 1;

type ContextMessage = Readonly<Record<string, unknown>>;

/**
 * Reduces test command output before it is sent to the model.
 * Returning the original message preserves information when classification is uncertain.
 */
export function pruneTestContext(messages: readonly unknown[]): unknown[] {
  return messages.map((message) => pruneMessage(message));
}

export default function contextPruner(pi: ExtensionAPI): void {
  pi.on("context", (event) => ({ messages: pruneTestContext(event.messages) }));
}

function pruneMessage(message: unknown): unknown {
  if (!isBashExecutionMessage(message) || !isTestCommand(message.command)) return message;
  if (message.cancelled || message.truncated || message.exitCode === undefined) return message;

  if (message.exitCode === 0 && !outputSignalsFailure(message.output)) {
    return { ...message, output: SUCCESS_OUTPUT };
  }

  const output = pruneFailureOutput(message.output);
  return output === message.output ? message : { ...message, output };
}

function isBashExecutionMessage(message: unknown): message is ContextMessage & {
  readonly command: string;
  readonly output: string;
  readonly exitCode?: number;
  readonly cancelled?: boolean;
  readonly truncated?: boolean;
} {
  if (!message || typeof message !== "object") return false;
  const candidate = message as Record<string, unknown>;
  return (
    candidate.role === "bashExecution" &&
    typeof candidate.command === "string" &&
    typeof candidate.output === "string" &&
    (candidate.exitCode === undefined || typeof candidate.exitCode === "number") &&
    (candidate.cancelled === undefined || typeof candidate.cancelled === "boolean") &&
    (candidate.truncated === undefined || typeof candidate.truncated === "boolean")
  );
}

function isTestCommand(command: string): boolean {
  const trimmed = command.trim();
  return /^npm\s+(?:test|run\s+test)(?:\s|$)/u.test(trimmed) && !containsShellOperator(trimmed);
}

function containsShellOperator(command: string): boolean {
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index]!;

    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (character === quote) {
        quote = undefined;
        continue;
      }
      if (quote === '"' && (character === "`" || (character === "$" && command[index + 1] === "("))) return true;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if ("\n\r;&|<>`".includes(character) || (character === "$" && command[index + 1] === "(")) return true;
  }

  return quote !== undefined;
}

function outputSignalsFailure(output: string): boolean {
  return output.split(/\r?\n/u).some((line) => isFailureMarker(line) || isFailureSummary(line));
}

function pruneFailureOutput(output: string): string {
  const lines = output.split(/\r?\n/u);
  const kept = new Set<number>();
  let hasFailureSignal = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    if (isFailureSummary(line)) {
      kept.add(index);
      continue;
    }

    if (isFailureMarker(line)) {
      hasFailureSignal = true;
      collectFailureBlock(lines, index, kept);
      continue;
    }

    if (isDiagnosticLine(line)) {
      hasFailureSignal = true;
      collectDiagnosticBlock(lines, index, kept);
    }
  }

  if (!hasFailureSignal) return output;
  const selected = lines.filter((_line, index) => kept.has(index)).join("\n").trim();
  return selected || output;
}

function collectFailureBlock(lines: readonly string[], start: number, kept: Set<number>): void {
  kept.add(start);
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (isFailureSummary(line) || (index > start + 1 && isFailureMarker(line))) return;
    if (line.trim() === "" || line.startsWith(" ") || line.startsWith("\t") || line.startsWith("#") || isDiagnosticLine(line)) {
      kept.add(index);
      continue;
    }
    return;
  }
}

function collectDiagnosticBlock(lines: readonly string[], start: number, kept: Set<number>): void {
  const contextStart = Math.max(0, start - DIAGNOSTIC_CONTEXT_RADIUS);
  const contextEnd = Math.min(lines.length - 1, start + DIAGNOSTIC_CONTEXT_RADIUS);
  for (let index = contextStart; index <= contextEnd; index += 1) {
    const line = lines[index]!;
    if (!isTestSummaryLine(line) || isFailureSummary(line)) kept.add(index);
  }

  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (isFailureSummary(line) || isFailureMarker(line)) return;
    if (line.trim() === "" || line.startsWith(" ") || line.startsWith("\t") || isDiagnosticLine(line)) {
      kept.add(index);
      continue;
    }
    return;
  }
}

function isFailureMarker(line: string): boolean {
  return /^\s*(?:✖|×|not ok\b|FAIL(?:URE|ED)?\b|FAILED\b|●\s)/iu.test(line);
}

function isFailureSummary(line: string): boolean {
  return (
    /^\s*ℹ\s+fail\s+[1-9]\d*\b/u.test(line) ||
    /^\s*(?:Test Suites|Tests|Assertions|Suites):.*\bfailed\b/iu.test(line)
  );
}

function isTestSummaryLine(line: string): boolean {
  return /^\s*ℹ\s+(?:tests|pass|fail|cancelled|skipped|todo|duration_ms)\b/u.test(line);
}

function isDiagnosticLine(line: string): boolean {
  return /^\s*(?:[A-Za-z]*Error\b|error\b|at\s+|Traceback\b|Expected\b|Received\b|E\s+)/u.test(line);
}
