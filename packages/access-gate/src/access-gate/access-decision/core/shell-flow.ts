import { MAX_SHELL_CWD_STATES } from "./limits";
import { resolveShellPath } from "./shell-paths";
import type { ShellPathContext } from "./shell-paths";
import { scanShellWords } from "./shell-language";
import type { ShellWord } from "./shell-language";

export type ShellFlowOperator = Readonly<{
  readonly kind: "and" | "or" | "sequence";
  readonly start: number;
  readonly end: number;
}>;

export type ShellFlowCommand = Readonly<{
  readonly words: readonly ShellWord[];
}>;

export type ShellCommandStatus = "success" | "failure";
export type ShellCwdState = Readonly<{
  readonly commandIndex: number;
  readonly cwd: string;
}>;

type ShellSyntaxReject = Readonly<{
  readonly kind: "reject";
  readonly code: "unsupported-syntax" | "dynamic-value";
  readonly anchor: Readonly<{ start: number; end: number }>;
  readonly resourceClass: "syntax";
}>;

export type ShellFlow =
  | Readonly<{
      readonly kind: "complete";
      readonly commands: readonly ShellFlowCommand[];
      readonly operators: readonly ShellFlowOperator[];
    }>
  | ShellSyntaxReject;

export type SimpleShellFlow =
  | Readonly<{ kind: "complete"; words: readonly ShellWord[] }>
  | Readonly<{
      kind: "reject";
      code: "unsupported-syntax" | "dynamic-value";
      anchor: Readonly<{ start: number; end: number }>;
      resourceClass: "syntax";
    }>;

function syntaxReject(word: ShellWord | undefined): ShellSyntaxReject {
  const start = word?.start ?? 0;
  const end = word?.end ?? start;
  return Object.freeze({
    kind: "reject",
    code: "unsupported-syntax",
    anchor: Object.freeze({ start, end }),
    resourceClass: "syntax",
  });
}

function flowOperator(word: ShellWord): ShellFlowOperator | undefined {
  if (word.quote !== "bare") return undefined;
  if (word.text === "&&") return Object.freeze({ kind: "and", start: word.start, end: word.end });
  if (word.text === "||") return Object.freeze({ kind: "or", start: word.start, end: word.end });
  if (word.text === ";") return Object.freeze({ kind: "sequence", start: word.start, end: word.end });
  return undefined;
}

export function parseShellFlow(input: string): ShellFlow {
  const scanned = scanShellWords(input);
  if (scanned.kind === "reject") return scanned;
  if (scanned.words.length === 0) return syntaxReject(undefined);

  const commands: ShellFlowCommand[] = [];
  const operators: ShellFlowOperator[] = [];
  let current: ShellWord[] = [];
  for (const word of scanned.words) {
    const operator = flowOperator(word);
    if (operator !== undefined) {
      if (current.length === 0) return syntaxReject(word);
      commands.push(Object.freeze({ words: Object.freeze(current) }));
      operators.push(operator);
      current = [];
      continue;
    }
    if (word.quote === "bare" && (word.text === "|" || word.text === "&")) return syntaxReject(word);
    current.push(word);
  }
  if (current.length === 0) return syntaxReject(scanned.words[scanned.words.length - 1]);
  commands.push(Object.freeze({ words: Object.freeze(current) }));

  return Object.freeze({
    kind: "complete",
    commands: Object.freeze(commands),
    operators: Object.freeze(operators),
  });
}

export function reachableShellCommands(
  flow: Extract<ShellFlow, { kind: "complete" }>,
  outcomes: readonly (readonly ShellCommandStatus[])[],
): readonly number[] {
  if (flow.commands.length === 0 || outcomes.length === 0) return Object.freeze([]);

  const reachable = new Set<number>([0]);
  const pending = [0];
  while (pending.length > 0) {
    const commandIndex = pending.shift()!;
    for (const status of outcomes[commandIndex] ?? []) {
      const nextIndex = nextReachableCommand(flow, commandIndex, status);
      if (nextIndex === undefined || reachable.has(nextIndex)) continue;
      reachable.add(nextIndex);
      pending.push(nextIndex);
    }
  }
  return Object.freeze([...reachable].sort((left, right) => left - right));
}

function cdTarget(command: ShellFlowCommand): ShellWord | undefined {
  if (command.words[0]?.text !== "cd") return undefined;
  return command.words[1];
}

export function traceShellFlowCwds(
  flow: Extract<ShellFlow, { kind: "complete" }>,
  initialCwd: string,
  outcomes: readonly (readonly ShellCommandStatus[])[],
  maxStates = MAX_SHELL_CWD_STATES,
  context: ShellPathContext = {},
): readonly ShellCwdState[] | undefined {
  const states: ShellCwdState[] = [];
  const stateKeys = new Set<string>();
  const queuedKeys = new Set<string>([`${0}\u0000${initialCwd}`]);
  const pending: ShellCwdState[] = [{ commandIndex: 0, cwd: initialCwd }];

  while (pending.length > 0) {
    const state = pending.shift()!;
    const index = state.commandIndex;
    const key = `${index}\u0000${state.cwd}`;
    if (stateKeys.has(key)) continue;
    if (states.length >= maxStates) return undefined;
    stateKeys.add(key);
    states.push(Object.freeze(state));

    const target = cdTarget(flow.commands[index]!);
    for (const status of outcomes[index] ?? []) {
      const resolvedTarget = target === undefined ? undefined : resolveShellPath(state.cwd, target.text, {
        home: context.home,
        pathKind: target.pathKind,
      });
      const nextCwd = status === "success" && resolvedTarget !== undefined ? resolvedTarget : state.cwd;
      const nextIndex = nextReachableCommand(flow, index, status);
      if (nextIndex === undefined) continue;
      const nextKey = `${nextIndex}\u0000${nextCwd}`;
      if (queuedKeys.has(nextKey)) continue;
      if (states.length + pending.length >= maxStates) return undefined;
      queuedKeys.add(nextKey);
      pending.push({ commandIndex: nextIndex, cwd: nextCwd });
    }
  }
  return Object.freeze(states);
}

function nextReachableCommand(
  flow: Extract<ShellFlow, { kind: "complete" }>,
  commandIndex: number,
  status: ShellCommandStatus,
): number | undefined {
  for (let nextIndex = commandIndex + 1; nextIndex < flow.commands.length; nextIndex += 1) {
    const operator = flow.operators[nextIndex - 1]!;
    if (
      operator.kind === "sequence" ||
      (operator.kind === "and" && status === "success") ||
      (operator.kind === "or" && status === "failure")
    ) {
      return nextIndex;
    }
  }
  return undefined;
}

export function scanSimpleShellFlow(input: string): SimpleShellFlow {
  const parsed = parseShellFlow(input);
  if (parsed.kind === "reject") return parsed;
  if (parsed.commands.length !== 1) {
    const operator = parsed.operators[0];
    return syntaxReject({
      text: "",
      start: operator?.start ?? 0,
      end: operator?.end ?? 0,
      quote: "bare",
    });
  }
  return Object.freeze({ kind: "complete", words: parsed.commands[0]!.words });
}
