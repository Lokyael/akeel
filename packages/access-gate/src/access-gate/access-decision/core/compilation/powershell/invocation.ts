import {
  exceedsShellCommandBudget,
} from "../../limits";
import type {
  CompileEnvironmentFacts,
  ResolvedPathEvidence,
  ShellCompilationOperation,
  UnifiedCanonicalReject,
} from "../index";

const REJECT_CHARACTERS = /[;\r\n|&><$(){}[\]`@]/u;

export type PowerShellToken = Readonly<{
  value: string;
  isLiteral: boolean;
}>;

function reject(
  code: "invalid-request" | "resource-limit" | "security-boundary" | "unsupported-syntax",
  end: number,
): UnifiedCanonicalReject {
  return Object.freeze({
    kind: "reject",
    code,
    anchor: Object.freeze({ start: 0, end }),
    resourceClass: code === "security-boundary" ? "security" : code === "unsupported-syntax" ? "syntax" : "input",
  });
}

export function tokenizePowerShellWords(command: string): readonly PowerShellToken[] | undefined {
  const tokens: PowerShellToken[] = [];
  let index = 0;
  const length = command.length;

  while (index < length) {
    while (index < length && /\s/u.test(command[index]!)) {
      index++;
    }
    if (index >= length) break;

    const char = command[index]!;
    if (char === "'") {
      // Single-quoted literal
      index++;
      let value = "";
      let closed = false;
      while (index < length) {
        if (command[index] === "'") {
          if (index + 1 < length && command[index + 1] === "'") {
            value += "'";
            index += 2;
            continue;
          }
          closed = true;
          index++;
          break;
        }
        value += command[index];
        index++;
      }
      if (!closed) return undefined;
      tokens.push(Object.freeze({ value, isLiteral: true }));
      continue;
    }

    if (char === '"') {
      // Double-quoted string without interpolation
      index++;
      let value = "";
      let closed = false;
      while (index < length) {
        const c = command[index]!;
        if (c === '"') {
          if (index + 1 < length && command[index + 1] === '"') {
            value += '"';
            index += 2;
            continue;
          }
          closed = true;
          index++;
          break;
        }
        if (c === "$" || c === "`") {
          // Dynamic expansion in double quote is unsupported in v1
          return undefined;
        }
        value += c;
        index++;
      }
      if (!closed) return undefined;
      tokens.push(Object.freeze({ value, isLiteral: true }));
      continue;
    }

    // Bare token
    let value = "";
    while (index < length && !/\s/u.test(command[index]!)) {
      const c = command[index]!;
      if (c === "'" || c === '"') return undefined;
      value += c;
      index++;
    }
    tokens.push(Object.freeze({ value, isLiteral: false }));
  }

  return Object.freeze(tokens);
}

