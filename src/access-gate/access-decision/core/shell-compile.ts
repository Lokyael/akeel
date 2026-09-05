import {
  exceedsShellCommandBudget,
  MAX_SHELL_COMMANDS,
  MAX_SHELL_CWD_STATES,
} from "./limits";
import {
  analyzeShellCommandWords,
  shellCommandIsRecursive,
  shellCommandOutcomes,
  shellCommandSemanticFacts,
} from "./shell-words";
import { resolveShellPathWithTraversal } from "./shell-paths";
import type { ResolvedShellPath } from "./shell-paths";
import type { ShellCommandAnalysis } from "./shell-words";
import { parseShellFlow, traceShellFlowCwds } from "./shell-flow";
import type { ShellCwdState, ShellFlow } from "./shell-flow";

export type ShellRequest = Readonly<{
  readonly surface: "bash";
  readonly arguments: Readonly<{ readonly command: string }>;
  readonly cwd: string;
  readonly hasUI: boolean;
  readonly home?: string;
}>;

export type ShellReject = Readonly<{
  readonly kind: "reject";
  readonly code: "invalid-request" | "security-boundary" | "unsupported-syntax" | "dynamic-value" | "resource-limit";
  readonly anchor: Readonly<{ readonly start: number; readonly end: number }>;
  readonly resourceClass: "input" | "syntax" | "security";
}>;

type CompleteShellAnalysis = Extract<ShellCommandAnalysis, { kind: "complete" }>;

type ShellFacts = Readonly<{
  readonly command: string;
  readonly cwd: string;
  readonly hasUI: boolean;
  readonly home?: string;
  readonly flow: Extract<ShellFlow, { kind: "complete" }>;
  readonly analyses: readonly CompleteShellAnalysis[];
  readonly resolvedPaths: readonly (readonly ResolvedShellPath[])[];
  readonly cwdStates: readonly ShellCwdState[];
}>;

class ShellCompilation {
  constructor(facts: ShellFacts) {
    shellFactsByCompilation.set(this, Object.freeze(facts));
    Object.freeze(this);
  }
}

const shellFactsByCompilation = new WeakMap<ShellCompilation, ShellFacts>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Reflect.ownKeys(value);
  return keys.length === expected.length && keys.every((key) => typeof key === "string" && expected.includes(key));
}

function hasAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && allowed.includes(key));
}

function reject(
  code: ShellReject["code"],
  anchor: Readonly<{ start: number; end: number }>,
  resourceClass: ShellReject["resourceClass"],
): ShellReject {
  return Object.freeze({ kind: "reject", code, anchor: Object.freeze(anchor), resourceClass });
}

