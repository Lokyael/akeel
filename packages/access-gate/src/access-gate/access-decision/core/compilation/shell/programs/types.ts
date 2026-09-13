import type { ShellCommandClass, ShellEffect, ShellPath } from "../invocation";
import type { ShellWord } from "../language";

export type ProgramInvocation = Readonly<{
  readonly executable: string;
  readonly arguments: readonly ShellWord[];
}>;

export type ProgramPathBase = "invocation-cwd" | "command-cwd";

export type ProgramCwdChange = Readonly<{
  readonly path: ShellPath;
  readonly start: number;
  readonly base: ProgramPathBase;
}>;

export type ProgramPath = Readonly<{
  readonly path: ShellPath;
  readonly start: number;
  readonly base: ProgramPathBase;
}>;

export type ProgramSemantic = Readonly<{
  readonly commandClass: ShellCommandClass;
  readonly effects: readonly ShellEffect[];
  readonly paths: readonly ProgramPath[];
  readonly cwdChanges: readonly ProgramCwdChange[];
  readonly recursive: boolean;
  readonly opaque: boolean;
  readonly hardBoundary: boolean;
}>;
