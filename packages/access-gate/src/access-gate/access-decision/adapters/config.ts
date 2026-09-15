import { freezeUnifiedPolicySnapshot } from "../core/authorization/index";
import type { AuthorizationMode, UnifiedPolicySnapshot } from "../core/authorization/index";
import { createLinuxPathEvidence } from "../core/compilation/index";

type PolicyMode = AuthorizationMode;
type ShellPolicyMode = AuthorizationMode;

const POLICY_PATH_EVIDENCE = createLinuxPathEvidence();

export const POLICY_PRESET_NAMES = ["review", "guided", "develop"] as const;
export type BuiltinPolicyPresetName = (typeof POLICY_PRESET_NAMES)[number];
export type PolicyPresetName = string;
export type AccessGateMode = "off";

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
  readonly badge?: string;
}>;

export type PolicyConfig = PolicyDefinition & Readonly<{
  readonly presets?: Readonly<Record<PolicyPresetName, PolicyDefinition>>;
  readonly activePreset?: PolicyPresetName;
  readonly accessGate?: AccessGateMode;
}>;

export type DecodedPolicyConfiguration =
  | Readonly<{
      readonly kind: "off";
      readonly snapshots: Readonly<Record<string, UnifiedPolicySnapshot>>;
      readonly badges: Readonly<Record<string, string>>;
    }>
  | Readonly<{
      readonly kind: "enabled";
      readonly activePreset: string;
      readonly switchable: boolean;
      readonly snapshots: Readonly<Record<string, UnifiedPolicySnapshot>>;
      readonly badges: Readonly<Record<string, string>>;
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
const DEFINITION_FIELDS = ["paths", "commands", "badge"] as const;
const CONFIG_FIELDS = ["paths", "commands", "presets", "activePreset", "accessGate"] as const;
const REQUIRED_PATH_MODES = ["read", "write", "edit", "list", "search"] as const;
const REQUIRED_COMMAND_MODES = ["inspect", "modify", "execute", "opaque", "destroy", "unknown"] as const;
const PRESET_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const RESERVED_PRESET_NAMES = new Set([...POLICY_PRESET_NAMES, "status"]);

type NormalizedDefinition = Readonly<{
  readonly paths: ReturnType<typeof readPaths>;
  readonly commands: ReturnType<typeof readCommands>;
  readonly badge?: string;
}>;

const BUILTIN_POLICY_DEFINITIONS: Readonly<Record<BuiltinPolicyPresetName, NormalizedDefinition>> = Object.freeze({
  review: Object.freeze({
    paths: Object.freeze({
      read: "allow",
      write: "deny",
      edit: "deny",
      list: "allow",
      search: "allow",
      allowedRoots: Object.freeze([]),
      blockedRoots: Object.freeze([]),
      blockedPaths: Object.freeze([]),
    }),
    commands: Object.freeze({
      inspect: "allow",
      modify: "deny",
      execute: "deny",
      opaque: "deny",
      destroy: "deny",
      unknown: "deny",
    }),
  }),
  guided: Object.freeze({
    paths: Object.freeze({
      read: "allow",
      write: "ask",
      edit: "ask",
      list: "allow",
      search: "allow",
      allowedRoots: Object.freeze([]),
      blockedRoots: Object.freeze([]),
      blockedPaths: Object.freeze([]),
    }),
    commands: Object.freeze({
      inspect: "allow",
      modify: "ask",
      execute: "ask",
      opaque: "ask",
      destroy: "deny",
      unknown: "deny",
    }),
  }),
  develop: Object.freeze({
    paths: Object.freeze({
      read: "allow",
      write: "allow",
      edit: "allow",
      list: "allow",
      search: "allow",
      allowedRoots: Object.freeze([]),
      blockedRoots: Object.freeze([]),
      blockedPaths: Object.freeze([]),
    }),
    commands: Object.freeze({
      inspect: "allow",
      modify: "allow",
      execute: "allow",
      opaque: "allow",
      destroy: "deny",
      unknown: "ask",
    }),
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

function readPathArray(candidate: unknown): readonly string[] {
  if (!Array.isArray(candidate) || !candidate.every(isAbsolutePolicyPath)) {
    throw invalidConfig();
  }
  return Object.freeze(
    candidate.map((path) => {
      const normalized = POLICY_PATH_EVIDENCE.resolve("/", path)?.candidate;
      if (normalized === undefined) throw invalidConfig();
      return normalized;
    }),
  );
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
    arrays[field] = candidate === undefined ? Object.freeze([]) : readPathArray(candidate);
  }

  const read = modeOrDefault(value.read, "deny");
  const write = modeOrDefault(value.write, "deny");
  const edit = modeOrDefault(value.edit, "deny");
  if (modeRank(write) > modeRank(read) || modeRank(edit) > modeRank(read)) throw invalidConfig();

  return {
    read,
    write,
    edit,
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

function readBuiltinOverride(name: BuiltinPolicyPresetName, value: unknown): NormalizedDefinition {
  if (!isRecord(value) || !hasOnlyKeys(value, DEFINITION_FIELDS)) throw invalidConfig();
  if (value.badge !== undefined) throw invalidConfig();
  const builtin = BUILTIN_POLICY_DEFINITIONS[name];
  const pathsValue = value.paths;
  const commandsValue = value.commands;

  let allowedRoots = builtin.paths.allowedRoots;
  let blockedRoots = builtin.paths.blockedRoots;
  let blockedPaths = builtin.paths.blockedPaths;

  if (pathsValue !== undefined) {
    if (!isRecord(pathsValue) || !hasOnlyKeys(pathsValue, PATH_FIELDS)) throw invalidConfig();
    for (const field of REQUIRED_PATH_MODES) {
      const mode = pathsValue[field];
      if (mode !== undefined && mode !== builtin.paths[field]) throw invalidConfig();
    }
    if (pathsValue.allowedRoots !== undefined) allowedRoots = readPathArray(pathsValue.allowedRoots);
    if (pathsValue.blockedRoots !== undefined) blockedRoots = readPathArray(pathsValue.blockedRoots);
    if (pathsValue.blockedPaths !== undefined) blockedPaths = readPathArray(pathsValue.blockedPaths);
  }

  if (commandsValue !== undefined) {
    if (!isRecord(commandsValue) || !hasOnlyKeys(commandsValue, COMMAND_FIELDS)) throw invalidConfig();
    for (const field of REQUIRED_COMMAND_MODES) {
      const mode = commandsValue[field];
      if (mode !== undefined && mode !== builtin.commands[field]) throw invalidConfig();
    }
  }

  return Object.freeze({
    paths: Object.freeze({
      ...builtin.paths,
      allowedRoots,
      blockedRoots,
      blockedPaths,
    }),
    commands: builtin.commands,
  });
}

function readBadge(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw invalidConfig();
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 4 || /[\x00-\x1f\x7f]/.test(trimmed)) {
    throw invalidConfig();
  }
  return trimmed;
}

function readDefinition(
  value: unknown,
  requireSections: boolean,
  requireCompleteModes = false,
): NormalizedDefinition {
  if (!isRecord(value) || !hasOnlyKeys(value, DEFINITION_FIELDS)) throw invalidConfig();
  if ((requireSections || requireCompleteModes) && (value.paths === undefined || value.commands === undefined)) throw invalidConfig();
  return Object.freeze({
    paths: Object.freeze(readPaths(value.paths, requireCompleteModes)),
    commands: Object.freeze(readCommands(value.commands, requireCompleteModes)),
    badge: readBadge(value.badge),
  });
}

type ParsedPolicy = Readonly<{
  readonly flat?: NormalizedDefinition;
  readonly presets?: Readonly<Record<string, NormalizedDefinition>>;
  readonly activePreset?: PolicyPresetName;
  readonly off?: true;
}>;

function readConfig(input: unknown, requireCompleteExternalModes = false): ParsedPolicy {
  if (!isRecord(input) || !hasOnlyKeys(input, CONFIG_FIELDS)) throw invalidConfig();
  if (input.accessGate !== undefined) {
    if (input.accessGate !== "off" || Reflect.ownKeys(input).length !== 1) throw invalidConfig();
    return Object.freeze({ off: true });
  }
  if (input.presets !== undefined) {
    if (input.paths !== undefined || input.commands !== undefined || !isRecord(input.presets)) throw invalidConfig();
    const presets = {} as Record<string, NormalizedDefinition>;
    for (const [name, value] of Object.entries(input.presets)) {
      if (!isValidPresetName(name)) throw invalidConfig();
      presets[name] = isBuiltinPresetName(name)
        ? readBuiltinOverride(name, value)
        : readDefinition(value, true, requireCompleteExternalModes);
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

function unifiedSnapshotFor(definition: NormalizedDefinition): UnifiedPolicySnapshot {
  return freezeUnifiedPolicySnapshot({ paths: definition.paths, commands: definition.commands });
}

function computePresetBadges(
  presets: Readonly<Record<string, NormalizedDefinition>>,
): Readonly<Record<string, string>> {
  const badges: Record<string, string> = {
    review: "R",
    guided: "G",
    develop: "D",
  };
  const used = new Set<string>(Object.values(badges));

  const customNames = Object.keys(presets).filter((name) => !isBuiltinPresetName(name));

  for (const name of customNames) {
    const explicit = presets[name]?.badge;
    if (explicit !== undefined) {
      badges[name] = explicit;
      used.add(explicit);
    }
  }

  for (const name of customNames) {
    if (badges[name] !== undefined) continue;

    const candidates: string[] = [];

    if (name.includes("-")) {
      const initials = name
        .split("-")
        .filter((part) => part.length > 0)
        .map((part) => part[0]!.toUpperCase())
        .join("");
      if (initials.length >= 2 && initials.length <= 4) {
        candidates.push(initials);
      }
    }

    candidates.push(name.charAt(0).toUpperCase());

    if (name.length >= 2) {
      candidates.push(name.slice(0, 2).toUpperCase());
    }
    if (name.length >= 3) {
      candidates.push(name.slice(0, 3).toUpperCase());
    }
    if (name.length >= 4) {
      candidates.push(name.slice(0, 4).toUpperCase());
    }

    let chosen = candidates.find((cand) => !used.has(cand));

    if (!chosen) {
      const base = name.charAt(0).toUpperCase();
      for (let i = 2; i <= 9; i++) {
        const fallback = `${base}${i}`;
        if (!used.has(fallback)) {
          chosen = fallback;
          break;
        }
      }
    }

    chosen = chosen ?? name.slice(0, 3).toUpperCase();
    badges[name] = chosen;
    used.add(chosen);
  }

  return Object.freeze(badges);
}

export function decodePolicyConfiguration(
  input: unknown,
  requireCompleteExternalModes = false,
): DecodedPolicyConfiguration {
  const parsed = readConfig(input, requireCompleteExternalModes);
  if (parsed.off) {
    const snapshots: Record<string, UnifiedPolicySnapshot> = {};
    for (const name of POLICY_PRESET_NAMES) {
      snapshots[name] = unifiedSnapshotFor(BUILTIN_POLICY_DEFINITIONS[name]);
    }
    const badges = computePresetBadges({});
    return Object.freeze({
      kind: "off",
      snapshots: Object.freeze(snapshots),
      badges,
    });
  }
  if (parsed.flat !== undefined) {
    const staticBadge = parsed.flat.badge ?? "S";
    return Object.freeze({
      kind: "enabled",
      activePreset: "static",
      switchable: false,
      snapshots: Object.freeze({ static: unifiedSnapshotFor(parsed.flat) }),
      badges: Object.freeze({ static: staticBadge }),
    });
  }

  const snapshots: Record<string, UnifiedPolicySnapshot> = {};
  for (const name of POLICY_PRESET_NAMES) {
    const definition = parsed.presets?.[name] ?? BUILTIN_POLICY_DEFINITIONS[name];
    snapshots[name] = unifiedSnapshotFor(definition);
  }
  for (const [name, definition] of Object.entries(parsed.presets!)) {
    if (!isBuiltinPresetName(name)) snapshots[name] = unifiedSnapshotFor(definition);
  }
  const badges = computePresetBadges(parsed.presets ?? {});
  return Object.freeze({
    kind: "enabled",
    activePreset: parsed.activePreset!,
    switchable: true,
    snapshots: Object.freeze(snapshots),
    badges,
  });
}