export function compileShell(request: unknown): ShellCompilation | ShellReject {
  if (
    !isRecord(request) ||
    !hasAllowedKeys(request, ["surface", "arguments", "cwd", "hasUI", "home"]) ||
    !["surface", "arguments", "cwd", "hasUI"].every((key) => Reflect.ownKeys(request).includes(key))
  ) {
    return reject("invalid-request", { start: 0, end: 0 }, "input");
  }
  if (request.surface !== "bash" || !isRecord(request.arguments) || !hasExactKeys(request.arguments, ["command"])) {
    return reject("invalid-request", { start: 0, end: 0 }, "input");
  }
  if (
    typeof request.arguments.command !== "string" ||
    request.arguments.command.length === 0 ||
    request.arguments.command.includes("\u0000")
  ) {
    return reject("invalid-request", { start: 0, end: 0 }, "input");
  }
  if (typeof request.cwd !== "string" || !request.cwd.startsWith("/") || request.cwd.includes("\u0000")) {
    return reject("invalid-request", { start: 0, end: 0 }, "input");
  }
  if (typeof request.hasUI !== "boolean") return reject("invalid-request", { start: 0, end: 0 }, "input");
  if (
    request.home !== undefined &&
    (typeof request.home !== "string" || !request.home.startsWith("/") || request.home.includes("\u0000"))
  ) {
    return reject("invalid-request", { start: 0, end: 0 }, "input");
  }
  if (exceedsShellCommandBudget(request.arguments.command, request.cwd, request.home ?? "")) {
    return reject("resource-limit", { start: 0, end: request.arguments.command.length }, "input");
  }

  const flow = parseShellFlow(request.arguments.command);
  if (flow.kind === "reject") return flow;
  if (flow.commands.length > MAX_SHELL_COMMANDS) {
    return reject("resource-limit", { start: 0, end: request.arguments.command.length }, "input");
  }

  const analyses: CompleteShellAnalysis[] = [];
  for (const command of flow.commands) {
    const analysis = analyzeShellCommandWords(command.words);
    if (analysis.kind === "reject") return analysis;
    analyses.push(analysis);
  }
  if (
    request.home === undefined &&
    flow.commands.some((command) => command.words.some((word) => word.pathKind === "home-relative"))
  ) {
    return reject("invalid-request", { start: 0, end: request.arguments.command.length }, "input");
  }
  const outcomes = analyses.map(shellCommandOutcomes);
  const cwdStates = traceShellFlowCwds(flow, request.cwd, outcomes, MAX_SHELL_CWD_STATES, {
    home: request.home,
  });
  if (cwdStates === undefined) {
    return reject("resource-limit", { start: 0, end: request.arguments.command.length }, "input");
  }
  const resolvedPaths: Array<readonly ResolvedShellPath[]> = [];
  for (const state of cwdStates) {
    const analysis = analyses[state.commandIndex]!;
    const semanticFacts = shellCommandSemanticFacts(analysis);
    const pathBases = semanticFacts?.pathBases ?? [];
    if (pathBases.length !== analysis.paths.length) {
      return reject("invalid-request", { start: 0, end: request.arguments.command.length }, "input");
    }
    let commandCwd = state.cwd;
    const resolvedCwdChanges = new Map<number, ResolvedShellPath>();
    const commandCwdTimeline: Array<Readonly<{ readonly start: number; readonly cwd: string }>> = [];
    for (const change of semanticFacts?.cwdChanges ?? []) {
      const baseCwd = change.base === "invocation-cwd" ? state.cwd : commandCwd;
      const resolved = resolveShellPathWithTraversal(baseCwd, change.path.text, {
        home: request.home,
        pathKind: change.path.pathKind,
      });
      if (resolved === undefined) {
        return reject("invalid-request", { start: 0, end: request.arguments.command.length }, "input");
      }
      resolvedCwdChanges.set(change.start, resolved);
      commandCwd = resolved.candidate;
      commandCwdTimeline.push(Object.freeze({ start: change.start, cwd: commandCwd }));
    }
    const hasImplicitPath = analysis.paths.length === 0 &&
      (shellCommandIsRecursive(analysis) || analysis.executable === "ls" || analysis.executable === "find");
    const paths = analysis.paths.length > 0
      ? analysis.paths
      : hasImplicitPath
        ? [{ text: ".", role: "source" as const, pathKind: undefined }]
        : [];
    const resolved = [] as ResolvedShellPath[];
    for (let pathIndex = 0; pathIndex < paths.length; pathIndex += 1) {
      const path = paths[pathIndex]!;
      const base = pathBases[pathIndex] ?? "invocation-cwd";
      const pathStart = semanticFacts?.pathStarts[pathIndex] ?? -1;
      const cwdChange = resolvedCwdChanges.get(pathStart);
      const pathCommandCwd = pathStart === 0 && path.text === "."
        ? commandCwd
        : commandCwdTimeline.reduce((cwd, entry) => entry.start < pathStart ? entry.cwd : cwd, state.cwd);
      const candidate = cwdChange ?? resolveShellPathWithTraversal(
        base === "command-cwd" ? pathCommandCwd : state.cwd,
        path.text,
        {
          home: request.home,
          pathKind: path.pathKind,
        },
      );
      if (candidate === undefined) {
        return reject("invalid-request", { start: 0, end: request.arguments.command.length }, "input");
      }
      resolved.push(candidate);
    }
    resolvedPaths.push(Object.freeze(resolved));
  }
  return new ShellCompilation({
    command: request.arguments.command,
    cwd: request.cwd,
    hasUI: request.hasUI,
    home: request.home,
    flow,
    analyses: Object.freeze(analyses),
    resolvedPaths: Object.freeze(resolvedPaths),
    cwdStates,
  });
}

export function isShellReject(value: unknown): value is ShellReject {
  if (!isRecord(value)) return false;
  const keys = Reflect.ownKeys(value);
  return (
    keys.length === 4 &&
    keys.every((key) => key === "kind" || key === "code" || key === "anchor" || key === "resourceClass") &&
    value.kind === "reject" &&
    typeof value.code === "string" &&
    ["invalid-request", "security-boundary", "unsupported-syntax", "dynamic-value", "resource-limit"].includes(value.code) &&
    isRecord(value.anchor) &&
    Reflect.ownKeys(value.anchor).length === 2 &&
    typeof value.anchor.start === "number" &&
    typeof value.anchor.end === "number" &&
    (value.resourceClass === "input" || value.resourceClass === "syntax" || value.resourceClass === "security")
  );
}

export function shellCompilationFacts(value: unknown): ShellFacts | undefined {
  if (!(value instanceof ShellCompilation)) return undefined;
  return shellFactsByCompilation.get(value);
}
