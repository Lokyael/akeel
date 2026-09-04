import { canonicalFacts } from "./canonical";
import { shellCompilationFacts } from "./shell-compile";
import type { DirectSurface } from "./types";
import { shellCommandHasOpaquePathAccess, shellCommandIsRecursive } from "./shell-words";
import type { ShellCommandClass, ShellEffect } from "./shell-words";

type AdmissionFacts = Readonly<{
  operation: DirectSurface;
  resolvedCandidate: string;
  traversed: readonly string[];
  interactive: boolean;
}>;

class AdmissionPlan {
  constructor(facts: AdmissionFacts) {
    admissionFactsByPlan.set(this, Object.freeze(facts));
    Object.freeze(this);
  }
}

const admissionFactsByPlan = new WeakMap<AdmissionPlan, AdmissionFacts>();

export function projectAdmission(compilation: unknown): AdmissionPlan | undefined {
  const facts = canonicalFacts(compilation);
  if (!facts) return undefined;
  return new AdmissionPlan({
    operation: facts.surface,
    resolvedCandidate: facts.path,
    traversed: facts.traversed,
    interactive: facts.hasUI,
  });
}

export function admissionFacts(value: unknown): AdmissionFacts | undefined {
  if (!(value instanceof AdmissionPlan)) return undefined;
  return admissionFactsByPlan.get(value);
}

type ShellAdmissionPath = Readonly<{
  readonly role: "source" | "target";
  readonly candidate: string;
  readonly traversed: readonly string[];
}>;

type ShellAdmissionOperation = Readonly<{
  readonly commandClass: ShellCommandClass;
  readonly opaquePathAccess: boolean;
  readonly recursive: boolean;
  readonly interactive: boolean;
  readonly effects: readonly ShellEffect[];
  readonly paths: readonly ShellAdmissionPath[];
}>;

type ShellAdmissionFacts = Readonly<{
  readonly operations: readonly ShellAdmissionOperation[];
}>;

class ShellAdmissionPlan {
  constructor(facts: ShellAdmissionFacts) {
    shellAdmissionFactsByPlan.set(this, Object.freeze(facts));
    Object.freeze(this);
  }
}

const shellAdmissionFactsByPlan = new WeakMap<ShellAdmissionPlan, ShellAdmissionFacts>();

export function projectShellAdmission(compilation: unknown): ShellAdmissionPlan | undefined {
  const facts = shellCompilationFacts(compilation);
  if (!facts) return undefined;

  const operations: ShellAdmissionOperation[] = [];
  for (let stateIndex = 0; stateIndex < facts.cwdStates.length; stateIndex += 1) {
    const state = facts.cwdStates[stateIndex]!;
    const analysis = facts.analyses[state.commandIndex]!;
    const paths: ShellAdmissionPath[] = [];
    const resolvedPaths = facts.resolvedPaths[stateIndex];
    const hasImplicitPath = analysis.paths.length === 0 &&
      (shellCommandIsRecursive(analysis) || analysis.executable === "ls" || analysis.executable === "find");
    const expectedPathCount = analysis.paths.length + (hasImplicitPath ? 1 : 0);
    if (resolvedPaths === undefined || resolvedPaths.length !== expectedPathCount) return undefined;
    for (let pathIndex = 0; pathIndex < analysis.paths.length; pathIndex += 1) {
      const path = analysis.paths[pathIndex]!;
      const resolved = resolvedPaths[pathIndex]!;
      paths.push(Object.freeze({
        role: path.role,
        candidate: resolved.candidate,
        traversed: resolved.traversed,
      }));
    }
    if (paths.length === 0 && hasImplicitPath) {
      const resolved = resolvedPaths[0];
      if (resolved === undefined) return undefined;
      paths.push(Object.freeze({
        role: "source",
        candidate: resolved.candidate,
        traversed: resolved.traversed,
      }));
    }
    const recursive = shellCommandIsRecursive(analysis);
    operations.push(Object.freeze({
      commandClass: analysis.commandClass,
      opaquePathAccess: shellCommandHasOpaquePathAccess(analysis),
      recursive,
      interactive: facts.hasUI,
      effects: analysis.effects,
      paths: Object.freeze(paths),
    }));
  }
  return new ShellAdmissionPlan({ operations: Object.freeze(operations) });
}

export function shellAdmissionFacts(value: unknown): ShellAdmissionFacts | undefined {
  if (!(value instanceof ShellAdmissionPlan)) return undefined;
  return shellAdmissionFactsByPlan.get(value);
}
