import type { ResolvedProfile } from "../profile/types";
import type { DecisionCode } from "./decision-types";

export type GateResult =
  | { kind: "allow" }
  | { kind: "block"; reason: string; code: DecisionCode };

export interface GateRuntime {
  hasUI: boolean;
  select?: (prompt: string, options: string[]) => Promise<string | undefined>;
}

export interface ToolCallInput {
  surface: string;
  args: unknown;
  cwd: string;
  projectRoot: string;
  stagingDir: string;
  profile: ResolvedProfile;
}
