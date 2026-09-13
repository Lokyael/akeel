import { canonicalFacts } from "./canonical";
import { shellCompilationFacts } from "./shell-compile";
import type { ShellCommandClass, ShellEffect } from "./shell-words";
import type { DirectSurface } from "./types";

export type DirectDisplayView = Readonly<{
  readonly kind: "direct";
  readonly operation: DirectSurface;
  readonly path: string;
}>;

export function projectDisplay(compilation: unknown): DirectDisplayView | undefined {
  const facts = canonicalFacts(compilation);
  if (!facts) return undefined;
  return Object.freeze({
    kind: "direct",
    operation: facts.surface,
    path: facts.path,
  });
}

export type ShellDisplayOperation = Readonly<{
  readonly commandClass: ShellCommandClass;
  readonly effects: readonly ShellEffect[];
}>;

export type ShellDisplayView = Readonly<{
  readonly kind: "shell";
  readonly command: string;
  readonly operations: readonly ShellDisplayOperation[];
}>;

export function projectShellDisplay(compilation: unknown): ShellDisplayView | undefined {
  const facts = shellCompilationFacts(compilation);
  if (!facts) return undefined;
  return Object.freeze({
    kind: "shell",
    command: facts.command,
    operations: Object.freeze(
      facts.analyses.map((analysis) => Object.freeze({
        commandClass: analysis.commandClass,
        effects: analysis.effects,
      })),
    ),
  });
}
