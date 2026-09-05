import {
  freezePolicySnapshot,
  freezeShellPolicySnapshot,
  resolveExistingPath,
} from "../core/index";
import type {
  PolicyMode,
  PolicySnapshot as DirectPolicySnapshot,
  ShellPolicyMode,
  ShellPolicySnapshot,
} from "../core/index";

export type PolicyConfig = Readonly<{
  readonly paths?: Readonly<{
    readonly read?: PolicyMode;
    readonly write?: PolicyMode;
    readonly edit?: PolicyMode;
    readonly list?: PolicyMode;
    readonly search?: PolicyMode;
    readonly allowedRoots?: readonly string[];
    readonly blockedRoots?: readonly string[];
    readonly blockedPaths?: readonly string[];
  }>;
  readonly commands?: Readonly<{
    readonly inspect?: ShellPolicyMode;
    readonly modify?: ShellPolicyMode;
    readonly execute?: ShellPolicyMode;
    readonly destroy?: ShellPolicyMode;
    readonly unknown?: ShellPolicyMode;
  }>;
}>;

export type PolicySnapshot = Readonly<{
  readonly direct: DirectPolicySnapshot;
  readonly shell: ShellPolicySnapshot;
}>;

const POLICY_MODES = ["allow", "ask", "deny"] as const;
const PATH_FIELDS = [
  "read",
  "write",
  "edit",
  "list",
  "search",
  "allowedRoots",
  "blockedRoots",
  "blockedPaths",
] as const;
const COMMAND_FIELDS = ["inspect", "modify", "execute", "destroy", "unknown"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && allowed.includes(key));
}

function isMode(value: unknown): value is PolicyMode {
  return (POLICY_MODES as readonly unknown[]).includes(value);
}

function modeOrDefault(value: unknown, fallback: PolicyMode): PolicyMode {
  if (value === undefined) return fallback;
  if (!isMode(value)) throw invalidConfig();
  return value;
}

function isAbsolutePolicyPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.startsWith("/") && !value.includes("\u0000");
}

function normalizePolicyPath(path: string): string {
  return path;
}

function readPaths(value: unknown): {
  readonly read: PolicyMode;
  readonly write: PolicyMode;
  readonly edit: PolicyMode;
  readonly list: PolicyMode;
  readonly search: PolicyMode;
  readonly allowedRoots: readonly string[];
  readonly blockedRoots: readonly string[];
  readonly blockedPaths: readonly string[];
} {
  if (value === undefined) {
    return {
      read: "deny",
      write: "deny",
      edit: "deny",
      list: "deny",
      search: "deny",
      allowedRoots: [],
      blockedRoots: [],
      blockedPaths: [],
    };
  }
  if (!isRecord(value) || !hasOnlyKeys(value, PATH_FIELDS)) throw invalidConfig();

  const arrays = {} as Record<"allowedRoots" | "blockedRoots" | "blockedPaths", readonly string[]>;
  for (const field of ["allowedRoots", "blockedRoots", "blockedPaths"] as const) {
    const candidate = value[field];
    if (candidate !== undefined && (!Array.isArray(candidate) || !candidate.every(isAbsolutePolicyPath))) {
      throw invalidConfig();
    }
    arrays[field] = Object.freeze(
      (candidate === undefined ? [] : candidate.map((path) => {
        const normalized = resolveExistingPath(normalizePolicyPath(path));
        if (normalized === undefined) throw invalidConfig();
        return normalized;
      })),
    );
  }

  const writeMode = modeOrDefault(value.write, "deny");
  const editMode = value.edit === undefined ? writeMode : modeOrDefault(value.edit, "deny");

  return {
    read: modeOrDefault(value.read, "deny"),
    write: writeMode,
    edit: editMode,
    list: modeOrDefault(value.list, "deny"),
    search: modeOrDefault(value.search, "deny"),
    ...arrays,
  };
}

function readCommands(value: unknown): {
  readonly inspect: ShellPolicyMode;
  readonly modify: ShellPolicyMode;
  readonly execute: ShellPolicyMode;
  readonly destroy: ShellPolicyMode;
  readonly unknown: ShellPolicyMode;
} {
  if (value === undefined) {
    return { inspect: "deny", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" };
  }
  if (!isRecord(value) || !hasOnlyKeys(value, COMMAND_FIELDS)) throw invalidConfig();
  return {
    inspect: modeOrDefault(value.inspect, "deny"),
    modify: modeOrDefault(value.modify, "deny"),
    execute: modeOrDefault(value.execute, "deny"),
    destroy: modeOrDefault(value.destroy, "deny"),
    unknown: modeOrDefault(value.unknown, "deny"),
  };
}

function invalidConfig(): TypeError {
  return new TypeError("invalid policy config");
}

export function adaptPolicyConfig(input: unknown): PolicySnapshot {
  if (!isRecord(input) || !hasOnlyKeys(input, ["paths", "commands"])) throw invalidConfig();
  const paths = readPaths(input.paths);
  const commands = readCommands(input.commands);
  const direct = freezePolicySnapshot({
    read: paths.read,
    write: paths.write,
    edit: paths.edit,
    list: paths.list,
    search: paths.search,
    allowedRoots: paths.allowedRoots,
    blockedRoots: paths.blockedRoots,
    blockedPaths: paths.blockedPaths,
  });
  const shell = freezeShellPolicySnapshot({
    read: paths.read,
    write: paths.write,
    inspect: commands.inspect,
    modify: commands.modify,
    execute: commands.execute,
    destroy: commands.destroy,
    unknown: commands.unknown,
    allowedRoots: paths.allowedRoots,
    blockedRoots: paths.blockedRoots,
    blockedPaths: paths.blockedPaths,
  });
  return Object.freeze({ direct, shell });
}
