import { adaptPolicyConfig } from "../adapters/index";
import type { PolicySnapshot } from "../adapters/index";

export type PolicyState = Readonly<{
  readonly snapshot: PolicySnapshot;
}>;

const ISSUED_STATES = new WeakSet<PolicyState>();

export function createPolicyState(config: unknown): PolicyState {
  const state = Object.freeze({ snapshot: adaptPolicyConfig(config) });
  ISSUED_STATES.add(state);
  return state;
}

export function isPolicyState(value: unknown): value is PolicyState {
  return typeof value === "object" && value !== null && ISSUED_STATES.has(value as PolicyState);
}