export function analyzePowerShellCommand(
  rawCommand: string,
  environment: CompileEnvironmentFacts,
): readonly ShellCompilationOperation[] | UnifiedCanonicalReject {
  if (typeof rawCommand !== "string" || rawCommand.length === 0 || rawCommand.includes("\u0000")) {
    return reject("invalid-request", 0);
  }
  if (exceedsShellCommandBudget(rawCommand)) {
    return reject("resource-limit", rawCommand.length);
  }

  const trimmed = rawCommand.trim();
  if (REJECT_CHARACTERS.test(trimmed)) {
    return reject("unsupported-syntax", rawCommand.length);
  }

  const tokens = tokenizePowerShellWords(trimmed);
  if (!tokens || tokens.length === 0) {
    return reject("unsupported-syntax", rawCommand.length);
  }

  const executableToken = tokens[0]!.value;
  const executableLower = executableToken.toLowerCase();
  const args = tokens.slice(1).map((t) => t.value);

  // 1. Destructive commands hard rejection
  if (["remove-item", "rmdir", "del", "erase", "rd", "ri"].includes(executableLower)) {
    return [Object.freeze({
      commandClass: "destroy",
      effects: Object.freeze(["delete" as const]),
      paths: Object.freeze([]),
      recursive: true,
      opaquePathAccess: false,
      hardBoundary: true,
    })];
  }

  // 2. Read-only filesystem cmdlets (Get-ChildItem, Get-Content)
  if (["get-childitem", "gci", "dir", "get-content", "gc", "cat"].includes(executableLower)) {
    let targetPath = ".";
    let recursive = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg.toLowerCase() === "-literalpath" && i + 1 < args.length) {
        targetPath = args[i + 1]!;
        i++;
      } else if (arg.toLowerCase() === "-path" && i + 1 < args.length) {
        targetPath = args[i + 1]!;
        i++;
      } else if (arg.toLowerCase() === "-recurse") {
        recursive = true;
      } else if (!arg.startsWith("-") && targetPath === ".") {
        targetPath = arg;
      }
    }

    const resolved = resolveCommandPath(environment, environment.cwd, targetPath);
    const paths = resolved ? [Object.freeze({ role: "source" as const, evidence: resolved })] : [];
    return [Object.freeze({
      commandClass: "inspect",
      effects: Object.freeze(["read" as const]),
      paths: Object.freeze(paths),
      recursive,
      opaquePathAccess: false,
      hardBoundary: false,
    })];
  }

  // 3. Known external programs (git, node, npm)
  if (executableLower === "git" || executableLower === "git.exe") {
    const sub = args[0]?.toLowerCase() ?? "";
    if (["clean", "rm"].includes(sub)) {
      return [Object.freeze({
        commandClass: "destroy",
        effects: Object.freeze(["delete" as const]),
        paths: Object.freeze([]),
        recursive: true,
        opaquePathAccess: false,
        hardBoundary: true,
      })];
    }
    const isMutating = ["add", "commit", "checkout", "restore"].includes(sub);
    const paths: Array<Readonly<{ role: "source" | "target"; evidence: ResolvedPathEvidence }>> = [];
    for (let i = 1; i < args.length; i++) {
      const arg = args[i]!;
      if (!arg.startsWith("-")) {
        const resolved = resolveCommandPath(environment, environment.cwd, arg);
        if (resolved) {
          paths.push(Object.freeze({ role: isMutating ? "target" as const : "source" as const, evidence: resolved }));
        }
      }
    }
    return [Object.freeze({
      commandClass: isMutating ? "modify" : "inspect",
      effects: Object.freeze(isMutating ? ["write" as const] : ["read" as const]),
      paths: Object.freeze(paths),
      recursive: false,
      opaquePathAccess: false,
      hardBoundary: false,
    })];
  }

  if (executableLower === "npm" || executableLower === "npm.cmd") {
    return [Object.freeze({
      commandClass: "execute",
      effects: Object.freeze(["execute" as const]),
      paths: Object.freeze([]),
      recursive: false,
      opaquePathAccess: true,
      hardBoundary: false,
    })];
  }

  if (executableLower === "node" || executableLower === "node.exe") {
    const scriptPath = args.find((a) => !a.startsWith("-"));
    const paths: Array<Readonly<{ role: "source" | "target"; evidence: ResolvedPathEvidence }>> = [];
    if (scriptPath) {
      const resolved = resolveCommandPath(environment, environment.cwd, scriptPath);
      if (resolved) {
        paths.push(Object.freeze({ role: "source" as const, evidence: resolved }));
      }
    }
    return [Object.freeze({
      commandClass: "execute",
      effects: Object.freeze(["execute" as const]),
      paths: Object.freeze(paths),
      recursive: false,
      opaquePathAccess: true,
      hardBoundary: false,
    })];
  }

  // 4. Fallback for other single command executables
  const isExe = executableLower.endsWith(".exe");
  return [Object.freeze({
    commandClass: "unknown",
    effects: Object.freeze(["execute" as const]),
    paths: Object.freeze([]),
    recursive: false,
    opaquePathAccess: isExe,
    hardBoundary: false,
  })];
}

function resolveCommandPath(
  environment: CompileEnvironmentFacts,
  base: string,
  targetPath: string,
): ResolvedPathEvidence | undefined {
  return environment.pathEvidence.resolve(base, targetPath, {
    home: environment.home,
    pathKind: "literal",
  });
}
