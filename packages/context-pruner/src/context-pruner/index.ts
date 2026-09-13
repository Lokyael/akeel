import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SUCCESS_OUTPUT = "All tests passed";
const DIAGNOSTIC_CONTEXT_RADIUS = 1;

type ContextMessage = Readonly<Record<string, unknown>>;
type MessageRecord = Record<string, unknown>;
type TextContent = Readonly<{ readonly type: "text"; readonly text: string }>;
type BashToolCall = Readonly<{ readonly id: string; readonly command: string }>;

export type TestOutputInput = Readonly<{
  readonly command: string;
  readonly output: string;
  readonly exitCode?: number;
  readonly cancelled?: boolean;
  readonly truncated?: boolean;
}>;

export type TestOutputProjection = Readonly<{
  readonly original: string;
  readonly model: string;
  readonly changed: boolean;
}>;

export function projectTestOutput(input: TestOutputInput): TestOutputProjection | undefined {
  if (input.cancelled || input.truncated || input.exitCode === undefined) return undefined;
  if (!isTestCommand(input.command)) {
    return { original: input.output, model: input.output, changed: false };
  }

  const model = input.exitCode === 0 && hasVerifiedTestSuccess(input.output)
    ? SUCCESS_OUTPUT
    : pruneFailureOutput(input.output);
  return { original: input.output, model, changed: model !== input.output };
}

/**
 * Reduces model-invoked bash test output before it is sent to the model.
 * User-entered `!`/`!!` messages are intentionally outside this path.
 * Returning the original message preserves information when classification is uncertain.
 */
export function pruneTestContext(messages: readonly unknown[]): unknown[] {
  const bashCalls = collectBashToolCalls(messages);
  return messages.map((message) => pruneMessage(message, bashCalls));
}

export default function contextPruner(pi: ExtensionAPI): void {
  pi.on("context", (event) => ({ messages: pruneTestContext(event.messages) }));
}

function pruneMessage(message: unknown, bashCalls: ReadonlyMap<string, BashToolCall>): unknown {
  if (!isBashToolResult(message)) return message;
  const call = bashCalls.get(message.toolCallId);
  if (!call) return message;

  const input = adaptBashToolResult(message, call.command);
  if (!input) return message;
  const projection = projectTestOutput(input.input);
  if (!projection?.changed) return message;

  const model = input.status === undefined ? projection.model : `${projection.model}\n\n${input.status}`;
  const text = getSingleTextContent(message.content);
  if (!text) return message;
  const content = message.content.map((block) => block === text ? { ...text, text: model } : block);
  return { ...message, content };
}

function collectBashToolCalls(messages: readonly unknown[]): ReadonlyMap<string, BashToolCall> {
  const calls = new Map<string, BashToolCall>();
  for (const message of messages) {
    if (!isAssistantMessage(message)) continue;
    for (const block of message.content) {
      if (!isBashToolCall(block)) continue;
      const argumentsValue = block.arguments as MessageRecord;
      calls.set(block.id, { id: block.id, command: argumentsValue.command as string });
    }
  }
  return calls;
}

type AdaptedBashToolResult = Readonly<{
  readonly input: TestOutputInput;
  readonly status?: string;
}>;

function adaptBashToolResult(message: BashToolResult, command: string): AdaptedBashToolResult | undefined {
  const output = getSingleTextContent(message.content)?.text;
  if (output === undefined || isTruncatedDetails(message.details)) return undefined;

  const cancelled = output.endsWith("\n\nCommand aborted");
  if (cancelled) {
    return { input: { command, output, cancelled: true, truncated: false } };
  }

  const exitMatch = output.match(/\n\nCommand exited with code (-?\d+)$/u);
  const exitCode = exitMatch ? Number(exitMatch[1]) : 0;
  if (message.isError && (!exitMatch || exitCode === 0)) return undefined;
  const rawOutput = exitMatch ? output.slice(0, exitMatch.index) : output;
  return {
    input: { command, output: rawOutput, exitCode, cancelled: false, truncated: false },
    status: exitMatch?.[0].slice(2),
  };
}

function isTruncatedDetails(details: unknown): boolean {
  if (!details || typeof details !== "object") return false;
  const truncation = (details as MessageRecord).truncation;
  return !!truncation && typeof truncation === "object" && (truncation as MessageRecord).truncated === true;
}

