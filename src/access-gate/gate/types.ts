import type { ResolvedProfile } from "../profile/types";

export type GateResult =
  | { kind: "allow" }
  | { kind: "block"; reason: string };

export interface GateRuntime {
  hasUI: boolean;
  select?: (prompt: string, options: string[]) => Promise<string | undefined>;
}

export interface ToolCallInput {
  surface: string;
  args: Record<string, unknown>;
  cwd: string;
  projectRoot: string;
  stagingDir: string;
  profile: ResolvedProfile;
}
