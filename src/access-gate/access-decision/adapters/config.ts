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

export const POLICY_PRESET_NAMES = ["review", "guided", "develop"] as const;
export type BuiltinPolicyPresetName = (typeof POLICY_PRESET_NAMES)[number];
export type PolicyPresetName = string;
export type AccessGateMode = "disabled";

type PolicyDefinition = Readonly<{
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

export type PolicyConfig = PolicyDefinition & Readonly<{
  readonly presets?: Readonly<Record<PolicyPresetName, PolicyDefinition>>;
  readonly activePreset?: PolicyPresetName;
  readonly accessGate?: AccessGateMode;
}>;

export type PolicySnapshot = Readonly<{
  readonly direct: DirectPolicySnapshot;
  readonly shell: ShellPolicySnapshot;
}>;

export type PolicyPresetSet = Readonly<{
  readonly active: PolicyPresetName;
  readonly snapshots: Readonly<Record<string, PolicySnapshot>>;
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
const DEFINITION_FIELDS = ["paths", "commands"] as const;
const CONFIG_FIELDS = ["paths", "commands", "presets", "activePreset", "accessGate"] as const;
const REQUIRED_PATH_MODES = ["read", "write", "edit", "list", "search"] as const;
const REQUIRED_COMMAND_MODES = ["inspect", "modify", "execute", "destroy", "unknown"] as const;
const PRESET_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RESERVED_PRESET_NAMES = new Set([...POLICY_PRESET_NAMES, "status"]);

const BUILTIN_POLICY_DEFINITIONS: Readonly<Record<BuiltinPolicyPresetName, PolicyDefinition>> = Object.freeze({
  review: Object.freeze({
    paths: Object.freeze({ read: "allow", list: "allow", search: "allow", write: "deny", edit: "deny" }),
    commands: Object.freeze({ inspect: "allow", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" }),
  }),
  guided: Object.freeze({
    paths: Object.freeze({ read: "allow", list: "allow", search: "allow", write: "ask", edit: "ask" }),
    commands: Object.freeze({ inspect: "allow", modify: "ask", execute: "ask", destroy: "deny", unknown: "deny" }),
  }),
  develop: Object.freeze({
    paths: Object.freeze({ read: "allow", list: "allow", search: "allow", write: "allow", edit: "allow" }),
    commands: Object.freeze({ inspect: "allow", modify: "allow", execute: "allow", destroy: "deny", unknown: "ask" }),
  }),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === "string" && allowed.includes(key));
}

function modeOrDefault(value: unknown, fallback: PolicyMode): PolicyMode {
  if (value === undefined) return fallback;
  if (!(POLICY_MODES as readonly unknown[]).includes(value)) throw invalidConfig();
  return value as PolicyMode;
}

function modeRank(mode: PolicyMode): number {
  return mode === "allow" ? 2 : mode === "ask" ? 1 : 0;
}

function isAbsolutePolicyPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.startsWith("/") && !value.includes("\u0000");
}

function invalidConfig(): TypeError {
  return new TypeError("invalid policy config");
}

function isBuiltinPresetName(name: string): name is BuiltinPolicyPresetName {
  return POLICY_PRESET_NAMES.includes(name as BuiltinPolicyPresetName);
}

function isValidPresetName(name: string): boolean {
  return PRESET_NAME_PATTERN.test(name) && (isBuiltinPresetName(name) || !RESERVED_PRESET_NAMES.has(name));
}

function requireFields(value: Record<string, unknown>, fields: readonly string[]): void {
  if (!fields.every((field) => Object.hasOwn(value, field) && value[field] !== undefined)) throw invalidConfig();
}

function readPaths(value: unknown, requireCompleteModes = false): {
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
    if (requireCompleteModes) throw invalidConfig();
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
  if (requireCompleteModes) requireFields(value, REQUIRED_PATH_MODES);

  const arrays = {} as Record<"allowedRoots" | "blockedRoots" | "blockedPaths", readonly string[]>;
  for (const field of ["allowedRoots", "blockedRoots", "blockedPaths"] as const) {
    const candidate = value[field];
    if (candidate !== undefined && (!Array.isArray(candidate) || !candidate.every(isAbsolutePolicyPath))) {
      throw invalidConfig();
    }
    arrays[field] = Object.freeze(
      (candidate === undefined ? [] : candidate.map((path) => {
        const normalized = resolveExistingPath(path);
        if (normalized === undefined) throw invalidConfig();
        return normalized;
      })),
    );
  }

  const read = modeOrDefault(value.read, "deny");
  const write = modeOrDefault(value.write, "deny");
  if (modeRank(write) > modeRank(read)) throw invalidConfig();

  return {
    read,
    write,
    edit: modeOrDefault(value.edit, "deny"),
    list: modeOrDefault(value.list, "deny"),
    search: modeOrDefault(value.search, "deny"),
    ...arrays,
  };
}

function readCommands(value: unknown, requireCompleteModes = false): {
  readonly inspect: ShellPolicyMode;
  readonly modify: ShellPolicyMode;
  readonly execute: ShellPolicyMode;
  readonly destroy: ShellPolicyMode;
  readonly unknown: ShellPolicyMode;
} {
  if (value === undefined) {
    if (requireCompleteModes) throw invalidConfig();
    return { inspect: "deny", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" };
  }
  if (!isRecord(value) || !hasOnlyKeys(value, COMMAND_FIELDS)) throw invalidConfig();
  if (requireCompleteModes) requireFields(value, REQUIRED_COMMAND_MODES);
  return {
    inspect: modeOrDefault(value.inspect, "deny"),
    modify: modeOrDefault(value.modify, "deny"),
    execute: modeOrDefault(value.execute, "deny"),
    destroy: modeOrDefault(value.destroy, "deny"),
    unknown: modeOrDefault(value.unknown, "deny"),
  };
}

function readDefinition(value: unknown, requireSections: boolean, requireCompleteModes = false): PolicyDefinition {
  if (!isRecord(value) || !hasOnlyKeys(value, DEFINITION_FIELDS)) throw invalidConfig();
  if ((requireSections || requireCompleteModes) && (value.paths === undefined || value.commands === undefined)) throw invalidConfig();
  if (value.paths !== undefined) readPaths(value.paths, requireCompleteModes);
  if (value.commands !== undefined) readCommands(value.commands, requireCompleteModes);
  return value as PolicyDefinition;
}

type ParsedPolicy = Readonly<{
  readonly flat?: PolicyDefinition;
  readonly presets?: Readonly<Record<string, PolicyDefinition>>;
  readonly activePreset?: PolicyPresetName;
  readonly disabled?: true;
}>;

function readConfig(input: unknown, requireCompleteExternalModes = false): ParsedPolicy {
  if (!isRecord(input) || !hasOnlyKeys(input, CONFIG_FIELDS)) throw invalidConfig();
  if (input.accessGate !== undefined) {
    if (input.accessGate !== "disabled" || Reflect.ownKeys(input).length !== 1) throw invalidConfig();
    return Object.freeze({ disabled: true });
  }
  if (input.presets !== undefined) {
    if (input.paths !== undefined || input.commands !== undefined || !isRecord(input.presets)) throw invalidConfig();
    const presets = {} as Record<string, PolicyDefinition>;
    for (const [name, value] of Object.entries(input.presets)) {
      if (!isValidPresetName(name)) throw invalidConfig();
      presets[name] = readDefinition(
        value,
        !isBuiltinPresetName(name),
        requireCompleteExternalModes && !isBuiltinPresetName(name),
      );
    }
    if (typeof input.activePreset !== "string" ||
      (!isBuiltinPresetName(input.activePreset) && !Object.hasOwn(presets, input.activePreset))) {
      throw invalidConfig();
    }
    return Object.freeze({ presets: Object.freeze(presets), activePreset: input.activePreset });
  }
  if (input.activePreset !== undefined) throw invalidConfig();
  return Object.freeze({ flat: readDefinition(input, false, requireCompleteExternalModes) });
}

function snapshotFor(definition: PolicyDefinition): PolicySnapshot {
  const paths = readPaths(definition.paths);
  const commands = readCommands(definition.commands);
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

function mergeBuiltinDefinition(name: BuiltinPolicyPresetName, supplied: PolicyDefinition | undefined): PolicyDefinition {
  const builtin = BUILTIN_POLICY_DEFINITIONS[name];
  if (supplied === undefined) return builtin;
  const merged = {
    paths: { ...builtin.paths, ...supplied.paths },
    commands: { ...builtin.commands, ...supplied.commands },
  };
  const expected = snapshotFor(builtin);
  const actual = snapshotFor(merged);
  if (actual.direct.read !== expected.direct.read ||
    actual.direct.write !== expected.direct.write ||
    actual.direct.edit !== expected.direct.edit ||
    actual.direct.list !== expected.direct.list ||
    actual.direct.search !== expected.direct.search ||
    actual.shell.inspect !== expected.shell.inspect ||
    actual.shell.modify !== expected.shell.modify ||
    actual.shell.execute !== expected.shell.execute ||
    actual.shell.destroy !== expected.shell.destroy ||
    actual.shell.unknown !== expected.shell.unknown) {
    throw invalidConfig();
  }
  return merged;
}

function presetSetFrom(parsed: ParsedPolicy): PolicyPresetSet | undefined {
  if (parsed.presets === undefined) return undefined;
  const snapshots: Record<string, PolicySnapshot> = {};
  for (const name of POLICY_PRESET_NAMES) {
    snapshots[name] = snapshotFor(mergeBuiltinDefinition(name, parsed.presets[name]));
  }
  for (const [name, definition] of Object.entries(parsed.presets)) {
    if (!isBuiltinPresetName(name)) snapshots[name] = snapshotFor(definition);
  }
  return Object.freeze({ active: parsed.activePreset!, snapshots: Object.freeze(snapshots) });
}

export function adaptPolicyConfig(input: unknown): PolicySnapshot {
  const parsed = readConfig(input);
  if (parsed.disabled) return snapshotFor({});
  if (parsed.flat !== undefined) return snapshotFor(parsed.flat);
  const presets = presetSetFrom(parsed);
  return presets!.snapshots[presets!.active];
}

export function adaptPolicyPresets(input: unknown): PolicyPresetSet | undefined {
  const parsed = readConfig(input);
  if (parsed.presets === undefined) return undefined;
  return presetSetFrom(readConfig(input, true));
}

export function validateExternalPolicyConfig(input: unknown): void {
  const parsed = readConfig(input, true);
  if (parsed.presets !== undefined) {
    presetSetFrom(parsed);
  } else if (parsed.flat !== undefined) {
    snapshotFor(parsed.flat);
  }
}

export function isAccessGateDisabled(input: unknown): boolean {
  return readConfig(input).disabled === true;
}