function isAssistantMessage(message: unknown): message is ContextMessage & { readonly content: readonly unknown[] } {
  return isRecordWithContent(message) && message.role === "assistant";
}

function isBashToolCall(block: unknown): block is Readonly<{
  readonly id: string;
  readonly arguments: MessageRecord;
}> {
  if (!block || typeof block !== "object") return false;
  const candidate = block as MessageRecord;
  const argumentsValue = candidate.arguments;
  return (
    candidate.type === "toolCall" &&
    candidate.name === "bash" &&
    typeof candidate.id === "string" &&
    !!argumentsValue &&
    typeof argumentsValue === "object" &&
    typeof (argumentsValue as MessageRecord).command === "string"
  );
}

function isBashToolResult(message: unknown): message is ContextMessage & BashToolResult {
  if (!isRecordWithContent(message)) return false;
  const candidate = message as MessageRecord;
  return candidate.role === "toolResult" && candidate.toolName === "bash" &&
    typeof candidate.toolCallId === "string" && typeof candidate.isError === "boolean";
}

function getSingleTextContent(content: readonly unknown[]): TextContent | undefined {
  if (content.length !== 1) return undefined;
  const block = content[0];
  if (!block || typeof block !== "object") return undefined;
  const candidate = block as MessageRecord;
  return candidate.type === "text" && typeof candidate.text === "string" ? candidate as TextContent : undefined;
}

function isRecordWithContent(message: unknown): message is ContextMessage & { readonly content: readonly unknown[] } {
  if (!message || typeof message !== "object") return false;
  const candidate = message as MessageRecord;
  return Array.isArray(candidate.content);
}

type BashToolResult = Readonly<{
  readonly toolCallId: string;
  readonly toolName: "bash";
  readonly content: readonly unknown[];
  readonly isError: boolean;
  readonly details?: unknown;
}>;

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

type TestSummary = Readonly<{
  readonly total?: number;
  readonly passed?: number;
  readonly failed?: number;
  readonly skipped?: number;
  readonly todo?: number;
  readonly cancelled?: number;
}>;

function hasVerifiedTestSuccess(output: string): boolean {
  if (hasNonPassMetadata(output) || outputSignalsFailure(output)) return false;

  const lines = output.split(/\r?\n/u);
  const summaries = [
    parseTapSummaries(lines),
    parseVitestSummaries(lines),
    parseJestSummaries(lines),
    parseBunSummaries(lines),
  ].flatMap((candidate) => candidate ?? []);
  return allSummariesPass(summaries);
}

function allSummariesPass(summaries: readonly TestSummary[]): boolean {
  return summaries.length > 0 && summaries.every((summary) =>
    summary.total !== undefined &&
    summary.passed !== undefined &&
    summary.total > 0 &&
    summary.passed === summary.total &&
    (summary.failed ?? 0) === 0 &&
    (summary.skipped ?? 0) === 0 &&
    (summary.todo ?? 0) === 0 &&
    (summary.cancelled ?? 0) === 0,
  );
}

function parseTapSummaries(lines: readonly string[]): readonly TestSummary[] | undefined {
  const byIndent = new Map<number, TestSummary[]>();
  const current = new Map<number, TestSummary>();

  for (const line of lines) {
    const match = line.match(/^(\s*)ℹ\s+(tests|pass|fail|skipped|todo|cancelled)\s+(\d+)\b/u);
    if (!match) continue;

    const indent = match[1]!.length;
    const field = match[2]! as "tests" | "pass" | "fail" | "skipped" | "todo" | "cancelled";
    const value = toSafeCount(match[3]!);
    if (field === "tests") {
      const summary: TestSummary = { total: value };
      const summaries = byIndent.get(indent) ?? [];
      summaries.push(summary);
      byIndent.set(indent, summaries);
      current.set(indent, summary);
      continue;
    }

    const summary = current.get(indent);
    if (!summary) {
      byIndent.set(indent, [...(byIndent.get(indent) ?? []), {}]);
      continue;
    }
    const property = field === "pass" ? "passed" : field === "fail" ? "failed" : field;
    current.set(indent, { ...summary, [property]: value });
    const summaries = byIndent.get(indent)!;
    summaries[summaries.length - 1] = current.get(indent)!;
  }

  if (byIndent.size === 0) return undefined;
  let topLevelIndent = Number.POSITIVE_INFINITY;
  for (const indent of byIndent.keys()) {
    topLevelIndent = Math.min(topLevelIndent, indent);
  }
  return byIndent.get(topLevelIndent)!;
}

