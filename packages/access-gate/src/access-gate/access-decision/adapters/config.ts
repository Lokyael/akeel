import { freezeUnifiedPolicySnapshot } from "../core/authorization/index";
import type { AuthorizationMode, UnifiedPolicySnapshot } from "../core/authorization/index";
import { createLinuxPathEvidence } from "../core/compilation/index";

type PolicyMode = AuthorizationMode;
type ShellPolicyMode = AuthorizationMode;

const POLICY_PATH_EVIDENCE = createLinuxPathEvidence();

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
    readonly opaque?: ShellPolicyMode;
    readonly destroy?: ShellPolicyMode;
    readonly unknown?: ShellPolicyMode;
  }>;
}>;

export type PolicyConfig = PolicyDefinition & Readonly<{
  readonly presets?: Readonly<Record<PolicyPresetName, PolicyDefinition>>;
  readonly activePreset?: PolicyPresetName;
  readonly accessGate?: AccessGateMode;
}>;

export type DecodedPolicyConfiguration =
  | Readonly<{ readonly kind: "disabled" }>
  | Readonly<{
      readonly kind: "enabled";
      readonly activePreset: string;
      readonly switchable: boolean;
      readonly snapshots: Readonly<Record<string, UnifiedPolicySnapshot>>;
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
const COMMAND_FIELDS = ["inspect", "modify", "execute", "opaque", "destroy", "unknown"] as const;
const DEFINITION_FIELDS = ["paths", "commands"] as const;
const CONFIG_FIELDS = ["paths", "commands", "presets", "activePreset", "accessGate"] as const;
const REQUIRED_PATH_MODES = ["read", "write", "edit", "list", "search"] as const;
const REQUIRED_COMMAND_MODES = ["inspect", "modify", "execute", "opaque", "destroy", "unknown"] as const;
const PRESET_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RESERVED_PRESET_NAMES = new Set([...POLICY_PRESET_NAMES, "status"]);

const BUILTIN_POLICY_DEFINITIONS: Readonly<Record<BuiltinPolicyPresetName, PolicyDefinition>> = Object.freeze({
  review: Object.freeze({
    paths: Object.freeze({ read: "allow", list: "allow", search: "allow", write: "deny", edit: "deny" }),
    commands: Object.freeze({ inspect: "allow", modify: "deny", execute: "deny", opaque: "deny", destroy: "deny", unknown: "deny" }),
  }),
  guided: Object.freeze({
    paths: Object.freeze({ read: "allow", list: "allow", search: "allow", write: "ask", edit: "ask" }),
    commands: Object.freeze({ inspect: "allow", modify: "ask", execute: "ask", opaque: "ask", destroy: "deny", unknown: "deny" }),
  }),
  develop: Object.freeze({
    paths: Object.freeze({ read: "allow", list: "allow", search: "allow", write: "allow", edit: "allow" }),
    commands: Object.freeze({ inspect: "allow", modify: "allow", execute: "allow", opaque: "allow", destroy: "deny", unknown: "ask" }),
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
        const normalized = POLICY_PATH_EVIDENCE.resolve("/", path)?.candidate;
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
  readonly opaque: ShellPolicyMode;
  readonly destroy: ShellPolicyMode;
  readonly unknown: ShellPolicyMode;
} {
  if (value === undefined) {
    if (requireCompleteModes) throw invalidConfig();
    return { inspect: "deny", modify: "deny", execute: "deny", opaque: "deny", destroy: "deny", unknown: "deny" };
  }
  if (!isRecord(value) || !hasOnlyKeys(value, COMMAND_FIELDS)) throw invalidConfig();
  if (requireCompleteModes) requireFields(value, REQUIRED_COMMAND_MODES);
  return {
    inspect: modeOrDefault(value.inspect, "deny"),
    modify: modeOrDefault(value.modify, "deny"),
    execute: modeOrDefault(value.execute, "deny"),
    opaque: modeOrDefault(value.opaque, "deny"),
    destroy: modeOrDefault(value.destroy, "deny"),
    unknown: modeOrDefault(value.unknown, "deny"),
  };
}

type NormalizedDefinition = Readonly<{
  readonly paths: ReturnType<typeof readPaths>;
  readonly commands: ReturnType<typeof readCommands>;
}>;

const normalizedDefinitions = new WeakMap<object, NormalizedDefinition>();

function normalizedDefinition(definition: PolicyDefinition): NormalizedDefinition {
  const cached = normalizedDefinitions.get(definition);
  if (cached !== undefined) return cached;
  const normalized = Object.freeze({
    paths: readPaths(definition.paths),
    commands: readCommands(definition.commands),
  });
  normalizedDefinitions.set(definition, normalized);
  return normalized;
}

function readDefinition(value: unknown, requireSections: boolean, requireCompleteModes = false): PolicyDefinition {
  if (!isRecord(value) || !hasOnlyKeys(value, DEFINITION_FIELDS)) throw invalidConfig();
  if ((requireSections || requireCompleteModes) && (value.paths === undefined || value.commands === undefined)) throw invalidConfig();
  const definition = value as PolicyDefinition;
  normalizedDefinitions.set(definition, Object.freeze({
    paths: readPaths(value.paths, requireCompleteModes),
    commands: readCommands(value.commands, requireCompleteModes),
  }));
  return definition;
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

function unifiedSnapshotFor(definition: PolicyDefinition): UnifiedPolicySnapshot {
  const { paths, commands } = normalizedDefinition(definition);
  return freezeUnifiedPolicySnapshot({ paths, commands });
}

function mergeBuiltinDefinition(name: BuiltinPolicyPresetName, supplied: PolicyDefinition | undefined): PolicyDefinition {
  const builtin = BUILTIN_POLICY_DEFINITIONS[name];
  if (supplied === undefined) return builtin;
  for (const field of REQUIRED_PATH_MODES) {
    if (supplied.paths?.[field] !== undefined && supplied.paths[field] !== builtin.paths?.[field]) throw invalidConfig();
  }
  for (const field of REQUIRED_COMMAND_MODES) {
    if (supplied.commands?.[field] !== undefined && supplied.commands[field] !== builtin.commands?.[field]) throw invalidConfig();
  }
  const merged = Object.freeze({
    paths: Object.freeze({ ...builtin.paths, ...supplied.paths }),
    commands: Object.freeze({ ...builtin.commands, ...supplied.commands }),
  });
  const builtinNormalized = normalizedDefinition(builtin);
  const suppliedNormalized = normalizedDefinition(supplied);
  normalizedDefinitions.set(merged, Object.freeze({
    paths: Object.freeze({
      ...builtinNormalized.paths,
      allowedRoots: supplied.paths?.allowedRoots === undefined
        ? builtinNormalized.paths.allowedRoots
        : suppliedNormalized.paths.allowedRoots,
      blockedRoots: supplied.paths?.blockedRoots === undefined
        ? builtinNormalized.paths.blockedRoots
        : suppliedNormalized.paths.blockedRoots,
      blockedPaths: supplied.paths?.blockedPaths === undefined
        ? builtinNormalized.paths.blockedPaths
        : suppliedNormalized.paths.blockedPaths,
    }),
    commands: builtinNormalized.commands,
  }));
  return merged;
}

export function decodePolicyConfiguration(
  input: unknown,
  requireCompleteExternalModes = false,
): DecodedPolicyConfiguration {
  const parsed = readConfig(input, requireCompleteExternalModes);
  if (parsed.disabled) return Object.freeze({ kind: "disabled" });
  if (parsed.flat !== undefined) {
    return Object.freeze({
      kind: "enabled",
      activePreset: "static",
      switchable: false,
      snapshots: Object.freeze({ static: unifiedSnapshotFor(parsed.flat) }),
    });
  }

  const snapshots: Record<string, UnifiedPolicySnapshot> = {};
  for (const name of POLICY_PRESET_NAMES) {
    snapshots[name] = unifiedSnapshotFor(mergeBuiltinDefinition(name, parsed.presets![name]));
  }
  for (const [name, definition] of Object.entries(parsed.presets!)) {
    if (!isBuiltinPresetName(name)) snapshots[name] = unifiedSnapshotFor(definition);
  }
  return Object.freeze({
    kind: "enabled",
    activePreset: parsed.activePreset!,
    switchable: true,
    snapshots: Object.freeze(snapshots),
  });
}
