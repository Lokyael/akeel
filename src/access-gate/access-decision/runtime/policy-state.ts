import { adaptPolicyConfig, adaptPolicyPresets } from "../adapters/index";
import type { PolicyPresetName, PolicyPresetSet, PolicySnapshot } from "../adapters/index";

export type PolicyState = Readonly<{
  readonly snapshot: PolicySnapshot;
  readonly activePreset?: PolicyPresetName;
  readonly presets?: PolicyPresetSet;
}>;

const ISSUED_STATES = new WeakSet<PolicyState>();

export function createPolicyState(config: unknown): PolicyState {
  const presets = adaptPolicyPresets(config);
  const state = presets === undefined
    ? Object.freeze({ snapshot: adaptPolicyConfig(config) })
    : Object.freeze({
        snapshot: presets.snapshots[presets.active],
        activePreset: presets.active,
        presets,
      });
  ISSUED_STATES.add(state);
  return state;
}

export function activatePolicyPreset(state: PolicyState, name: string): PolicyState {
  if (!isPolicyState(state) || state.presets === undefined || !Object.hasOwn(state.presets.snapshots, name)) {
    throw new TypeError("unknown policy preset");
  }
  const activePreset = name as PolicyPresetName;
  const next = Object.freeze({
    snapshot: state.presets.snapshots[activePreset],
    activePreset,
    presets: state.presets,
  });
  ISSUED_STATES.add(next);
  return next;
}

export function isPolicyState(value: unknown): value is PolicyState {
  return typeof value === "object" && value !== null && ISSUED_STATES.has(value as PolicyState);
}