function parseVitestSummaries(lines: readonly string[]): readonly TestSummary[] | undefined {
  const summaryLines = lines.filter((line) => /^\s*Tests\s+(?!:)/iu.test(line));
  if (summaryLines.length === 0) return undefined;
  return summaryLines.map((line) => ({
    total: numberFromMatch(line.match(/\((\d+)\)\s*$/u)),
    passed: numberFromMatch(line.match(/\b(\d+)\s+passed\b/iu)),
    failed: numberFromMatch(line.match(/\b(\d+)\s+failed\b/iu)),
    skipped: numberFromMatch(line.match(/\b(\d+)\s+skipped\b/iu)),
    todo: numberFromMatch(line.match(/\b(\d+)\s+todo\b/iu)),
  }));
}

function parseJestSummaries(lines: readonly string[]): readonly TestSummary[] | undefined {
  const summaryLines = lines.filter((line) => /^\s*Tests:\s/iu.test(line));
  if (summaryLines.length === 0) return undefined;
  return summaryLines.map((line) => ({
    total: numberFromMatch(line.match(/\b(\d+)\s+total\b/iu)),
    passed: numberFromMatch(line.match(/\b(\d+)\s+passed\b/iu)),
    failed: numberFromMatch(line.match(/\b(\d+)\s+failed\b/iu)),
    skipped: numberFromMatch(line.match(/\b(\d+)\s+skipped\b/iu)),
    todo: numberFromMatch(line.match(/\b(\d+)\s+todo\b/iu)),
  }));
}

function parseBunSummaries(lines: readonly string[]): readonly TestSummary[] | undefined {
  const passes = lines
    .map((line) => numberFromMatch(line.match(/^\s*(\d+)\s+pass(?:ed)?\b/iu)))
    .filter((value): value is number => value !== undefined);
  const runs = lines
    .map((line) => line.match(/^\s*Ran\s+(\d+)\s+tests?\s+across\s+(\d+)\s+files?\b/iu))
    .map((match) => match ? toSafeCount(match[1]!) : undefined)
    .filter((value): value is number => value !== undefined);

  if (passes.length === 0 && runs.length === 0) return undefined;
  return Array.from({ length: Math.max(passes.length, runs.length) }, (_, index) => ({
    total: runs[index],
    passed: passes[index],
    failed: undefined,
  }));
}

function numberFromMatch(match: RegExpMatchArray | null): number | undefined {
  return match ? toSafeCount(match[1]!) : undefined;
}

function toSafeCount(value: string): number | undefined {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : undefined;
}

function hasNonPassMetadata(output: string): boolean {
  return output.split(/\r?\n/u).some((line) =>
    /warning|deprecated/iu.test(line) || hasPositiveMetadataCount(line),
  );
}

function hasPositiveMetadataCount(line: string): boolean {
  return (
    /\b(?:skipped|skip|todo|cancelled)\s+[1-9]\d*\b/iu.test(line) ||
    /\b[1-9]\d*\s+(?:skipped|skip|todo|cancelled)\b/iu.test(line) ||
    /\b(?:skipped|skip|todo|cancelled)\s*\(\s*[1-9]\d*\s*\)/iu.test(line) ||
    /\b(?:skipped|skip|todo|cancelled)\s*[:=]\s*[1-9]\d*\b/iu.test(line)
  );
}

function outputSignalsFailure(output: string): boolean {
  return output.split(/\r?\n/u).some((line) =>
    isFailureMarker(line) ||
    isFailureSummary(line) ||
    /^\s*(?:Test\s+Files|Test\s+Suites|Tests?)\s*:?.*\b[1-9]\d*\s+(?:fail(?:ed)?|failures?)\b/iu.test(line) ||
    /^\s*Snapshots?\s*:?.*\b[1-9]\d*\s+(?:fail(?:ed)?|failures?)\b/iu.test(line) ||
    /^\s*[1-9]\d*\s+(?:fail(?:ed)?|failures?)\b/iu.test(line),
  );
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
