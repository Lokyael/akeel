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
export type PolicyPresetName = (typeof POLICY_PRESET_NAMES)[number];
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
  readonly snapshots: Readonly<Record<PolicyPresetName, PolicySnapshot>>;
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

function isAbsolutePolicyPath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.startsWith("/") && !value.includes("\u0000");
}

function invalidConfig(): TypeError {
  return new TypeError("invalid policy config");
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
        const normalized = resolveExistingPath(path);
        if (normalized === undefined) throw invalidConfig();
        return normalized;
      })),
    );
  }

  return {
    read: modeOrDefault(value.read, "deny"),
    write: modeOrDefault(value.write, "deny"),
    edit: modeOrDefault(value.edit, "deny"),
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
  if (value === undefined) return { inspect: "deny", modify: "deny", execute: "deny", destroy: "deny", unknown: "deny" };
  if (!isRecord(value) || !hasOnlyKeys(value, COMMAND_FIELDS)) throw invalidConfig();
  return {
    inspect: modeOrDefault(value.inspect, "deny"),
    modify: modeOrDefault(value.modify, "deny"),
    execute: modeOrDefault(value.execute, "deny"),
    destroy: modeOrDefault(value.destroy, "deny"),
    unknown: modeOrDefault(value.unknown, "deny"),
  };
}

function readDefinition(value: unknown, requireSections: boolean): PolicyDefinition {
  if (!isRecord(value) || !hasOnlyKeys(value, DEFINITION_FIELDS)) throw invalidConfig();
  if (requireSections && (value.paths === undefined || value.commands === undefined)) throw invalidConfig();
  if (value.paths !== undefined) readPaths(value.paths);
  if (value.commands !== undefined) readCommands(value.commands);
  return value as PolicyDefinition;
}

type ParsedPolicy = Readonly<{
  readonly flat?: PolicyDefinition;
  readonly presets?: Readonly<Record<PolicyPresetName, PolicyDefinition>>;
  readonly activePreset?: PolicyPresetName;
  readonly disabled?: true;
}>;

function readConfig(input: unknown): ParsedPolicy {
  if (!isRecord(input) || !hasOnlyKeys(input, CONFIG_FIELDS)) throw invalidConfig();
  if (input.accessGate !== undefined) {
    if (input.accessGate !== "disabled" || Reflect.ownKeys(input).length !== 1) throw invalidConfig();
    return Object.freeze({ disabled: true });
  }
  if (input.presets !== undefined) {
    if (input.paths !== undefined || input.commands !== undefined || !isRecord(input.presets) || !hasOnlyKeys(input.presets, POLICY_PRESET_NAMES)) {
      throw invalidConfig();
    }
    if (typeof input.activePreset !== "string" || !POLICY_PRESET_NAMES.includes(input.activePreset as PolicyPresetName)) throw invalidConfig();
    const presets = {} as Record<PolicyPresetName, PolicyDefinition>;
    for (const name of POLICY_PRESET_NAMES) presets[name] = readDefinition(input.presets[name], true);
    return Object.freeze({ presets: Object.freeze(presets), activePreset: input.activePreset as PolicyPresetName });
  }
  if (input.activePreset !== undefined) throw invalidConfig();
  return Object.freeze({ flat: readDefinition(input, false) });
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

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function presetSetFrom(parsed: ParsedPolicy): PolicyPresetSet | undefined {
  if (parsed.presets === undefined) return undefined;
  const snapshots = {} as Record<PolicyPresetName, PolicySnapshot>;
  for (const name of POLICY_PRESET_NAMES) snapshots[name] = snapshotFor(parsed.presets[name]);
  const baseline = snapshots.review.direct;
  for (const name of POLICY_PRESET_NAMES.slice(1)) {
    const current = snapshots[name].direct;
    if (!samePaths(baseline.allowedRoots, current.allowedRoots) ||
      !samePaths(baseline.blockedRoots, current.blockedRoots) ||
      !samePaths(baseline.blockedPaths, current.blockedPaths)) {
      throw invalidConfig();
    }
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
  return presetSetFrom(readConfig(input));
}

export function isAccessGateDisabled(input: unknown): boolean {
  return readConfig(input).disabled === true;
}
